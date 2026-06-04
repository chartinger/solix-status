# `@lab759/solix-api`

An unofficial TypeScript client for reading status data from Anker Solix devices (battery %, solar panel input watts, output watts, etc.).

This package is based on the [anker-solix-api](https://github.com/thomluther/anker-solix-api) Python project and reimplements the same cloud API flow in TypeScript.

## Installation

```bash
npm install @lab759/solix-api
```

## Usage

```ts
import { AnkerSolixClient } from "@lab759/solix-api";

const client = new AnkerSolixClient({
  email: "you@example.com",
  password: "your-password",
  countryId: "DE",
});

// Get current status for the first available site and Solarbank device
const status = await client.getCurrentStatus();
console.log(status);
// {
//   siteId: "xxxxxxxx",
//   deviceSn: "xxxxxxxx",
//   batteryPercent: 76,
//   panelInputWatts: 512,
//   outputWatts: 240,
//   pvInput1Watts: null,
//   pvInput2Watts: null,
//   pvInput3Watts: null,
//   pvInput4Watts: null,
// }

// List all sites and their Solarbank devices
const devices = await client.getSiteDevices();
for (const device of devices) {
  console.log(`${device.siteId} → ${device.deviceSn} (${device.productCode})`);
}

// Get status for a specific site / device
const status2 = await client.getCurrentStatus("your-site-id", "your-device-sn");
console.log(status2);

// Retrieve MQTT connection info for real-time data
const mqttInfo = await client.getMqttInfo();
console.log(mqttInfo);
```

## API

### `new AnkerSolixClient(options)`

| Option      | Type     | Description                            |
| ----------- | -------- | -------------------------------------- |
| `email`     | `string` | Your Anker account email               |
| `password`  | `string` | Your Anker account password            |
| `countryId` | `string` | ISO 3166-1 alpha-2 country code (e.g. `"DE"`, `"US"`) |

### Methods

- **`getCurrentStatus(siteId?, deviceSn?)`** — Returns the current battery/panel/output status. Omitting both arguments uses the first available site and device.
- **`getSiteList()`** — Returns all sites linked to the account.
- **`getSceneInfo(siteId)`** — Returns raw scene/scenario data for a site.
- **`getSiteDevices()`** — Returns a flat list of all Solarbank devices across all sites.
- **`getMqttInfo()`** — Returns MQTT broker connection credentials (certificates, host, port).

## Build

```bash
pnpm build
```

Uses [tsdown](https://github.com/rolldown/tsdown) to produce ESM (`.mjs`) and CJS (`.cjs`) bundles plus type declarations (`.d.cts`).

## License

MIT
