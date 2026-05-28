import test from "node:test";
import assert from "node:assert/strict";
import { extractStatusFromScene } from "./client.js";
test("extractStatusFromScene returns watt values and battery percentage", () => {
    const status = extractStatusFromScene("site-1", {
        solarbank_info: {
            power_unit: "W",
            solarbank_list: [
                {
                    device_sn: "device-123",
                    battery_power: "75",
                    photovoltaic_power: "640",
                    output_power: "300",
                },
            ],
        },
    }, "device-123");
    assert.deepEqual(status, {
        siteId: "site-1",
        deviceSn: "device-123",
        batteryPercent: 75,
        panelInputWatts: 640,
        outputWatts: 300,
    });
});
test("extractStatusFromScene handles kW values", () => {
    const status = extractStatusFromScene("site-1", {
        solarbank_info: {
            power_unit: "kW",
            solarbank_list: [
                {
                    device_sn: "device-123",
                    battery_power: "55",
                    photovoltaic_power: "0.8",
                    output_power: "0.25",
                },
            ],
        },
    });
    assert.equal(status?.panelInputWatts, 800);
    assert.equal(status?.outputWatts, 250);
});
//# sourceMappingURL=client.test.js.map