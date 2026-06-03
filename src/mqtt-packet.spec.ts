import { test, expect } from "vitest";

import {
    decodeFieldValue,
    decodeFields,
    FieldType,
    parseEnvelope,
    parseHeader,
    parsePacket,
    parseRawFields,
    roundByFactor,
    verifyChecksum,
} from "./mqtt-packet.js";
import { getFieldMap, SOLIXMQTTMAP } from "./mqttmap.js";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build a minimal valid Anker Solix binary packet from a header and raw field
 * bytes. Appends a correct XOR checksum byte.
 *
 * Header layout (9 bytes, direction=receive, no increment byte):
 *   FF 09  — magic
 *   LL LL  — total length LE (computed)
 *   03 01 0F — pattern
 *   MT MT  — message type
 */
function buildPacket(msgType: [number, number], ...fieldBytes: number[][]): Buffer {
    const fields = Buffer.from(fieldBytes.flat());
    // total = 2(prefix) + 2(len) + 3(pattern) + 2(msgtype) + fields.length + 1(checksum)
    const total = 9 + fields.length + 1;
    const header = Buffer.from([
        0xff, 0x09,
        total & 0xff, (total >> 8) & 0xff,
        0x03, 0x01, 0x0f,
        msgType[0], msgType[1],
    ]);
    const withoutChecksum = Buffer.concat([header, fields]);
    let xor = 0;
    for (let i = 0; i < withoutChecksum.length; i++) {
        xor ^= withoutChecksum.readUInt8(i);
    }
    return Buffer.concat([withoutChecksum, Buffer.from([xor])]);
}

// ─────────────────────────────────────────────────────────────────────────────
// roundByFactor
// ─────────────────────────────────────────────────────────────────────────────

test("roundByFactor rounds to factor precision", () => {
    expect(roundByFactor(1.0, 1)).toBe(1);
    expect(roundByFactor(75.1234, 1)).toBe(75);
    expect(roundByFactor(640.0, 0.1)).toBe(640);
    expect(roundByFactor(1.25, 0.1)).toBe(1.3);
    expect(roundByFactor(0.1234, 0.001)).toBe(0.123);
    expect(roundByFactor(0, 0.01)).toBe(0);
});

// ─────────────────────────────────────────────────────────────────────────────
// verifyChecksum
// ─────────────────────────────────────────────────────────────────────────────

test("verifyChecksum accepts a valid packet", () => {
    const pkt = buildPacket([0x04, 0x05]);
    expect(verifyChecksum(pkt)).toBe(true);
});

test("verifyChecksum rejects a corrupted packet", () => {
    const pkt = Buffer.from(buildPacket([0x04, 0x05]));
    pkt.writeUInt8(pkt.readUInt8(5) ^ 0xff, 5); // flip a byte
    expect(verifyChecksum(pkt)).toBe(false);
});

// ─────────────────────────────────────────────────────────────────────────────
// parseHeader
// ─────────────────────────────────────────────────────────────────────────────

test("parseHeader extracts msgType and direction", () => {
    // Include a field byte so the checksum lands at position 10+, not position 9
    // (otherwise the checksum value might not be in 0xA0–0xA9 and gets mis-read
    // as an increment byte).
    const pkt = buildPacket([0x04, 0x05], [0xa0, 0x01, 0x00]);
    const { header, fieldsStart } = parseHeader(pkt);
    expect(header.msgType).toBe("0405");
    expect(header.direction).toBe("receive");
    expect(header.incrementByte).toBeUndefined();
    expect(fieldsStart).toBe(9);
});

test("parseHeader detects increment byte", () => {
    // Manually build a packet with byte[9] = 0x05 (< 0xA0 → increment byte)
    const base = buildPacket([0x04, 0x05]);
    // Insert 0x05 at position 9, shift everything else
    const withIncrement = Buffer.concat([base.subarray(0, 9), Buffer.from([0x05]), base.subarray(9)]);
    // Recompute checksum
    let xor = 0;
    for (let i = 0; i < withIncrement.length - 1; i++) {
        xor ^= withIncrement.readUInt8(i);
    }
    withIncrement.writeUInt8(xor, withIncrement.length - 1);

    const { header, fieldsStart } = parseHeader(withIncrement);
    expect(header.incrementByte).toBe(0x05);
    expect(fieldsStart).toBe(10);
});

test("parseHeader rejects short buffer", () => {
    expect(() => parseHeader(Buffer.from([0xff, 0x09]))).toThrow(RangeError);
});

test("parseHeader rejects wrong magic", () => {
    const bad = Buffer.alloc(10, 0x00);
    bad.writeUInt8(0xde, 0);
    bad.writeUInt8(0xad, 1);
    expect(() => parseHeader(bad)).toThrow();
});

// ─────────────────────────────────────────────────────────────────────────────
// parseRawFields
// ─────────────────────────────────────────────────────────────────────────────

test("parseRawFields extracts a ui field (battery_soc = 75)", () => {
    // field 0xA1: length=2 (type + 1 byte), type=0x01 (ui), value=0x4B (75)
    const pkt = buildPacket([0x04, 0x05], [0xa1, 0x02, 0x01, 0x4b]);
    const { fieldsStart } = parseHeader(pkt);
    const fields = parseRawFields(pkt, fieldsStart);

    const f = fields.get(0xa1);
    expect(f).toBeTruthy();
    expect(f!.type).toBe(FieldType.ui);
    expect(f!.data.length).toBe(1);
    expect(f!.data.readUInt8(0)).toBe(75);
});

test("parseRawFields extracts a str field (device_sn)", () => {
    const sn = "ABC123";
    const snBytes = Buffer.from(sn, "ascii");
    // field 0xA2: length = 1(type) + 6(str) = 7, type=0x00, value=sn
    const field = [0xa2, 0x07, 0x00, ...snBytes];
    const pkt = buildPacket([0x04, 0x05], field);
    const { fieldsStart } = parseHeader(pkt);
    const fields = parseRawFields(pkt, fieldsStart);

    const f = fields.get(0xa2);
    expect(f).toBeTruthy();
    expect(f!.type).toBe(FieldType.str);
    expect(f!.data.toString("ascii")).toBe(sn);
});

test("parseRawFields extracts multiple fields", () => {
    // a1 = ui(75), a2 = sile(300)
    const pkt = buildPacket(
        [0x04, 0x05],
        [0xa1, 0x02, 0x01, 0x4b],                          // battery_soc=75
        [0xa2, 0x03, 0x02, 0x2c, 0x01],                    // sile LE: 0x012c = 300
    );
    const { fieldsStart } = parseHeader(pkt);
    const fields = parseRawFields(pkt, fieldsStart);

    expect(fields.size).toBe(2);
    expect(fields.has(0xa1)).toBe(true);
    expect(fields.has(0xa2)).toBe(true);
});

test("parseRawFields handles single-byte field (no type byte)", () => {
    // field 0xA1: length=1, no type byte, value=0x4b
    const pkt = buildPacket([0x04, 0x05], [0xa1, 0x01, 0x4b]);
    const { fieldsStart } = parseHeader(pkt);
    const fields = parseRawFields(pkt, fieldsStart);

    const f = fields.get(0xa1);
    expect(f).toBeTruthy();
    expect(f!.type).toBeUndefined();
    expect(f!.data.readUInt8(0)).toBe(0x4b);
});

// ─────────────────────────────────────────────────────────────────────────────
// decodeFieldValue — individual type tests
// ─────────────────────────────────────────────────────────────────────────────

test("decodeFieldValue: ui type → unsigned int", () => {
    const data = Buffer.from([75]);
    const result = decodeFieldValue(data, FieldType.ui, { name: "battery_soc" });
    expect(result).toEqual({ battery_soc: 75 });
});

test("decodeFieldValue: ui type with factor", () => {
    const data = Buffer.from([150]); // 150 * 0.1 = 15.0
    const result = decodeFieldValue(data, FieldType.ui, { name: "remaining_time_hours", factor: 0.1 });
    expect(result).toEqual({ remaining_time_hours: 15 });
});

test("decodeFieldValue: ui type signed (negative temperature)", () => {
    // -5 as signed uint8 = 251 = 0xFB
    const data = Buffer.from([0xfb]);
    const result = decodeFieldValue(data, FieldType.ui, { name: "temperature", signed: true });
    expect(result).toEqual({ temperature: -5 });
});

test("decodeFieldValue: sile type → signed int LE", () => {
    // 300 in LE = 0x2C 0x01
    const data = Buffer.from([0x2c, 0x01]);
    const result = decodeFieldValue(data, FieldType.sile, { name: "ac_input_power" });
    expect(result).toEqual({ ac_input_power: 300 });
});

test("decodeFieldValue: sile type negative", () => {
    // -5 in signed LE 2-byte = 0xFB 0xFF
    const data = Buffer.from([0xfb, 0xff]);
    const result = decodeFieldValue(data, FieldType.sile, { name: "battery_power_signed" });
    expect(result).toEqual({ battery_power_signed: -5 });
});

test("decodeFieldValue: var type default (4-byte signed LE)", () => {
    // 86400 = 0x00015180 → LE: 80 51 01 00
    const data = Buffer.allocUnsafe(4);
    data.writeInt32LE(86400, 0);
    const result = decodeFieldValue(data, FieldType.var, { name: "ac_output_timeout_seconds" });
    expect(result).toEqual({ ac_output_timeout_seconds: 86400 });
});

test("decodeFieldValue: var type values=1 (firmware version)", () => {
    // Single-byte value 42
    const data = Buffer.from([42, 0, 0, 0]);
    const result = decodeFieldValue(data, FieldType.var, { name: "sw_version", values: 1 });
    expect(result).toEqual({ sw_version: "42" });
});

test("decodeFieldValue: var type values=4 (version array)", () => {
    const data = Buffer.from([1, 2, 3, 4]);
    const result = decodeFieldValue(data, FieldType.var, { name: "sw_version", values: 4 });
    expect(result).toEqual({ sw_version: "1.2.3.4" });
});

test("decodeFieldValue: sfle type → float", () => {
    const data = Buffer.allocUnsafe(4);
    data.writeFloatLE(12.5, 0);
    const result = decodeFieldValue(data, FieldType.sfle, { name: "some_float" });
    expect(Math.abs((result["some_float"] as number) - 12.5)).toBeLessThan(0.001);
});

test("decodeFieldValue: str type", () => {
    const data = Buffer.from("ABCD1234", "ascii");
    const result = decodeFieldValue(data, FieldType.str, { name: "device_sn" });
    expect(result).toEqual({ device_sn: "ABCD1234" });
});

test("decodeFieldValue: bin type with bitmask (byte 0)", () => {
    // byte[0] = 0x03 → grid_export_disabled bit 0 = 1
    const data = Buffer.from([0x03]);
    const result = decodeFieldValue(data, FieldType.bin, {
        bytes: { "0": [{ name: "grid_export_disabled", mask: 0x01 }] },
    });
    expect(result).toEqual({ grid_export_disabled: 1 });
});

test("decodeFieldValue: bin type with dict sub-fields", () => {
    // byte[0] = 2 (dc_12v_output_mode), byte[1] = 1 (ac_output_mode)
    const data = Buffer.from([2, 1]);
    const result = decodeFieldValue(data, FieldType.bin, {
        bytes: {
            "0": { name: "dc_12v_output_mode", type: FieldType.ui },
            "1": { name: "ac_output_mode", type: FieldType.ui },
        },
    });
    expect(result).toEqual({ dc_12v_output_mode: 2, ac_output_mode: 1 });
});

test("decodeFieldValue: bin type with fixed-length string sub-field", () => {
    // 16-byte SN string at offset 0
    const sn = "SN00000000000001";
    const data = Buffer.alloc(20, 0);
    Buffer.from(sn, "ascii").copy(data, 0);
    const result = decodeFieldValue(data, FieldType.bin, {
        bytes: {
            "0": { name: "device_sn", length: 16, type: FieldType.str },
        },
    });
    expect(result).toEqual({ device_sn: sn });
});

test("decodeFieldValue: no name → empty result", () => {
    const data = Buffer.from([42]);
    const result = decodeFieldValue(data, FieldType.ui, {});
    expect(result).toEqual({});
});

// ─────────────────────────────────────────────────────────────────────────────
// decodeFields
// ─────────────────────────────────────────────────────────────────────────────

test("decodeFields maps fields to named values", () => {
    const fields = new Map([
        [0xa1, { id: 0xa1, type: FieldType.ui as number, data: Buffer.from([75]) }],
        [0xa2, { id: 0xa2, type: FieldType.str as number, data: Buffer.from("TESTSERIAL", "ascii") }],
    ]);
    const fieldMap = {
        a1: { name: "battery_soc" },
        a2: { name: "device_sn" },
    };
    const result = decodeFields(fields, fieldMap);
    expect(result["battery_soc"]).toBe(75);
    expect(result["device_sn"]).toBe("TESTSERIAL");
});

test("decodeFields skips unknown field IDs", () => {
    const fields = new Map([
        [0xff, { id: 0xff, type: FieldType.ui as number, data: Buffer.from([1]) }],
    ]);
    const result = decodeFields(fields, { a1: { name: "battery_soc" } });
    expect(result).toEqual({});
});

// ─────────────────────────────────────────────────────────────────────────────
// parseEnvelope
// ─────────────────────────────────────────────────────────────────────────────

test("parseEnvelope decodes double-encoded JSON with base64 binary", () => {
    const binary = Buffer.from([0x01, 0x02, 0x03]);
    const inner = JSON.stringify({ pn: "A17C1", sn: "SN001", data: binary.toString("base64") });
    const outer = JSON.stringify({ head: { timestamp: 1234567890 }, payload: inner });

    const result = parseEnvelope(outer);
    expect(result.pn).toBe("A17C1");
    expect(result.sn).toBe("SN001");
    expect(result.binaryData).toBeTruthy();
    expect(Array.from(result.binaryData!)).toEqual([0x01, 0x02, 0x03]);
    expect(result.jsonData).toBeNull();
    expect((result.head as { timestamp: number }).timestamp).toBe(1234567890);
});

test("parseEnvelope decodes trans (X1/HES) JSON payload", () => {
    const innerJson = { key: "value" };
    const trans = Buffer.from(JSON.stringify(innerJson), "utf8").toString("base64");
    const inner = JSON.stringify({ pn: "X1", sn: "SN002", trans });
    const outer = JSON.stringify({ head: {}, payload: inner });

    const result = parseEnvelope(outer);
    expect(result.pn).toBe("X1");
    expect(result.binaryData).toBeNull();
    expect(result.jsonData).toEqual(innerJson);
});

// ─────────────────────────────────────────────────────────────────────────────
// parsePacket end-to-end
// ─────────────────────────────────────────────────────────────────────────────

test("parsePacket decodes a battery_soc field with field map", () => {
    const pkt = buildPacket(
        [0x04, 0x05],
        [0xa1, 0x02, 0x01, 75], // ui field a1 = 75
    );
    const fieldMap = { a1: { name: "battery_soc" } };
    const result = parsePacket(pkt, fieldMap);

    expect(result.checksumOk).toBe(true);
    expect(result.header.msgType).toBe("0405");
    expect(result.decoded["battery_soc"]).toBe(75);
});

test("parsePacket with no field map returns empty decoded", () => {
    const pkt = buildPacket([0x04, 0x05], [0xa1, 0x02, 0x01, 75]);
    const result = parsePacket(pkt);
    expect(result.decoded).toEqual({});
    expect(result.rawFields.has(0xa1)).toBe(true);
});

test("parsePacket multi-field with C300 DC field map", () => {
    // Build a packet with battery_soc (0xa1) and temperature (0xa2, signed)
    // battery_soc = 80
    // temperature = -3 → as signed ui → 0xFD
    const pkt = buildPacket(
        [0x04, 0x05],
        [0xa1, 0x02, 0x01, 80],       // battery_soc
        [0xa2, 0x02, 0x01, 0xfd],     // temperature = -3 (but a2 is timeout in C300 map)
    );
    const { header, rawFields, checksumOk } = parsePacket(pkt);
    expect(checksumOk).toBe(true);
    expect(header.msgType).toBe("0405");
    expect(rawFields.size).toBe(2);
});

// ─────────────────────────────────────────────────────────────────────────────
// SOLIXMQTTMAP / getFieldMap
// ─────────────────────────────────────────────────────────────────────────────

test("getFieldMap returns field map for known model+type", () => {
    const map = getFieldMap("A17C1", "0405");
    expect(map).toBeTruthy();
    expect(map!["a2"]).toBeTruthy();
    expect(map!["a2"]?.name).toBe("device_sn");
});

test("getFieldMap is case-insensitive for message type", () => {
    const lower = getFieldMap("A17C1", "040a");
    const upper = getFieldMap("A17C1", "040A");
    expect(lower).toEqual(upper);
});

test("getFieldMap returns undefined for unknown model", () => {
    expect(getFieldMap("UNKNOWN", "0405")).toBeUndefined();
});

test("SOLIXMQTTMAP includes all expected device models", () => {
    const models = Object.keys(SOLIXMQTTMAP);
    for (const expected of ["A1722", "A1728", "A1761", "A17C1", "A17C5"]) {
        expect(models.includes(expected)).toBe(true);
    }
});
