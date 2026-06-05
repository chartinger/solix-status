# Anker Solix TypeScript Status Client

TypeScript project to read your Anker Solix device status (battery %, panel input watts, output watts) using the same cloud API flow as the Python project: https://github.com/thomluther/anker-solix-api.

This is a **pnpm monorepo** containing the reusable library packages and CLI tools.

## Packages

| Package | Description |
|---------|-------------|
| [`@lab759/solix-api`](./packages/solix-api) | Cloud REST API client — login, status queries, site/device discovery, MQTT credential retrieval |
| [`@lab759/solix-mqtt`](./packages/solix-mqtt) | MQTT client for real-time binary protocol data from Anker Solix devices |
| [`@lab759/solix-status`](./packages/solix-status) | CLI tools — REST polling, MQTT streaming, and MQTT-to-MQTT bridge |

## Setup

```bash
pnpm install
pnpm build
```

Create a `.env` file in [`packages/solix-status`](./packages/solix-status):

```dotenv
ANKER_EMAIL=you@example.com
ANKER_PASSWORD=your-password
ANKER_COUNTRY_ID=DE
```

`ANKER_COUNTRY_ID` is optional (defaults to `DE`).

## CLI Usage

The CLI scripts live in the [`@lab759/solix-status`](./packages/solix-status) package and are exposed as `pnpm` scripts from the monorepo root.

### Poll REST API

```bash
pnpm api [options]
```

| Option | Description |
|--------|-------------|
| `--site-id <ID>` | Target a specific site (optional — uses the first available if omitted) |
| `--device-sn <SN>` | Target a specific device (optional — uses the first Solarbank if omitted) |
| `--list` | List all sites and their Solarbank devices, then exit |
| `--watch` | Poll continuously at a fixed interval |
| `--interval <SECONDS>` | Polling interval in seconds (default `30`, used with `--watch`) |

**Examples:**

```bash
# One-shot status
pnpm api --site-id xxxxxxxx --device-sn xxxxxxxx

# List all sites and devices
pnpm api --list

# Watch mode (poll every 60 s)
pnpm api --watch --interval 60
```

### MQTT real-time stream

```bash
pnpm mqtt [--raw]
```

Connects to the Anker Solix MQTT broker, subscribes to all discovered devices, and prints parsed binary messages as they arrive. Add `--raw` to include raw hex field dumps (useful for reverse engineering).

### MQTT-to-MQTT bridge

```bash
pnpm bridge [--raw]
```

Same as the MQTT stream, but also publishes parsed device status to a **second MQTT broker** (e.g. a local Home Assistant MQTT instance). Requires these additional environment variables:

| Variable | Description |
|----------|-------------|
| `TARGET_BROKER` | Host of the target MQTT broker (e.g. `localhost:1883`) |
| `TARGET_TOPIC` | MQTT topic to publish status updates to |

## Output example (REST API)

```json
{
  "siteId": "xxxxxxxx",
  "deviceSn": "xxxxxxxx",
  "batteryPercent": 76,
  "panelInputWatts": 512,
  "outputWatts": 240
}
```
