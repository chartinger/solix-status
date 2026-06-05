import "dotenv/config";
import { pathToFileURL } from "node:url";
import { AnkerSolixClient, type AnkerClientOptions, type SiteDevice, type SiteInfo } from "@lab759/solix-api";
import { loadAuthInfo, saveAuthTokensToCache } from "./auth.js";

export interface CliOptions {
  siteId?: string;
  deviceSn?: string;
  list: boolean;
  watch: boolean;
  interval: number;
}

export interface SiteDeviceListing {
  siteId: string;
  devices: Array<{
    deviceSn: string;
    productCode: string;
  }>;
}

export function parseArgs(argv: string[]): CliOptions {
  const result: CliOptions = {
    list: false,
    watch: false,
    interval: 30,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const current = argv[i];
    const next = argv[i + 1];
    if (current === "--list") {
      result.list = true;
    } else if (current === "--watch") {
      result.watch = true;
    } else if (current === "--site-id" && next) {
      result.siteId = next;
      i += 1;
    } else if (current === "--device-sn" && next) {
      result.deviceSn = next;
      i += 1;
    } else if (current === "--interval" && next) {
      const parsed = Number.parseInt(next, 10);
      if (Number.isFinite(parsed) && parsed > 0) {
        result.interval = parsed;
      }
      i += 1;
    }
  }
  return result;
}

export function buildSiteDeviceListing(
  sites: SiteInfo[],
  devices: SiteDevice[],
): SiteDeviceListing[] {
  const devicesBySite = new Map<string, SiteDevice[]>();
  for (const device of devices) {
    const siteDevices = devicesBySite.get(device.siteId) ?? [];
    siteDevices.push(device);
    devicesBySite.set(device.siteId, siteDevices);
  }

  const listedSiteIds = new Set<string>();
  const listing: SiteDeviceListing[] = [];
  for (const site of sites) {
    const siteId = site.site_id;
    if (!siteId) {
      continue;
    }
    listedSiteIds.add(siteId);
    const siteDevices = devicesBySite.get(siteId) ?? [];
    listing.push({
      siteId,
      devices: siteDevices.map((device) => ({
        deviceSn: device.deviceSn,
        productCode: device.productCode,
      })),
    });
  }

  for (const [siteId, siteDevices] of devicesBySite.entries()) {
    if (listedSiteIds.has(siteId)) {
      continue;
    }
    listing.push({
      siteId,
      devices: siteDevices.map((device) => ({
        deviceSn: device.deviceSn,
        productCode: device.productCode,
      })),
    });
  }

  return listing;
}

async function main(): Promise<void> {
  const apiClientOptions: AnkerClientOptions = {
    ...loadAuthInfo(),
    onAuthTokens: (tokens) => saveAuthTokensToCache(tokens),
  };

  const { siteId, deviceSn, list, watch, interval } = parseArgs(process.argv.slice(2));
  const client = new AnkerSolixClient(apiClientOptions);

  if (list) {
    const [sites, devices] = await Promise.all([client.getSiteList(), client.getSiteDevices()]);
    const listing = buildSiteDeviceListing(sites, devices);
    process.stdout.write(`${JSON.stringify({ sites: listing }, null, 2)}\n`);
    return;
  }

  const printStatus = async (): Promise<void> => {
    const status = await client.getCurrentStatus(siteId, deviceSn);
    process.stdout.write(`${JSON.stringify(status, null, 2)}\n`);
  };

  await printStatus();

  if (watch) {
    const sleep = (ms: number): Promise<void> =>
      new Promise((resolve) => setTimeout(resolve, ms));
    while (true) {
      await sleep(interval * 1000);
      await printStatus();
    }
  }
}

const isDirectRun =
  typeof process.argv[1] === "string" && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
}
