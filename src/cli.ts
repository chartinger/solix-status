import { AnkerSolixClient } from "./client.js";

function parseArgs(argv: string[]): {
  siteId?: string;
  deviceSn?: string;
  watch: boolean;
  interval: number;
} {
  const result: { siteId?: string; deviceSn?: string; watch: boolean; interval: number } = {
    watch: false,
    interval: 30,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const current = argv[i];
    const next = argv[i + 1];
    if (current === "--watch") {
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

async function main(): Promise<void> {
  const email = process.env.ANKER_EMAIL;
  const password = process.env.ANKER_PASSWORD;
  const countryId = process.env.ANKER_COUNTRY_ID ?? "DE";

  if (!email || !password) {
    throw new Error("Set ANKER_EMAIL and ANKER_PASSWORD environment variables.");
  }

  const { siteId, deviceSn, watch, interval } = parseArgs(process.argv.slice(2));
  const client = new AnkerSolixClient({ email, password, countryId });

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

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
