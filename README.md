# Anker Solix TypeScript Status Client

TypeScript project to read your Anker Solix device status (battery %, panel input watts, output watts) using the same cloud API flow as the Python project: https://github.com/thomluther/anker-solix-api.

## Setup

```bash
npm install
npm run build
```

## Run

Set environment variables:

- `ANKER_EMAIL`
- `ANKER_PASSWORD`
- `ANKER_COUNTRY_ID` (optional, default: `DE`)

Then run:

```bash
npm run start -- --site-id <SITE_ID> --device-sn <DEVICE_SN>
```

Both `--site-id` and `--device-sn` are optional.  
If omitted, the first available site and first Solarbank device are used.

## Output example

```json
{
  "siteId": "xxxxxxxx",
  "deviceSn": "xxxxxxxx",
  "batteryPercent": 76,
  "panelInputWatts": 512,
  "outputWatts": 240
}
```
