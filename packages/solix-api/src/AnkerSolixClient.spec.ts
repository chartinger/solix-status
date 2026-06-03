import { test, expect } from "vitest";

import { extractStatusFromScene } from "./AnkerSolixClient.js";

test("extractStatusFromScene returns watt values and battery percentage", () => {
    const status = extractStatusFromScene(
        "site-1",
        {
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
        },
        "device-123",
    );

    expect(status).toEqual({
        siteId: "site-1",
        deviceSn: "device-123",
        batteryPercent: 75,
        panelInputWatts: 640,
        pvInput1Watts: null,
        pvInput2Watts: null,
        pvInput3Watts: null,
        pvInput4Watts: null,
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

    expect(status?.panelInputWatts).toBe(800);
    expect(status?.outputWatts).toBe(250);
});
