import type { AnkerSolixClient } from "@lab759/solix-api";
import EventEmitter from 'node:events';
import { connect } from "mqtt";
import type { FieldMap } from "./mqtt-packet.js";
import { parseEnvelope, parseHeader, parseMessage } from "./mqtt-packet.js";
import { getFieldMap } from "./mqttmap.js";

type Events = {
  [key: string]: any;
};

export type AnkerSolixMqttClientOptions = {
  raw: boolean;
};

export class AnkerSolixMqttClient extends EventEmitter<Events> {
  private mqttClient: ReturnType<typeof connect> | null = null;

  constructor(private apiClient: AnkerSolixClient, private options: AnkerSolixMqttClientOptions = { raw: false }) {
    super();
  }

  public async connect(): Promise<void> {
    if (this.mqttClient) {
      throw new Error("Already connected.");
    }
    process.stderr.write("Fetching MQTT credentials…\n");
    const [mqttInfo, devices] = await Promise.all([
      this.apiClient.getMqttInfo(),
      this.apiClient.getSiteDevices(),
    ]);

    if (devices.length === 0) {
      throw new Error("No devices found for this account.");
    }

    const brokerUrl = `mqtts://${mqttInfo.brokerHost}:${mqttInfo.brokerPort}`;
    process.stderr.write(`Connecting to ${brokerUrl}…\n`);

    const options: Parameters<typeof connect>[1] = {
      ca: mqttInfo.caCert,
      cert: mqttInfo.clientCert,
      key: mqttInfo.clientKey,
      rejectUnauthorized: true,
      protocol: "mqtts",
    };
    if (mqttInfo.clientId) {
      options.clientId = mqttInfo.clientId;
    }

    const mqttClient = connect(brokerUrl, options);
    this.mqttClient = mqttClient;

    mqttClient.on("connect", () => {
      process.stderr.write("Connected.\n");

      for (const device of devices) {
        const productCode = device.productCode || "+";
        const topic = `dt/anker_power/${productCode}/${device.deviceSn}/#`;
        mqttClient.subscribe(topic, (err) => {
          if (err) {
            process.stderr.write(`Subscribe error for ${topic}: ${String(err)}\n`);
          } else {
            process.stderr.write(`Subscribed to ${topic}\n`);
          }
        });
      }
    });

    mqttClient.on("message", (topic: string, payload: Buffer) => {
      // Try to parse the Anker Solix binary envelope.
      let line: string;
      try {
        // Step 1: parse the outer envelope to extract pn and binary data
        const { head, pn, binaryData } = parseEnvelope(payload);

        // Step 2: parse the binary packet header to get the actual msgType,
        // then look up the correct field map for this device + message type.
        let fieldMap: FieldMap | undefined;
        if (pn && binaryData) {
          try {
            const { header } = parseHeader(binaryData);
            fieldMap = getFieldMap(pn, header.msgType);
          } catch {
            // If header parsing fails, fall back to the default 0405 map
            fieldMap = getFieldMap(pn, "0405");
          }
        }
        const result = parseMessage(payload, fieldMap);
        const decoded = result.packet?.decoded;

        // Include raw field info only with --raw flag (debugging / reverse engineering)
        let rawFields: Record<string, { id: string; type: string; hex: string }> | undefined;
        if (this.options.raw && result.packet?.rawFields && result.packet.rawFields.size > 0) {
          rawFields = {};
          for (const [id, rf] of result.packet.rawFields) {
            const key = id.toString(16).padStart(2, "0");
            rawFields[key] = {
              id: key,
              type: rf.type !== undefined ? `0x${rf.type.toString(16).padStart(2, "0")}` : "??",
              hex: rf.data.toString("hex"),
            };
          }
        }

        line = JSON.stringify({
          topic,
          pn: result.pn,
          sn: result.sn,
          msgType: result.packet?.header.msgType,
          checksumOk: result.packet?.checksumOk,
          decoded: decoded && Object.keys(decoded).length > 0 ? decoded : undefined,
          rawFields,
          jsonData: result.jsonData ?? undefined,
          head: result.head,
        });
      } catch {
        // Fall back to raw output for non-envelope messages.
        let parsed: unknown;
        try {
          parsed = JSON.parse(payload.toString("utf8"));
        } catch {
          parsed = payload.toString("base64");
        }
        line = JSON.stringify({ topic, payload: parsed });
      }
      process.stdout.write(`${line}\n`);
    });

    mqttClient.on("error", (err: Error) => {
      process.stderr.write(`MQTT error: ${err.message}\n`);
    });

    mqttClient.on("close", () => {
      process.stderr.write("Connection closed.\n");
    });
  }

  public disconnect(): void {
    if (this.mqttClient) {
      this.mqttClient.end();
      this.mqttClient = null;
    }
  }
}