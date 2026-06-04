import { AnkerSolixClient } from "@lab759/solix-api";
import { AnkerSolixMqttClient } from "@lab759/solix-mqtt";
import "dotenv/config";

async function main(): Promise<void> {
  const showRaw = process.argv.includes("--raw");

  const email = process.env.ANKER_EMAIL;
  const password = process.env.ANKER_PASSWORD;
  const countryId = process.env.ANKER_COUNTRY_ID ?? "DE";

  if (!email || !password) {
    throw new Error("Set ANKER_EMAIL and ANKER_PASSWORD environment variables.");
  }

  const client = new AnkerSolixClient({ email, password, countryId });
  const mqttClient = new AnkerSolixMqttClient(client, { raw: showRaw });

  await mqttClient.connect();

  const exit = (code: number): void => {
    mqttClient.disconnect();
    process.exit(code);
  };

  process.on("SIGINT", () => exit(0));
  process.on("SIGTERM", () => exit(0));
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
