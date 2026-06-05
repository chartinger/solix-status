# `@lab759/solix-status`

CLI tools for polling and streaming status data from Anker Solix devices. This package is the entry point for the command-line interfaces in the monorepo.

## Prerequisites

Create a `.env` file in this directory (`packages/solix-status`):

```dotenv
ANKER_EMAIL=you@example.com
ANKER_PASSWORD=your-password
ANKER_COUNTRY_ID=DE
```

`ANKER_COUNTRY_ID` is optional (defaults to `DE`).

Auth tokens are cached to `apitoken.cache.json` after the first successful login to avoid repeated authentication.

## Scripts

| Command | Description |
|---------|-------------|
| `pnpm api` | Poll the REST API for device status |
| `pnpm mqtt` | Stream real-time data via MQTT |
| `pnpm bridge` | Stream MQTT data and relay to a second MQTT broker |

---

### `api` — Poll REST API

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

**Output:**

```json
{
  "siteId": "xxxxxxxx",
  "deviceSn": "xxxxxxxx",
  "batteryPercent": 76,
  "panelInputWatts": 512,
  "outputWatts": 240
}
```

---

### `mqtt` — Real-time MQTT stream

```bash
pnpm mqtt [--raw]
```

Connects to the Anker Solix MQTT broker (AWS IoT), subscribes to all discovered Solarbank devices, and prints parsed binary messages as they arrive.

| Argument | Description |
|----------|-------------|
| `--raw` | Include raw hex field dumps in the output (useful for reverse engineering) |

Press `Ctrl+C` to disconnect.

---

### `bridge` — MQTT-to-MQTT bridge

```bash
pnpm bridge [--raw]
```

Same as the MQTT stream, but also publishes device status updates to a **second MQTT broker** (e.g. a local Home Assistant instance).

Requires these additional environment variables:

| Variable | Description |
|----------|-------------|
| `TARGET_BROKER` | Host of the target MQTT broker (e.g. `localhost:1883`) |
| `TARGET_TOPIC` | MQTT topic to publish status JSON to |

On startup it publishes an initial snapshot from the REST API, then streams real-time updates as they arrive over MQTT.

---

## Running from the monorepo root

All three commands are also proxied from the monorepo root via `pnpm workspace` filters:

```bash
# From the repository root
pnpm api --list
pnpm mqtt --raw
pnpm bridge
```

## Build

```bash
pnpm build
```

Uses [tsdown](https://github.com/rolldown/tsdown) to produce ESM bundles and type declarations.

## License

MIT
