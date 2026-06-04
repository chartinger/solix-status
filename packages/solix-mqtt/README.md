# `@lab759/solix-mqtt`

An unofficial TypeScript MQTT client for real-time data streaming from Anker Solix devices.

Connects to the Anker Solix MQTT broker (AWS IoT), subscribes to all discovered Solarbank devices, and parses the custom binary protocol into human-readable key-value pairs. Built on top of `@lab759/solix-api` for authentication and credential retrieval.

## Installation

```bash
npm install @lab759/solix-mqtt
```

> **Note:** In the monorepo the package is referenced via `pnpm` workspaces (`"@lab759/solix-mqtt": "workspace:*"`).

## Prerequisites

`@lab759/solix-mqtt` requires an `AnkerSolixClient` instance from `@lab759/solix-api` for authentication. See the `solix-api` README for setup instructions.

## Usage

```ts
import { AnkerSolixClient } from "@lab759/solix-api";
import { AnkerSolixMqttClient } from "@lab759/solix-mqtt";

// 1. Create the REST API client to obtain MQTT credentials
const apiClient = new AnkerSolixClient({
  email: "you@example.com",
  password: "your-password",
  countryId: "DE",
});

// 2. Create the MQTT client (pass the API client)
const mqttClient = new AnkerSolixMqttClient(apiClient, { raw: false });

// 3. Listen for parsed messages
mqttClient.on("message", (data) => {
  console.log(`[${data.topic}]`);
  console.log(`  Device:  ${data.pn} (${data.sn})`);
  console.log(`  Type:    ${data.msgType}`);
  console.log(`  Checksum: ${data.checksumOk ? "✓" : "✗"}`);
  console.log("  Decoded:", data.decoded);
});

// 4. Listen for raw/unparseable messages
mqttClient.on("raw", (data) => {
  console.log(`[raw] ${data.topic}: ${data.payload}`);
});

// 5. Connect (fetches credentials, subscribes to all devices)
await mqttClient.connect();

// 6. Disconnect when done
mqttClient.disconnect();
```

## API

### `new AnkerSolixMqttClient(apiClient, options?)`

| Parameter    | Type                                      | Description                                |
| ------------ | ----------------------------------------- | ------------------------------------------ |
| `apiClient`  | `AnkerSolixClient`                        | Authenticated REST API client instance     |
| `options`    | `{ raw?: boolean }`                       | When `raw: true`, includes raw hex field data in events |

### Events

#### `"message"` — `MqttMessageEvent`

Emitted for each successfully parsed Anker Solix binary message.

| Field         | Type                      | Description                                                |
| ------------- | ------------------------- | ---------------------------------------------------------- |
| `topic`       | `string`                  | The MQTT topic the message arrived on                      |
| `pn`          | `string`                  | Device product number / model (e.g. `"A17C1"`, `"A17C5"`) |
| `sn`          | `string`                  | Device serial number                                       |
| `msgType`     | `string \| undefined`     | 2-byte message type as lowercase hex (e.g. `"0405"`)       |
| `checksumOk`  | `boolean \| undefined`    | Whether the XOR checksum verified                          |
| `decoded`     | `Record<string, unknown>` | Semantically decoded key-value pairs (e.g. `battery_soc`, `photovoltaic_power`) |
| `rawFields`   | `Record<string, ...>`     | Raw hex field data (only when `raw: true`)                 |
| `jsonData`    | `unknown`                 | Parsed JSON payload (X1/HES devices using non-binary protocol) |
| `head`        | `Record<string, unknown>` | Outer envelope header metadata                             |

#### `"raw"` — `MqttRawEvent`

Emitted for MQTT messages that cannot be parsed as Anker Solix binary envelopes (e.g. JSON status updates, heartbeat messages).

| Field     | Type     | Description                               |
| --------- | -------- | ----------------------------------------- |
| `topic`   | `string` | The MQTT topic the message arrived on     |
| `payload` | `string` | Raw payload (parsed JSON or base64 string) |

### Methods

- **`connect()`** — Fetches MQTT credentials via the REST API, discovers all Solarbank devices, connects to the broker, and subscribes to all device topics. Returns a `Promise<void>`.
- **`disconnect()`** — Disconnects from the MQTT broker and cleans up.

## Build

```bash
pnpm build
```

Uses [tsdown](https://github.com/rolldown/tsdown) to produce ESM (`.mjs`) and CJS (`.cjs`) bundles plus type declarations (`.d.cts`).

## License

MIT
