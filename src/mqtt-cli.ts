import { AnkerSolixClient, type DeviceStatus } from "@lab759/solix-api";
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

  mqttClient.on("message", (data) => {
    const timestamp = new Date().toISOString();
    process.stdout.write(`[${timestamp}] ${data.topic}:\n`);
    process.stdout.write(`${JSON.stringify(data, null, 2)}\n`);

    if (data.pn === 'A17C5' && data.msgType === '0408') {
      const deviceStatus: DeviceStatus = {
        siteId: '?',
        deviceSn: data.sn,
        batteryPercent: Number(data.decoded?.battery_soc),
        panelInputWatts: Number(data.decoded?.photovoltaic_power),
        pvInput1Watts: Number(data.decoded?.pv_input_1_power),
        pvInput2Watts: Number(data.decoded?.pv_input_2_power),
        pvInput3Watts: Number(data.decoded?.pv_input_3_power),
        pvInput4Watts: Number(data.decoded?.pv_input_4_power),
        outputWatts: Number(data.decoded?.output_energy), // Needs verification
      };
      console.dir(deviceStatus, { depth: null });
    }
  });

  mqttClient.on("raw", (data) => {
    const timestamp = new Date().toISOString();
    process.stdout.write(`[${timestamp}] ${data.topic} (raw):\n`);
    process.stdout.write(`${data.payload}\n`);
  });

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
