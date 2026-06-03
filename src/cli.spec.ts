import { test, expect } from "vitest";

import { buildSiteDeviceListing, parseArgs } from "./cli.js";

test("parseArgs enables list mode", () => {
    const parsed = parseArgs(["--list"]);

    expect(parsed.list).toBe(true);
    expect(parsed.watch).toBe(false);
    expect(parsed.interval).toBe(30);
});

test("parseArgs reads site/device/watch/interval options", () => {
    const parsed = parseArgs([
        "--site-id",
        "site-1",
        "--device-sn",
        "sn-1",
        "--watch",
        "--interval",
        "15",
    ]);

    expect(parsed).toEqual({
        siteId: "site-1",
        deviceSn: "sn-1",
        list: false,
        watch: true,
        interval: 15,
    });
});

test("buildSiteDeviceListing groups devices by site", () => {
    const listing = buildSiteDeviceListing(
        [{ site_id: "site-a" }, { site_id: "site-b" }],
        [
            { siteId: "site-a", deviceSn: "sn-1", productCode: "A17C1" },
            { siteId: "site-a", deviceSn: "sn-2", productCode: "A17C2" },
            { siteId: "site-c", deviceSn: "sn-3", productCode: "A17C3" },
        ],
    );

    expect(listing).toEqual([
        {
            siteId: "site-a",
            devices: [
                { deviceSn: "sn-1", productCode: "A17C1" },
                { deviceSn: "sn-2", productCode: "A17C2" },
            ],
        },
        {
            siteId: "site-b",
            devices: [],
        },
        {
            siteId: "site-c",
            devices: [{ deviceSn: "sn-3", productCode: "A17C3" }],
        },
    ]);
});
