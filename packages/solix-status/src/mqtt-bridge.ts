import { AnkerSolixClient, type AnkerClientOptions, type DeviceStatus } from '@lab759/solix-api';
import { AnkerSolixMqttClient } from '@lab759/solix-mqtt';
import 'dotenv/config';
import { connect } from 'mqtt';
import { loadAuthInfo, saveAuthTokensToCache } from './auth.js';

type MqttBridgeStatus = {
  bridgeConnected: boolean;
  solixMqttConnected: boolean | undefined;
};

async function main(): Promise<void> {
  const showRaw = process.argv.includes('--raw');

  const apiClientOptions: AnkerClientOptions = {
    ...loadAuthInfo(),
    onAuthTokens: (tokens) => saveAuthTokensToCache(tokens),
  };

  const TARGET_BROKER_HOST = process.env.TARGET_BROKER;
  const TARGET_TOPIC_DATA = process.env.TARGET_TOPIC_DATA;
  const TARGET_TOPIC_POLL = process.env.TARGET_TOPIC_POLL;
  const TARGET_TOPIC_STATUS = process.env.TARGET_TOPIC_STATUS;

  if (!TARGET_BROKER_HOST || !TARGET_TOPIC_DATA || !TARGET_TOPIC_POLL) {
    throw new Error(
      'Set TARGET_BROKER, TARGET_TOPIC_DATA, and TARGET_TOPIC_POLL environment variables.',
    );
  }

  const willPayload = JSON.stringify({ bridgeConnected: false });
  const targetMqttClient = connect(`mqtt://${TARGET_BROKER_HOST}`, {
    manualConnect: true,
    ...(TARGET_TOPIC_STATUS
      ? { will: { topic: TARGET_TOPIC_STATUS, payload: willPayload, qos: 1, retain: true } }
      : {}),
  });

  const client = new AnkerSolixClient(apiClientOptions);
  const solixMqttClient = new AnkerSolixMqttClient(client, { raw: showRaw });

  const initialStatus = await client.getCurrentStatus();
  targetMqttClient.publish(TARGET_TOPIC_DATA, JSON.stringify(initialStatus));

  targetMqttClient.on('connect', () => {
    console.log('Connected to target MQTT broker');
    targetMqttClient.subscribe(TARGET_TOPIC_POLL, (err) => {
      if (err) {
        console.error('Failed to subscribe to poll topic:', err);
      } else {
        console.log(`Subscribed to poll topic: ${TARGET_TOPIC_POLL}`);
      }
    });
    publishMqttBridgeStatus({
      solixMqttConnected: solixMqttClient.isConnected(),
      bridgeConnected: true,
    });
  });

  targetMqttClient.on('message', async (topic, message) => {
    if (topic === TARGET_TOPIC_POLL) {
      const messageStr = message.toString().trim();
      try {
        console.log('Received poll request:', messageStr);
        const requestData = JSON.parse(messageStr);
        if (requestData?.type === 'realtime') {
          console.log('Publishing realtime trigger');
          try {
            solixMqttClient.publishRealtimeTrigger();
          } catch (error) {
            console.error('Failed to fetch realtime data:', error);
          }
          return;
        }
      } catch {
        console.warn('Received non-JSON poll message, using legacy fallback');
      }
      try {
        console.log('Publishing status request');
        solixMqttClient.publishStatusRequest();
      } catch (error) {
        console.error('Failed to fetch current status:', error);
      }
    }
  });

  solixMqttClient.on('message', (data) => {
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
      targetMqttClient.publish(TARGET_TOPIC_DATA, JSON.stringify(deviceStatus));
    }
    if (data.pn === 'A17C5' && data.msgType === '0405') {
      const deviceStatus: DeviceStatus = {
        siteId: '?',
        deviceSn: data.sn,
        batteryPercent: Number(data.decoded?.battery_soc),
        panelInputWatts: Number(data.decoded?.photovoltaic_power),
        pvInput1Watts: Number(data.decoded?.pv_1_power),
        pvInput2Watts: Number(data.decoded?.pv_2_power),
        pvInput3Watts: Number(data.decoded?.pv_3_power),
        pvInput4Watts: Number(data.decoded?.pv_4_power),
        outputWatts: Number(data.decoded?.output_power), // Needs verification
      };
      console.dir(deviceStatus, { depth: null });
      targetMqttClient.publish(TARGET_TOPIC_DATA, JSON.stringify(deviceStatus));
    }
  });

  solixMqttClient.on('connected', (connected) => {
    console.log(`Local MQTT client connected: ${connected}`);
    publishMqttBridgeStatus({
      solixMqttConnected: connected,
      bridgeConnected: targetMqttClient.connected,
    });
  });

  await solixMqttClient.connect();
  targetMqttClient.connect();

  const exit = (code: number): void => {
    solixMqttClient.disconnect();
    targetMqttClient.end(true);
    process.exit(code);
  };

  process.on('SIGINT', () => exit(0));
  process.on('SIGTERM', () => exit(0));

  function publishMqttBridgeStatus(status: MqttBridgeStatus): void {
    if (!TARGET_TOPIC_STATUS) return;
    targetMqttClient.publish(TARGET_TOPIC_STATUS, JSON.stringify(status), { retain: true });
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
