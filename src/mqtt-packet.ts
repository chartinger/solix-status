/**
 * Anker Solix MQTT binary packet parser.
 *
 * Implements the custom TLV-like binary protocol used by Anker Solix devices
 * (PPS, Solarbank, EV Charger, etc.) over MQTT/TLS.
 *
 * Protocol overview
 * ─────────────────
 * Cloud → client messages arrive as a JSON envelope whose `payload` field is
 * itself a JSON-encoded string containing a `data` key with a base64-encoded
 * binary blob.
 *
 * Binary blob layout:
 *   [HEADER: 9–10 bytes] [FIELD_1] … [FIELD_N] [CHECKSUM: 1 byte]
 *
 * Each field:
 *   [field_id: 1 B] [length: 1–2 B LE] [type: 0–1 B] [value: N B]
 *
 * The last byte of the packet is an XOR checksum over all bytes; a valid
 * packet XORs to 0x00.
 *
 * Reference: https://github.com/thomluther/anker-solix-api (api/mqtttypes.py)
 */

// ─────────────────────────────────────────────────────────────────────────────
// Field type byte constants
// ─────────────────────────────────────────────────────────────────────────────

/** All field type bytes used in the Anker Solix binary protocol. */
export const FieldType = {
  /** UTF-8 string, variable length. */
  str: 0x00,
  /** 1-byte unsigned integer. */
  ui: 0x01,
  /** 2-byte signed integer, little-endian. */
  sile: 0x02,
  /** 4-byte polymorphic integer (or list of bytes), little-endian. */
  var: 0x03,
  /** Multi-byte bitmap / sub-field pattern. */
  bin: 0x04,
  /** 4-byte IEEE 754 single-precision float, little-endian. */
  sfle: 0x05,
  /** Sequential mixed sub-fields. */
  strb: 0x06,
  /** JSON-encoded string (auto-detected). */
  json: 0xfe,
} as const;

export type FieldTypeValue = (typeof FieldType)[keyof typeof FieldType];

// ─────────────────────────────────────────────────────────────────────────────
// Field map types (mirror Python mqttmap.py structure)
// ─────────────────────────────────────────────────────────────────────────────

/** A single bitmask entry inside a BYTES list. */
export interface BitmapEntry {
  name: string;
  mask: number;
}

/**
 * Descriptor for a single named data field (or sub-field).
 * Mirrors the Python `mqttcmdmap` constants: NAME, TYPE, FACTOR, SIGNED, BYTES,
 * LENGTH, MASK, OFFSET, "values".
 */
export interface FieldDescriptor {
  /** Output key name for the decoded value. */
  name?: string;
  /** Field type byte (FieldType.*). Used as a fallback when the raw type is absent. */
  type?: number;
  /** Multiply decoded numeric value by this factor. */
  factor?: number;
  /** Override sign behaviour. `true` = force signed, `false` = force unsigned. */
  signed?: boolean;
  /** Byte length for sub-fields. 0 means "first byte is a length prefix". */
  length?: number;
  /** Relative byte offset for list-mode strb fields. */
  offset?: number;
  /**
   * For `var` (0x03) type: number of values to read.
   * 1 = 1-byte uint, 2 = 2-byte signed LE, 4 = array of 4 individual bytes,
   * 0 (default) = single 4-byte signed LE int.
   */
  values?: 1 | 2 | 4;
  /**
   * Sub-field map for `bin` / `strb` types:
   * - Record keyed by decimal offset string → FieldDescriptor or BitmapEntry[].
   * - FieldDescriptor[] for list-mode (relative sequential) strb.
   */
  bytes?:
    | Record<string, FieldDescriptor | BitmapEntry[]>
    | FieldDescriptor[];
  /** Human-readable topic label (e.g. "param_info"). Not used in decoding. */
  topic?: string;
}

/** Map from lowercase hex field-id string (e.g. "a2") to its descriptor. */
export type FieldMap = Record<string, FieldDescriptor>;

// ─────────────────────────────────────────────────────────────────────────────
// Outer envelope types
// ─────────────────────────────────────────────────────────────────────────────

/** The outer JSON object published on the MQTT topic. */
export interface MqttEnvelope {
  head: Record<string, unknown>;
  /** JSON-encoded inner payload string. */
  payload: string;
}

/** The decoded inner payload (the parsed content of `MqttEnvelope.payload`). */
export interface MqttInnerPayload {
  /** Device product number / model identifier (e.g. "A17C1"). */
  pn?: string;
  /** Device serial number. */
  sn?: string;
  /** Base64-encoded binary blob (standard devices). */
  data?: string;
  /** Base64-encoded JSON string (X1/HES devices). */
  trans?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Binary packet types
// ─────────────────────────────────────────────────────────────────────────────

/** Decoded binary packet header (first 9–10 bytes). */
export interface PacketHeader {
  /** Total message length in bytes including prefix and checksum. */
  totalLength: number;
  /** Message direction derived from the pattern byte (byte 5). */
  direction: "send" | "receive" | "unknown";
  /** 2-byte message type as lowercase hex (e.g. "0405"). */
  msgType: string;
  /** Optional increment byte (present when byte[9] is < 0xA0). */
  incrementByte: number | undefined;
}

/** One parsed raw binary field before semantic decoding. */
export interface RawField {
  /** Field identifier byte (e.g. 0xA2). */
  id: number;
  /** Type byte extracted from the field (e.g. FieldType.ui = 0x01), or undefined. */
  type: number | undefined;
  /** Raw value bytes (type byte excluded). */
  data: Buffer;
}

/** A fully parsed binary packet. */
export interface ParsedPacket {
  header: PacketHeader;
  rawFields: Map<number, RawField>;
  /** Semantically decoded key-value pairs (requires a FieldMap). */
  decoded: Record<string, unknown>;
  /** Whether the XOR checksum verified correctly. */
  checksumOk: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Envelope parsing
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parse the outer MQTT envelope and return structured metadata plus the binary
 * payload buffer (if present) or a JSON value (for X1/HES devices).
 */
export function parseEnvelope(raw: Buffer | string): {
  head: Record<string, unknown>;
  pn: string;
  sn: string;
  binaryData: Buffer | null;
  jsonData: unknown;
} {
  const text = typeof raw === "string" ? raw : raw.toString("utf8");
  const outer = JSON.parse(text) as MqttEnvelope;
  const inner = JSON.parse(outer.payload) as MqttInnerPayload;

  const pn = inner.pn ?? "";
  const sn = inner.sn ?? "";
  const head = outer.head;

  if (inner.data) {
    return { head, pn, sn, binaryData: Buffer.from(inner.data, "base64"), jsonData: null };
  }
  if (inner.trans) {
    const decoded = Buffer.from(inner.trans, "base64").toString("utf8");
    return { head, pn, sn, binaryData: null, jsonData: JSON.parse(decoded) as unknown };
  }
  return { head, pn, sn, binaryData: null, jsonData: null };
}

// ─────────────────────────────────────────────────────────────────────────────
// Binary packet parsing
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parse the binary packet header and return the header struct plus the byte
 * offset at which field data begins.
 */
export function parseHeader(buf: Buffer): { header: PacketHeader; fieldsStart: number } {
  if (buf.length < 9) {
    throw new RangeError(`Packet too short for header: ${buf.length} bytes`);
  }
  if (buf.readUInt8(0) !== 0xff || buf.readUInt8(1) !== 0x09) {
    throw new Error(
      `Invalid magic bytes: expected ff 09, got ${buf.readUInt8(0).toString(16)} ${buf.readUInt8(1).toString(16)}`,
    );
  }

  const totalLength = buf.readUInt16LE(2);
  const directionByte = buf.readUInt8(5);
  const direction =
    directionByte === 0x00 ? "send" : directionByte === 0x01 ? "receive" : "unknown";
  const msgType =
    buf.readUInt8(7).toString(16).padStart(2, "0") +
    buf.readUInt8(8).toString(16).padStart(2, "0");

  // Byte 9 is an optional increment byte. It is ABSENT (fields start at 9) when
  // byte[9] is in the range A0–A9 (those are field identifier bytes). Otherwise
  // byte[9] is the increment byte and fields start at 10.
  let incrementByte: number | undefined;
  let fieldsStart = 9;
  if (buf.length > 9) {
    const b9 = buf.readUInt8(9);
    const isFieldId = b9 >= 0xa0 && b9 <= 0xa9;
    if (!isFieldId) {
      incrementByte = b9;
      fieldsStart = 10;
    }
  }

  return { header: { totalLength, direction, msgType, incrementByte }, fieldsStart };
}

/**
 * Walk the binary buffer from `start` to `buf.length - 1` (the checksum byte)
 * and extract every field into a Map keyed by field identifier byte.
 *
 * Field structure:
 *   [id: 1 B] [length: 1–2 B LE] [type?: 1 B] [value: length–1 B or length B]
 */
export function parseRawFields(buf: Buffer, start: number): Map<number, RawField> {
  const fields = new Map<number, RawField>();
  // The last byte is the XOR checksum — stop before it.
  const end = buf.length - 1;
  let idx = start;

  while (idx < end) {
    const fieldId = buf.readUInt8(idx);
    if (fieldId < 0xa0) break; // not a valid field identifier byte

    const remaining = buf.length - idx; // includes checksum
    idx += 1;

    if (idx >= end) break;

    // ── Determine field length (1-byte or 2-byte LE) ─────────────────────────
    // A 2-byte length is used for str (0x00) or bin (0x04) typed fields when the
    // data is large. The type byte sits at buf[idx+2] in that case.
    let lenBytes = 1;
    let fLength: number;

    if (remaining >= 5 && buf.readUInt8(idx + 2) === FieldType.str) {
      // Potential 2-byte length for str type
      const twoByteLen = buf.readUInt16LE(idx);
      if (twoByteLen > 3 && twoByteLen <= remaining - 4) {
        try {
          const strData = buf.subarray(idx + 3, idx + 2 + twoByteLen);
          new TextDecoder("utf-8", { fatal: true }).decode(strData);
          lenBytes = 2;
          fLength = twoByteLen;
        } catch {
          fLength = buf.readUInt8(idx);
        }
      } else {
        fLength = buf.readUInt8(idx);
      }
    } else if (remaining >= 5 && buf.readUInt8(idx + 2) === FieldType.bin) {
      // Potential 2-byte length for bin type
      const twoByteLen = buf.readUInt16LE(idx);
      if (twoByteLen > 3 && twoByteLen <= remaining - 4) {
        const nextFieldOffset = idx + 3 + twoByteLen - 1;
        const afterField = remaining - twoByteLen;
        if (
          nextFieldOffset < buf.length &&
          (afterField === 4 ||
            (buf.readUInt8(nextFieldOffset) > fieldId && afterField >= 3))
        ) {
          lenBytes = 2;
          fLength = twoByteLen;
        } else {
          fLength = buf.readUInt8(idx);
        }
      } else {
        fLength = buf.readUInt8(idx);
      }
    } else {
      fLength = buf.readUInt8(idx);
    }

    idx += lenBytes; // advance past the length byte(s)

    if (fLength === 0 || idx + fLength > buf.length) {
      // Empty or malformed field — skip
      break;
    }

    // ── Determine whether a type byte is present ──────────────────────────────
    // A type byte is present when f_length > 1 and the first data byte is < 0x10
    // (which covers all valid type bytes 0x00–0x06).
    let type: number | undefined;
    let data: Buffer;

    const potentialType = buf.readUInt8(idx);
    if (fLength > 1 && potentialType < 0x10) {
      type = potentialType;
      data = buf.subarray(idx + 1, idx + fLength);
    } else {
      data = buf.subarray(idx, idx + fLength);
    }

    fields.set(fieldId, { id: fieldId, type, data });
    idx += fLength;
  }

  return fields;
}

/**
 * Verify the XOR checksum: XOR of all bytes in the buffer (including the last
 * checksum byte) must equal 0x00.
 */
export function verifyChecksum(buf: Buffer): boolean {
  let xor = 0;
  for (let i = 0; i < buf.length; i++) {
    xor ^= buf.readUInt8(i);
  }
  return xor === 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// Field value decoding
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Decode all raw fields using the provided field map.
 * Returns a flat key-value record of named device properties.
 */
export function decodeFields(
  rawFields: Map<number, RawField>,
  fieldMap: FieldMap,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [idByte, rawField] of rawFields) {
    const key = idByte.toString(16).padStart(2, "0");
    const descriptor = fieldMap[key];
    if (!descriptor) continue;
    Object.assign(result, decodeFieldValue(rawField.data, rawField.type, descriptor));
  }
  return result;
}

/**
 * Decode a single field value.
 *
 * @param data       - Raw value bytes (type byte NOT included).
 * @param fieldType  - Type byte from the raw binary field (or undefined).
 * @param descriptor - Semantic descriptor from the field map.
 */
export function decodeFieldValue(
  data: Buffer,
  fieldType: number | undefined,
  descriptor: FieldDescriptor,
): Record<string, unknown> {
  if (data.length === 0) return {};

  // Use raw type byte; fall back to descriptor's type if absent.
  const t = fieldType ?? descriptor.type ?? 0xff;

  switch (t) {
    case FieldType.str:
      return decodeStr(data, descriptor);

    case FieldType.ui:
      return decodeUi(data, descriptor);

    case FieldType.sile:
      return decodeSile(data, descriptor);

    case FieldType.var:
      return decodeVar(data, descriptor);

    case FieldType.bin:
      return decodeBin(data, descriptor);

    case FieldType.sfle:
      return decodeSfle(data, descriptor);

    case FieldType.strb:
      return decodeStrb(data, descriptor);

    case FieldType.json: {
      // JSON fields: if there's a "json" sub-map, use it; otherwise return raw string.
      const name = descriptor.name;
      if (!name) return {};
      try {
        const obj = JSON.parse(data.toString("utf8")) as unknown;
        return { [name]: obj };
      } catch {
        return { [name]: data.toString("utf8") };
      }
    }

    default: {
      // Unknown raw type: if the field map specifies a type, try that.
      if (descriptor.type !== undefined && descriptor.type !== t) {
        return decodeFieldValue(data, descriptor.type, descriptor);
      }
      // Single-byte value with no type byte in the raw field.
      if (data.length === 1) {
        const name = descriptor.name;
        if (!name) return {};
        const raw = data.readUInt8(0);
        const signed = descriptor.signed === true;
        const v = signed ? ((raw << 24) >> 24) : raw;
        return { [name]: roundByFactor(v * (descriptor.factor ?? 1), descriptor.factor ?? 1) };
      }
      return {};
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Type-specific decoders (private helpers)
// ─────────────────────────────────────────────────────────────────────────────

function decodeStr(data: Buffer, desc: FieldDescriptor): Record<string, unknown> {
  const name = desc.name;
  if (!name) return {};
  const raw = data.toString("utf8").replace(/[^\x20-\x7e]/g, "").trim();
  if (name.includes("timestamp")) {
    const ms = Number(raw);
    return { [name]: Number.isFinite(ms) ? ms / 1000 : raw };
  }
  return { [name]: raw };
}

function decodeUi(data: Buffer, desc: FieldDescriptor): Record<string, unknown> {
  const name = desc.name;
  if (!name) return {};
  const raw = data.readUInt8(0);
  const signed = desc.signed === true;
  const v = signed ? ((raw << 24) >> 24) : raw;
  return { [name]: roundByFactor(v * (desc.factor ?? 1), desc.factor ?? 1) };
}

function decodeSile(data: Buffer, desc: FieldDescriptor): Record<string, unknown> {
  // sile can also carry a multi-byte layout described by BYTES (like bin).
  if (desc.bytes) {
    return decodeBin(data, desc);
  }
  const name = desc.name;
  if (!name) return {};
  if (data.length < 2) return {};
  const signed = desc.signed !== false; // default: signed
  const v = signed
    ? data.readInt16LE(0)
    : data.readUInt16LE(0);

  if (name.endsWith("_time")) {
    return { [name]: convertTime(data) };
  }
  if (name.includes("version") || name.startsWith("sw_")) {
    return { [name]: String(v).split("").join(".") };
  }
  return { [name]: roundByFactor(v * (desc.factor ?? 1), desc.factor ?? 1) };
}

function decodeVar(data: Buffer, desc: FieldDescriptor): Record<string, unknown> {
  const name = desc.name;
  if (!name) {
    if (desc.bytes) return decodeBin(data, desc);
    return {};
  }
  const factor = desc.factor ?? 1;
  const count = desc.values ?? 0;
  let value: number | number[] | string;

  if (count === 1) {
    const raw = data.readUInt8(0);
    value = roundByFactor((desc.signed === true ? ((raw << 24) >> 24) : raw) * factor, factor);
  } else if (count === 2) {
    const raw = desc.signed !== false ? data.readInt16LE(0) : data.readUInt16LE(0);
    value = roundByFactor(raw * factor, factor);
  } else if (count === 4) {
    value = Array.from({ length: Math.min(data.length, 4) }, (_, i) => {
      const b = data.readUInt8(i);
      const sv = desc.signed === true ? ((b << 24) >> 24) : b;
      return roundByFactor(sv * factor, factor);
    });
  } else {
    if (data.length < 4) return {};
    const raw = desc.signed !== false ? data.readInt32LE(0) : data.readUInt32LE(0);
    value = roundByFactor(raw * factor, factor);
  }

  if (typeof value === "number" || Array.isArray(value)) {
    if (name.endsWith("_time")) {
      return { [name]: convertTime(data) };
    }
    if (name.includes("version") || name.startsWith("sw_")) {
      return {
        [name]: Array.isArray(value) ? value.join(".") : String(value),
      };
    }
  }

  return { [name]: value };
}

function decodeBin(data: Buffer, desc: FieldDescriptor): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const bytesMap = desc.bytes;
  if (!bytesMap) return result;

  if (Array.isArray(bytesMap)) {
    // list-mode strb
    return decodeStrbList(data, bytesMap);
  }

  // dict-mode: keys are decimal offset strings
  for (const [key, entry] of Object.entries(bytesMap)) {
    const pos = parseInt(key, 10);
    if (pos >= data.length) continue;

    if (Array.isArray(entry)) {
      // bitmask entries
      for (const bitmap of entry) {
        if (bitmap.mask && bitmap.name && pos < data.length) {
          let mask = bitmap.mask;
          let val = data.readUInt8(pos);
          while ((mask & 1) === 0) {
            mask >>= 1;
            val >>= 1;
          }
          result[bitmap.name] = val & mask;
        }
      }
    } else {
      // sub-field descriptor — extract at absolute position
      Object.assign(result, extractSubField(data, pos, entry).decoded);
    }
  }

  return result;
}

function decodeSfle(data: Buffer, desc: FieldDescriptor): Record<string, unknown> {
  const name = desc.name;
  if (!name || data.length < 4) return {};
  const v = data.readFloatLE(0) * (desc.factor ?? 1);
  return { [name]: v === 0 ? 0 : v };
}

function decodeStrb(data: Buffer, desc: FieldDescriptor): Record<string, unknown> {
  const bytesMap = desc.bytes ?? desc;

  if (Array.isArray(bytesMap)) {
    return decodeStrbList(data, bytesMap as FieldDescriptor[]);
  }

  return decodeStrbDict(data, bytesMap as Record<string, FieldDescriptor | BitmapEntry[]>);
}

/** Sequential strb with absolute byte-offset keys (decimal strings). */
function decodeStrbDict(
  data: Buffer,
  flds: Record<string, FieldDescriptor | BitmapEntry[]>,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(flds)) {
    const pos = parseInt(key, 10);
    if (pos >= data.length) continue;
    if (Array.isArray(entry)) {
      // bitmask (shouldn't normally appear in strb but handle gracefully)
      for (const bitmap of entry) {
        if (bitmap.mask && bitmap.name) {
          let mask = bitmap.mask;
          let val = data.readUInt8(pos);
          while ((mask & 1) === 0) { mask >>= 1; val >>= 1; }
          result[bitmap.name] = val & mask;
        }
      }
    } else {
      Object.assign(result, extractSubField(data, pos, entry).decoded);
    }
  }
  return result;
}

/** Sequential strb with relative offset list (each entry can have `offset`). */
function decodeStrbList(data: Buffer, flds: FieldDescriptor[]): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  let pos = 0;
  for (const entry of flds) {
    pos += entry.offset ?? 0;
    if (pos >= data.length) break;
    const { decoded, bytesConsumed } = extractSubField(data, pos, entry);
    Object.assign(result, decoded);
    pos += bytesConsumed;
  }
  return result;
}

/**
 * Extract a single typed sub-field at `pos` within `data`.
 * Handles all base types; for str without a fixed length the first byte is
 * treated as a length prefix.
 */
function extractSubField(
  data: Buffer,
  pos: number,
  desc: FieldDescriptor,
): { decoded: Record<string, unknown>; bytesConsumed: number } {
  const ftype = desc.type ?? 0xff;

  if (ftype === FieldType.ui) {
    if (pos >= data.length) return { decoded: {}, bytesConsumed: 1 };
    const slice = data.subarray(pos, pos + 1);
    return { decoded: decodeFieldValue(slice, ftype, desc), bytesConsumed: 1 };
  }

  if (ftype === FieldType.sile) {
    if (pos + 2 > data.length) return { decoded: {}, bytesConsumed: 2 };
    const slice = data.subarray(pos, pos + 2);
    return { decoded: decodeFieldValue(slice, ftype, desc), bytesConsumed: 2 };
  }

  if (ftype === FieldType.var || ftype === FieldType.sfle) {
    const len = desc.length ?? 4;
    if (pos + len > data.length) return { decoded: {}, bytesConsumed: len };
    const slice = data.subarray(pos, pos + len);
    return { decoded: decodeFieldValue(slice, ftype, desc), bytesConsumed: len };
  }

  if (ftype === FieldType.str) {
    if (desc.length !== undefined && desc.length > 0) {
      // Fixed-length string
      const slice = data.subarray(pos, pos + desc.length);
      return { decoded: decodeFieldValue(slice, ftype, desc), bytesConsumed: desc.length };
    }
    // Variable-length: first byte is length
    if (pos >= data.length) return { decoded: {}, bytesConsumed: 1 };
    const strLen = data.readUInt8(pos);
    const slice = data.subarray(pos + 1, pos + 1 + strLen);
    return { decoded: decodeFieldValue(slice, ftype, desc), bytesConsumed: 1 + strLen };
  }

  // Generic fallback
  const len = desc.length ?? 0;
  if (len === 0) {
    if (pos >= data.length) return { decoded: {}, bytesConsumed: 1 };
    const varLen = data.readUInt8(pos);
    const slice = data.subarray(pos + 1, pos + 1 + varLen);
    return { decoded: decodeFieldValue(slice, ftype, desc), bytesConsumed: 1 + varLen };
  }
  const slice = data.subarray(pos, pos + len);
  return { decoded: decodeFieldValue(slice, ftype, desc), bytesConsumed: len };
}

// ─────────────────────────────────────────────────────────────────────────────
// Top-level parse functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parse a raw binary blob (already base64-decoded) and return the structured
 * packet. Pass a `fieldMap` to get semantically decoded values.
 */
export function parsePacket(binaryData: Buffer, fieldMap?: FieldMap): ParsedPacket {
  const { header, fieldsStart } = parseHeader(binaryData);
  const rawFields = parseRawFields(binaryData, fieldsStart);
  const decoded = fieldMap ? decodeFields(rawFields, fieldMap) : {};
  const checksumOk = verifyChecksum(binaryData);
  return { header, rawFields, decoded, checksumOk };
}

/**
 * Full pipeline: parse the outer MQTT envelope, decode the binary payload,
 * and return decoded fields (if a `fieldMap` is provided).
 *
 * @param raw       - Raw MQTT message payload (Buffer or JSON string).
 * @param fieldMap  - Optional field map for semantic decoding.
 */
export function parseMessage(
  raw: Buffer | string,
  fieldMap?: FieldMap,
): {
  head: Record<string, unknown>;
  pn: string;
  sn: string;
  packet: ParsedPacket | null;
  jsonData: unknown;
} {
  const { head, pn, sn, binaryData, jsonData } = parseEnvelope(raw);
  if (!binaryData) {
    return { head, pn, sn, packet: null, jsonData };
  }
  const packet = parsePacket(binaryData, fieldMap);
  return { head, pn, sn, packet, jsonData: null };
}

// ─────────────────────────────────────────────────────────────────────────────
// Utility helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Round `value` to the precision implied by `factor`.
 * factor=0.1 → 1 decimal place; factor=1 → integer; factor=0.001 → 3 places.
 */
export function roundByFactor(value: number, factor: number): number {
  const absF = Math.abs(factor);
  if (absF === 0) return 0;
  if (absF >= 1) return Math.round(value);
  const places = Math.round(-Math.log10(absF));
  const mult = Math.pow(10, places);
  return Math.round(value * mult) / mult;
}

/**
 * Convert a 2–3 byte little-endian buffer to an "HH:MM" or "HH:MM:SS" string.
 * The value is interpreted as total seconds (3 bytes) or total minutes (2 bytes).
 */
export function convertTime(buf: Buffer): string {
  if (buf.length >= 3) {
    const total = buf.readUInt8(0) | (buf.readUInt8(1) << 8) | (buf.readUInt8(2) << 16);
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  const total = buf.readUInt8(0) | ((buf.readUInt8(1) ?? 0) << 8);
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
