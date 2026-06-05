import { AnkerSolixClient, type AnkerClientOptions, type DeviceStatus } from "@lab759/solix-api";
import { AnkerSolixMqttClient } from "@lab759/solix-mqtt";
import "dotenv/config";
import { connect } from "mqtt";
import { loadAuthInfo, saveAuthTokensToCache } from "./auth.js";

async function main(): Promise<void> {
  const showRaw = process.argv.includes("--raw");

  const apiClientOptions: AnkerClientOptions = {
    ...loadAuthInfo(),
    onAuthTokens: (tokens) => saveAuthTokensToCache(tokens),
  };

  const TARGET_BROKER_HOST = process.env.TARGET_BROKER;
  const TARGET_TOPIC = process.env.TARGET_TOPIC;

  if (!TARGET_BROKER_HOST || !TARGET_TOPIC) {
    throw new Error("Set TARGET_BROKER and TARGET_TOPIC environment variables.");
  }

  const targetMqttClient = connect(`mqtt://${TARGET_BROKER_HOST}`);

  const client = new AnkerSolixClient(apiClientOptions);
  const solixMqttClient = new AnkerSolixMqttClient(client, { raw: showRaw });

  const initialStatus = await client.getCurrentStatus();
  targetMqttClient.publish(TARGET_TOPIC, JSON.stringify(initialStatus));

  solixMqttClient.on("message", (data) => {
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
        outputWatts: Number(data.decoded?.charged_energy), // Needs verification
      };
      console.dir(deviceStatus, { depth: null });
      targetMqttClient.publish(TARGET_TOPIC, JSON.stringify(deviceStatus));
    }
  });

  await solixMqttClient.connect();

  const exit = (code: number): void => {
    solixMqttClient.disconnect();
    targetMqttClient.end(true)
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
