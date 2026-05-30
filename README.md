# Anker Solix TypeScript Status Client

TypeScript project to read your Anker Solix device status (battery %, panel input watts, output watts) using the same cloud API flow as the Python project: https://github.com/thomluther/anker-solix-api.

## Setup

```bash
npm install
npm run build
```

Create a `.env` file in the project root:

```dotenv
ANKER_EMAIL=you@example.com
ANKER_PASSWORD=your-password
ANKER_COUNTRY_ID=DE
```

`ANKER_COUNTRY_ID` is optional (defaults to `DE`).

## Run

Then run:

```bash
npm run start -- --site-id <SITE_ID> --device-sn <DEVICE_SN>
```

To list all sites and discovered Solarbank devices:

```bash
npm run start -- --list
```

Both `--site-id` and `--device-sn` are optional.  
If omitted, the first available site and first Solarbank device are used.

`--list` prints all sites and their devices, then exits.

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
