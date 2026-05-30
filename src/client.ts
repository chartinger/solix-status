import { createCipheriv, createECDH, createHash } from "node:crypto";

const API_SERVERS = {
  eu: "https://ankerpower-api-eu.anker.com",
  com: "https://ankerpower-api.anker.com",
} as const;

const COM_COUNTRIES = new Set([
  "DZ",
  "LB",
  "SY",
  "EG",
  "LY",
  "TN",
  "MA",
  "JO",
  "PS",
  "AR",
  "AU",
  "BR",
  "HK",
  "IN",
  "JP",
  "MX",
  "NG",
  "NZ",
  "RU",
  "SG",
  "ZA",
  "KR",
  "TW",
  "US",
  "CA",
  "RO",
]);

const ENDPOINTS = {
  login: "passport/login",
  siteList: "power_service/v1/site/get_site_list",
  sceneInfo: "power_service/v1/site/get_scen_info",
  mqttInfo: "power_service/v1/app/compatible/get_user_mqtt_info",
} as const;

const API_PUBLIC_KEY_HEX =
  "04c5c00c4f8d1197cc7c3167c52bf7acb054d722f0ef08dcd7e0883236e0d72a3868d9750cb47fa4619248f3d83f0f662671dadc6e2d31c2f41db0161651c7c076";

type JsonObject = Record<string, unknown>;

export interface AnkerClientOptions {
  email: string;
  password: string;
  countryId: string;
}

export interface DeviceStatus {
  siteId: string;
  deviceSn: string;
  batteryPercent: number | null;
  panelInputWatts: number | null;
  outputWatts: number | null;
}

export interface SiteInfo {
  site_id?: string;
}

export interface SiteDevice {
  siteId: string;
  deviceSn: string;
  productCode: string;
}

export interface MqttInfo {
  brokerHost: string;
  brokerPort: number;
  clientId: string;
  caCert: string;
  clientCert: string;
  clientKey: string;
}

export class AnkerSolixClient {
  private readonly email: string;
  private readonly password: string;
  private readonly countryId: string;
  private readonly apiBase: string;
  private readonly ecdh = createECDH("prime256v1");
  private readonly sharedKey: Buffer;

  private token: string | null = null;
  private gtoken: string | null = null;

  public constructor(options: AnkerClientOptions) {
    this.email = options.email;
    this.password = options.password;
    this.countryId = options.countryId.toUpperCase();
    this.apiBase = COM_COUNTRIES.has(this.countryId)
      ? API_SERVERS.com
      : API_SERVERS.eu;
    this.ecdh.generateKeys();
    this.sharedKey = this.ecdh.computeSecret(Buffer.from(API_PUBLIC_KEY_HEX, "hex"));
  }

  public async getCurrentStatus(siteId?: string, deviceSn?: string): Promise<DeviceStatus> {
    const targetSiteId = siteId ?? (await this.getSiteList())[0]?.site_id;
    if (!targetSiteId) {
      throw new Error("No site found for this account.");
    }

    const scene = await this.getSceneInfo(targetSiteId);
    const status = extractStatusFromScene(targetSiteId, scene, deviceSn);
    if (!status) {
      throw new Error("No matching Solarbank device found in scene data.");
    }
    return status;
  }

  public async getSiteList(): Promise<SiteInfo[]> {
    const response = await this.request<JsonObject>(ENDPOINTS.siteList, {});
    const list = response.site_list;
    return Array.isArray(list) ? (list as SiteInfo[]) : [];
  }

  public async getSceneInfo(siteId: string): Promise<JsonObject> {
    return this.request<JsonObject>(ENDPOINTS.sceneInfo, { site_id: siteId });
  }

  public async getSiteDevices(): Promise<SiteDevice[]> {
    const sites = await this.getSiteList();
    const devices: SiteDevice[] = [];
    for (const site of sites) {
      const siteId = site.site_id;
      if (!siteId) continue;
      const scene = await this.getSceneInfo(siteId);
      const solarbankInfo = asObject(scene.solarbank_info);
      const solarbankList = Array.isArray(solarbankInfo.solarbank_list)
        ? (solarbankInfo.solarbank_list as JsonObject[])
        : [];
      for (const device of solarbankList) {
        const deviceSn = String(device.device_sn ?? "");
        const productCode = String(device.product_code ?? "");
        if (deviceSn) {
          devices.push({ siteId, deviceSn, productCode });
        }
      }
    }
    return devices;
  }

  public async getMqttInfo(): Promise<MqttInfo> {
    const data = await this.request<JsonObject>(ENDPOINTS.mqttInfo, {});
    const brokerHost = String(data.broker_host ?? data.host ?? "");
    const brokerPort = Number(data.broker_port ?? data.port ?? 8883);
    const clientId = String(data.client_id ?? data.clientId ?? "");
    const caCert = String(data.ca_cert ?? data.caCert ?? "");
    const clientCert = String(data.client_cert ?? data.clientCert ?? "");
    const clientKey = String(data.client_private_key ?? data.client_key ?? data.clientKey ?? "");
    if (!brokerHost || !caCert || !clientCert || !clientKey) {
      throw new Error("Incomplete MQTT credentials returned by API.");
    }
    return { brokerHost, brokerPort, clientId, caCert, clientCert, clientKey };
  }

  private async request<T extends JsonObject>(endpoint: string, body: JsonObject): Promise<T> {
    if (endpoint !== ENDPOINTS.login && !this.token) {
      await this.authenticate();
    }

    const response = await fetch(`${this.apiBase}/${endpoint}`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(body),
    });

    const json = (await response.json()) as JsonObject;
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${JSON.stringify(json)}`);
    }

    if ((json.code as number | undefined) !== 0) {
      const message = (json.msg as string | undefined) ?? "Unknown API error";
      throw new Error(`Anker API error (${String(json.code)}): ${message}`);
    }

    return (json.data ?? {}) as T;
  }

  private async authenticate(): Promise<void> {
    const now = new Date();
    const loginBody = {
      ab: this.countryId,
      client_secret_info: { public_key: this.ecdh.getPublicKey("hex", "uncompressed") },
      enc: 0,
      email: this.email,
      password: this.encryptPassword(this.password),
      time_zone: -now.getTimezoneOffset() * 60 * 1000,
      transaction: String(Date.now()),
    };

    const response = await fetch(`${this.apiBase}/${ENDPOINTS.login}`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(loginBody),
    });
    const json = (await response.json()) as JsonObject;
    if (!response.ok || (json.code as number | undefined) !== 0) {
      throw new Error(`Login failed: ${JSON.stringify(json)}`);
    }

    const data = (json.data ?? {}) as JsonObject;
    const userId = String(data.user_id ?? "");
    this.token = String(data.auth_token ?? "");
    this.gtoken = userId ? createHash("md5").update(userId).digest("hex") : null;

    if (!this.token || !this.gtoken) {
      throw new Error("Login succeeded but token data is missing.");
    }
  }

  private headers(): Record<string, string> {
    const headers: Record<string, string> = {
      "content-type": "application/json",
      "model-type": "DESKTOP",
      "app-name": "anker_power",
      "os-type": "android",
      country: this.countryId,
      timezone: timezoneGmtString(),
    };
    if (this.token && this.gtoken) {
      headers["x-auth-token"] = this.token;
      headers.gtoken = this.gtoken;
    }
    return headers;
  }

  private encryptPassword(password: string): string {
    const iv = this.sharedKey.subarray(0, 16);
    const cipher = createCipheriv("aes-256-cbc", this.sharedKey, iv);
    return Buffer.concat([cipher.update(password, "utf8"), cipher.final()]).toString(
      "base64",
    );
  }
}

export function extractStatusFromScene(
  siteId: string,
  scene: JsonObject,
  deviceSn?: string,
): DeviceStatus | null {
  const solarbankInfo = asObject(scene.solarbank_info);
  const solarbankList = Array.isArray(solarbankInfo.solarbank_list)
    ? (solarbankInfo.solarbank_list as JsonObject[])
    : [];

  const device =
    (deviceSn
      ? solarbankList.find((entry) => String(entry.device_sn ?? "") === deviceSn)
      : solarbankList[0]) ?? null;

  if (!device) {
    return null;
  }

  const powerUnit = firstString(device.power_unit, solarbankInfo.power_unit) ?? "W";
  const batteryPercent = toNumber(device.battery_power);
  const panelInput = toWatts(
    firstNumber(device.photovoltaic_power, device.input_power, solarbankInfo.total_photovoltaic_power),
    powerUnit,
  );
  const output = toWatts(
    firstNumber(device.output_power, solarbankInfo.total_output_power),
    powerUnit,
  );

  return {
    siteId,
    deviceSn: String(device.device_sn ?? ""),
    batteryPercent,
    panelInputWatts: panelInput,
    outputWatts: output,
  };
}

function firstNumber(...values: unknown[]): number | null {
  for (const value of values) {
    const parsed = toNumber(value);
    if (parsed !== null) {
      return parsed;
    }
  }
  return null;
}

function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.length > 0) {
      return value;
    }
  }
  return null;
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
}

function toWatts(value: number | null, unit: string): number | null {
  if (value === null) {
    return null;
  }
  return unit.toLowerCase().includes("kw") ? Math.round(value * 1000) : Math.round(value);
}

function asObject(value: unknown): JsonObject {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as JsonObject;
  }
  return {};
}

function timezoneGmtString(): string {
  const offsetMinutes = -new Date().getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const absolute = Math.abs(offsetMinutes);
  const hours = String(Math.floor(absolute / 60)).padStart(2, "0");
  const minutes = String(absolute % 60).padStart(2, "0");
  return `GMT${sign}${hours}:${minutes}`;
}
