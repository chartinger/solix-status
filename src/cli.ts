import { AnkerSolixClient } from "./client.js";

function parseArgs(argv: string[]): { siteId?: string; deviceSn?: string } {
  const result: { siteId?: string; deviceSn?: string } = {};
  for (let i = 0; i < argv.length; i += 1) {
    const current = argv[i];
    const next = argv[i + 1];
    if (!next) {
      continue;
    }
    if (current === "--site-id") {
      result.siteId = next;
      i += 1;
    } else if (current === "--device-sn") {
      result.deviceSn = next;
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

  const { siteId, deviceSn } = parseArgs(process.argv.slice(2));
  const client = new AnkerSolixClient({ email, password, countryId });
  const status = await client.getCurrentStatus(siteId, deviceSn);
  process.stdout.write(`${JSON.stringify(status, null, 2)}\n`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
