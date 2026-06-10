import type { AnkerSolixClient, MqttInfo, SiteDevice } from '@lab759/solix-api';
import EventEmitter from 'node:events';
import { connect } from 'mqtt';
import type { FieldMap } from './mqtt-packet.js';
import { parseEnvelope, parseHeader, parseMessage } from './mqtt-packet.js';
import { getFieldMap } from './mqttmap.js';

// ─────────────────────────────────────────────────────────────────────────────
// Typed event payloads emitted by AnkerSolixMqttClient
// ─────────────────────────────────────────────────────────────────────────────

/** Payload for the `"message"` event — a fully parsed Anker Solix device message. */
export interface MqttMessageEvent {
  /** The MQTT topic the message arrived on. */
  topic: string;
  /** Device product number / model identifier (e.g. "A17C1"). */
  pn: string;
  /** Device serial number. */
  sn: string;
  /** 2-byte message type as lowercase hex (e.g. "0405"). */
  msgType?: string | undefined;
  /** Whether the XOR checksum verified correctly. */
  checksumOk?: boolean | undefined;
  /** Semantically decoded key-value pairs (requires a field map for the device). */
  decoded?: Record<string, unknown> | undefined;
  /** Raw binary fields (only included when `raw: true` option is set). */
  rawFields?: Record<string, { id: string; type: string; hex: string }> | undefined;
  /** Parsed JSON payload for X1/HES devices (non-binary protocol). */
  jsonData?: unknown;
  /** Outer envelope header metadata. */
  head?: Record<string, unknown> | undefined;
}

/** Payload for the `"raw"` event — an unparseable / non-envelope MQTT message. */
export interface MqttRawEvent {
  /** The MQTT topic the message arrived on. */
  topic: string;
  /** The raw payload (parsed JSON or base64 string). */
  payload: string;
}

type Events = {
  message: [MqttMessageEvent];
  raw: [MqttRawEvent];
  connected: [boolean];
};

export type AnkerSolixMqttClientOptions = {
  raw: boolean;
};

export class AnkerSolixMqttClient extends EventEmitter<Events> {
  private mqttClient: ReturnType<typeof connect> | null = null;
  private devices: SiteDevice[] = [];
  private mqttInfo: MqttInfo | null = null;
  private _connected = false;
  private reconnectAttempts: number = 0;
  private reconnectDelays = [1, 5, 10]; // In minutes (determines max attempts)
  private reconnectTimer: NodeJS.Timeout | null = null;

  constructor(
    private apiClient: AnkerSolixClient,
    private options: AnkerSolixMqttClientOptions = { raw: false },
  ) {
    super();
  }

  /** Returns whether the client is currently connected to the MQTT broker. */
  public isConnected(): boolean {
    return this._connected;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Command helpers
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Build the binary payload for an MQTT command to an Anker Solix device.
   *
   * Packet structure:
   *   ff 09          2B marker
   *   XX XX          2B total length LE (marker + length field + ... + fields)
   *   03 00 0f       3B fixed pattern
   *   XX XX          2B message type
   *   [fields…]      variable
   *   XX             1B XOR checksum
   */
  private static buildCommandPayload(msgType: string, fields: Buffer[]): Buffer {
    const fieldData = Buffer.concat(fields);

    // Pattern + msg type + fields
    const body = Buffer.concat([
      Buffer.from([0x03, 0x00, 0x0f]),
      Buffer.from(msgType, 'hex'),
      fieldData,
    ]);

    // total length = marker(2) + length-field(2) + body length
    const totalLength = 2 + 2 + body.length;

    const packet = Buffer.concat([Buffer.from([0xff, 0x09]), Buffer.alloc(2), body]);
    packet.writeUInt16LE(totalLength, 2);

    // XOR checksum over all bytes
    let checksum = 0;
    for (const b of packet) {
      checksum ^= b;
    }
    return Buffer.concat([packet, Buffer.from([checksum])]);
  }

  /** Encode a field: [fieldId, length, type?, value…] */
  private static encodeField(id: number, type: number | undefined, value: Buffer): Buffer {
    const header = [id];
    // Length = type byte (if present) + value bytes
    const len = (type !== undefined ? 1 : 0) + value.length;
    header.push(len);
    if (type !== undefined) header.push(type);
    return Buffer.concat([Buffer.from(header), value]);
  }

  /** Build the hex payload for a `realtime_trigger` command (message type 0057). */
  private static realtimeTriggerPayload(timeoutSec: number): string {
    const now = Math.floor(Date.now() / 1000);
    const fields = [
      // a1 field: fixed marker (a1 01 22)
      Buffer.from('a10122', 'hex'),
      // a2 field: enable trigger (a2 02 01 01 = on)
      Buffer.from('a2020101', 'hex'),
      // a3 field: timeout as 4-byte LE var (a3 05 03 + timeout)
      AnkerSolixMqttClient.encodeField(0xa3, 0x03, Buffer.alloc(4)),
      // fe field: unix timestamp as 4-byte LE var (fe 05 03 + timestamp)
      AnkerSolixMqttClient.encodeField(0xfe, 0x03, Buffer.alloc(4)),
    ];
    fields[2].writeUInt32LE(timeoutSec, 3); // offset 3 = after a3/05/03
    fields[3].writeUInt32LE(now, 3); // offset 3 = after fe/05/03
    return AnkerSolixMqttClient.buildCommandPayload('0057', fields).toString('hex');
  }

  /** Build the hex payload for a `status_request` command (message type 0040). */
  private static statusRequestPayload(): string {
    const now = Math.floor(Date.now() / 1000);
    const fields = [
      // a1 field: fixed marker (a1 01 22)
      Buffer.from('a10122', 'hex'),
      // fe field: unix timestamp as 4-byte LE var
      AnkerSolixMqttClient.encodeField(0xfe, 0x03, Buffer.alloc(4)),
    ];
    fields[1].writeUInt32LE(now, 3);
    return AnkerSolixMqttClient.buildCommandPayload('0040', fields).toString('hex');
  }

  /**
   * Publish a `realtime_trigger` command for one or all devices.
   *
   * This tells the device to start sending real-time status messages at
   * ~3–5 second intervals. The stream stops after `timeout` seconds.
   *
   * @param timeout  Duration in seconds (30–600, default 300).
   * @param deviceSn Optional serial. If omitted, triggers all known devices.
   */
  public publishRealtimeTrigger(timeout = 300, deviceSn?: string): void {
    this.publishCommand(() => AnkerSolixMqttClient.realtimeTriggerPayload(timeout), deviceSn);
  }

  /**
   * Publish a `status_request` command for one or all devices.
   *
   * This is a one-shot request — the device responds immediately with its
   * current status. Useful for devices like smart plugs that don't support
   * continuous realtime triggers.
   *
   * @param deviceSn Optional serial. If omitted, requests all known devices.
   */
  public publishStatusRequest(deviceSn?: string): void {
    this.publishCommand(() => AnkerSolixMqttClient.statusRequestPayload(), deviceSn);
  }

  private publishCommand(buildHex: (device: SiteDevice) => string, deviceSn?: string): void {
    const mqttClient = this.mqttClient;
    const mqttInfo = this.mqttInfo;
    if (!mqttClient || !mqttInfo) {
      console.error('Cannot publish command: not connected.');
      return;
    }

    const targets = deviceSn ? this.devices.filter((d) => d.deviceSn === deviceSn) : this.devices;

    const now = Math.floor(Date.now() / 1000);

    for (const device of targets) {
      const productCode = device.productCode || '+';
      const topic = `cmd/${mqttInfo.appName}/${productCode}/${device.deviceSn}/req`;
      const hex = buildHex(device);
      const hexBytes = Buffer.from(hex, 'hex');

      // Python reference (api/mqtt.py :: publish):
      //   head.client_id = f"android-{app_name}-{user_id}-{certificate_id}"
      //   payload = json.dumps({ device_sn, account_id, data: b64encode(hexbytes) })
      const message = JSON.stringify({
        head: {
          version: '1.0.0.1',
          client_id: `android-${mqttInfo.appName}-${mqttInfo.userId}-${mqttInfo.certificateId}`,
          cmd: 17,
          sessId: '1234-5678',
          sess_id: '1234-5678',
          msg_seq: 1,
          seed: 1,
          timestamp: now,
          cmd_status: 2,
          sign_code: 1,
          device_pn: productCode,
          device_sn: device.deviceSn,
        },
        payload: JSON.stringify({
          device_sn: device.deviceSn,
          account_id: mqttInfo.userId,
          data: hexBytes.toString('base64'),
        }),
      });

      console.error(`Publishing to ${topic}`);
      console.error(`Payload (first 200 chars): ${message.slice(0, 200)}…`);

      mqttClient.publish(topic, message, { qos: 0 }, (err) => {
        if (err) {
          console.error(`Publish error on ${topic}: ${String(err)}`);
        } else {
          console.error(`Published to ${topic} (puback received)`);
        }
      });
    }
  }

  public async connect(): Promise<void> {
    if (this.mqttClient) {
      throw new Error('Already connected.');
    }
    // Cancel any pending reconnect timer
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.reconnectAttempts = 0; // Reset attempts on manual/successful connect
    console.error('Fetching MQTT credentials…');
    const [mqttInfo, devices] = await Promise.all([
      this.apiClient.getMqttInfo(),
      this.apiClient.getSiteDevices(),
    ]);

    if (devices.length === 0) {
      throw new Error('No devices found for this account.');
    }
    this.devices = devices;
    this.mqttInfo = mqttInfo;

    const brokerUrl = `mqtts://${mqttInfo.brokerHost}:${mqttInfo.brokerPort}`;
    console.error(`Connecting to ${brokerUrl}…`);

    const options: Parameters<typeof connect>[1] = {
      ca: mqttInfo.caCert,
      cert: mqttInfo.clientCert,
      key: mqttInfo.clientKey,
      rejectUnauthorized: true,
      protocol: 'mqtts',
    };
    if (mqttInfo.clientId) {
      options.clientId = mqttInfo.clientId;
    }

    const mqttClient = connect(brokerUrl, options);
    this.mqttClient = mqttClient;

    mqttClient.on('connect', () => {
      console.error('Connected.');
      this._connected = true;
      this.emit('connected', true);

      // Cancel any pending reconnect timer on successful connect
      if (this.reconnectTimer) {
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = null;
      }
      this.reconnectAttempts = 0;

      for (const device of devices) {
        const productCode = device.productCode || '+';
        const topic = `dt/anker_power/${productCode}/${device.deviceSn}/#`;
        mqttClient.subscribe(topic, (err) => {
          if (err) {
            console.error(`Subscribe error for ${topic}: ${String(err)}`);
          } else {
            console.error(`Subscribed to ${topic}`);
          }
        });
      }
    });

    mqttClient.on('message', (topic: string, payload: Buffer) => {
      // Try to parse the Anker Solix binary envelope.
      try {
        // Step 1: parse the outer envelope to extract pn and binary data
        const { pn, binaryData } = parseEnvelope(payload);

        // Step 2: parse the binary packet header to get the actual msgType,
        // then look up the correct field map for this device + message type.
        let fieldMap: FieldMap | undefined;
        if (pn && binaryData) {
          try {
            const { header } = parseHeader(binaryData);
            fieldMap = getFieldMap(pn, header.msgType);
          } catch {
            // If header parsing fails, fall back to the default 0405 map
            fieldMap = getFieldMap(pn, '0405');
          }
        }
        const result = parseMessage(payload, fieldMap);
        const decoded = result.packet?.decoded;

        // Include raw field info only with --raw flag (debugging / reverse engineering)
        let rawFields: Record<string, { id: string; type: string; hex: string }> | undefined;
        if (this.options.raw && result.packet?.rawFields && result.packet.rawFields.size > 0) {
          rawFields = {};
          for (const [id, rf] of result.packet.rawFields) {
            const key = id.toString(16).padStart(2, '0');
            rawFields[key] = {
              id: key,
              type: rf.type !== undefined ? `0x${rf.type.toString(16).padStart(2, '0')}` : '??',
              hex: rf.data.toString('hex'),
            };
          }
        }

        const msgEvent: MqttMessageEvent = {
          topic,
          pn: result.pn,
          sn: result.sn,
          msgType: result.packet?.header.msgType,
          checksumOk: result.packet?.checksumOk,
          decoded: decoded && Object.keys(decoded).length > 0 ? decoded : undefined,
          rawFields,
          jsonData: result.jsonData ?? undefined,
          head: result.head,
        };

        this.emit('message', msgEvent);
      } catch {
        // Fall back to raw output for non-envelope messages.
        let parsed: string;
        try {
          parsed = JSON.parse(payload.toString('utf8'));
        } catch {
          parsed = payload.toString('base64');
        }
        const rawEvent: MqttRawEvent = { topic, payload: parsed };
        this.emit('raw', rawEvent);
      }
    });

    mqttClient.on('error', async (err: Error) => {
      console.error(`MQTT error: ${err.message}`);
      await this.handleReconnect();
    });

    mqttClient.on('disconnect', async (packet?: unknown) => {
      console.error(`MQTT disconnect (from broker): ${JSON.stringify(packet)}`);
      await this.handleReconnect();
    });

    mqttClient.on('close', async (err?: Error) => {
      this.mqttClient = null;
      this._connected = false;
      this.emit('connected', false);
      if (err) {
        console.error(`MQTT connection closed with error:`, err.message);
        await this.handleReconnect();
      } else {
        console.error('MQTT connection closed.');
      }
    });

    mqttClient.on('offline', () => {
      console.error('MQTT client went offline.');
    });

    mqttClient.on('reconnect', () => {
      console.error('MQTT trying to reconnect - skipping.');
      mqttClient.end();
    });
  }

  private async handleReconnect(): Promise<void> {
    if (this.reconnectTimer) {
      return;
    }

    if (this.reconnectAttempts < this.reconnectDelays.length) {
      const delayMinutes = this.reconnectDelays[this.reconnectAttempts];
      this.reconnectAttempts++;
      console.error(
        `Connection failed. Retrying in ${delayMinutes} minute(s) (Attempt ${this.reconnectAttempts}/${this.reconnectDelays.length})...`,
      );

      this.reconnectTimer = setTimeout(
        async () => {
          this.reconnectTimer = null;
          try {
            await this.connect();
          } catch (err) {
            console.error(`Reconnect attempt failed: ${String(err)}`);
            await this.handleReconnect();
          }
        },
        delayMinutes * 60 * 1000,
      );
    } else {
      console.error('Max reconnection attempts reached. Stopping.');
    }
  }

  public disconnect(): void {
    if (this.mqttClient) {
      this.mqttClient.end();
      this.mqttClient = null;
    }
  }
}
