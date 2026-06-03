import { createCryptoMaterial, encryptPassword, md5Hex, type CryptoMaterial } from "./crypto.js";

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
  mqttInfo: "app/devicemanage/get_user_mqtt_info",
} as const;

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
  pvInput1Watts: number | null;
  pvInput2Watts: number | null;
  pvInput3Watts: number | null;
  pvInput4Watts: number | null;
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
  private readonly cryptoMaterialPromise: Promise<CryptoMaterial>;
  private refreshAuthPromise: Promise<void> | null = null;

  private token: string | null = null;
  private gtoken: string | null = null;

  public constructor(options: AnkerClientOptions) {
    this.email = options.email;
    this.password = options.password;
    this.countryId = options.countryId.toUpperCase();
    this.apiBase = COM_COUNTRIES.has(this.countryId)
      ? API_SERVERS.com
      : API_SERVERS.eu;
    this.cryptoMaterialPromise = createCryptoMaterial();
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
    const endpointAddr = String(data.endpoint_addr ?? data.broker_host ?? data.host ?? "").trim();
    const endpointUrl =
      endpointAddr.startsWith("mqtt://") || endpointAddr.startsWith("mqtts://")
        ? endpointAddr
        : endpointAddr
          ? `mqtts://${endpointAddr}`
          : "";
    let brokerHost = "";
    let brokerPort = Number(data.broker_port ?? data.port ?? 8883);
    if (endpointUrl) {
      try {
        const parsed = new URL(endpointUrl);
        brokerHost = parsed.hostname;
        brokerPort = parsed.port ? Number(parsed.port) : brokerPort;
      } catch {
        brokerHost = endpointAddr;
      }
    }
    const clientId = String(data.thing_name ?? data.client_id ?? data.clientId ?? "");
    const caCert = String(data.aws_root_ca1_pem ?? data.ca_cert ?? data.caCert ?? "");
    const clientCert = String(data.certificate_pem ?? data.client_cert ?? data.clientCert ?? "");
    const clientKey = String(
      data.private_key ?? data.client_private_key ?? data.client_key ?? data.clientKey ?? "",
    );
    if (!brokerHost || !caCert || !clientCert || !clientKey) {
      throw new Error("Incomplete MQTT credentials returned by API.");
    }
    return { brokerHost, brokerPort, clientId, caCert, clientCert, clientKey };
  }

  private async request<T extends JsonObject>(
    endpoint: string,
    body: JsonObject,
    retriedAfterAuthFailure = false,
  ): Promise<T> {
    if (endpoint !== ENDPOINTS.login) {
      await this.ensureAuthenticated();
    }

    const response = await fetch(`${this.apiBase}/${endpoint}`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(body),
    });

    const json = await this.parseJsonResponse(response, endpoint);

    if (
      endpoint !== ENDPOINTS.login &&
      !retriedAfterAuthFailure &&
      this.isAuthenticationFailure(response.status, json)
    ) {
      this.clearSession();
      await this.ensureAuthenticated();
      return this.request<T>(endpoint, body, true);
    }

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${JSON.stringify(json)}`);
    }

    if ((json.code as number | undefined) !== 0) {
      const message = (json.msg as string | undefined) ?? "Unknown API error";
      throw new Error(`Anker API error (${String(json.code)}): ${message}`);
    }

    return (json.data ?? {}) as T;
  }

  private async ensureAuthenticated(): Promise<void> {
    if (this.token && this.gtoken) {
      return;
    }
    if (!this.refreshAuthPromise) {
      this.refreshAuthPromise = this.authenticate().finally(() => {
        this.refreshAuthPromise = null;
      });
    }
    await this.refreshAuthPromise;
  }

  private clearSession(): void {
    this.token = null;
    this.gtoken = null;
  }

  private isAuthenticationFailure(statusCode: number, json: JsonObject): boolean {
    if (statusCode === 401 || statusCode === 403) {
      return true;
    }

    const code = json.code;
    if (typeof code === "number" && (code === 401 || code === 403)) {
      return true;
    }

    const message = String(json.msg ?? "").toLowerCase();
    if (!message) {
      return false;
    }
    return /auth|token|login|session|expire|expired|unauthorized|forbidden/.test(message);
  }

  private async authenticate(): Promise<void> {
    const cryptoMaterial = await this.cryptoMaterialPromise;
    const now = new Date();
    const loginBody = {
      ab: this.countryId,
      client_secret_info: { public_key: cryptoMaterial.publicKeyHex },
      enc: 0,
      email: this.email,
      password: await encryptPassword(this.password, cryptoMaterial.sharedKey),
      time_zone: -now.getTimezoneOffset() * 60 * 1000,
      transaction: String(Date.now()),
    };

    const response = await fetch(`${this.apiBase}/${ENDPOINTS.login}`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(loginBody),
    });
    const json = await this.parseJsonResponse(response, ENDPOINTS.login);
    if (!response.ok || (json.code as number | undefined) !== 0) {
      throw new Error(`Login failed: ${JSON.stringify(json)}`);
    }

    const data = (json.data ?? {}) as JsonObject;
    const userId = String(data.user_id ?? "");
    this.token = String(data.auth_token ?? "");
    this.gtoken = userId ? md5Hex(userId) : null;

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

  private async parseJsonResponse(response: Response, endpoint: string): Promise<JsonObject> {
    const raw = await response.text();
    try {
      const parsed = JSON.parse(raw) as unknown;
      return asObject(parsed);
    } catch {
      const preview = raw.replace(/\s+/g, " ").trim().slice(0, 200);
      const body = preview.length > 0 ? preview : "<empty body>";
      throw new Error(
        `Invalid JSON response from ${endpoint} (HTTP ${response.status}): ${body}`,
      );
    }
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
  const pvInput1 = toWatts(toNumber(solarbankInfo.solar_power_1), powerUnit);
  const pvInput2 = toWatts(toNumber(solarbankInfo.solar_power_2), powerUnit);
  const pvInput3 = toWatts(toNumber(solarbankInfo.solar_power_3), powerUnit);
  const pvInput4 = toWatts(toNumber(solarbankInfo.solar_power_4), powerUnit);
  const output = toWatts(
    firstNumber(device.output_power, solarbankInfo.total_output_power),
    powerUnit,
  );

  return {
    siteId,
    deviceSn: String(device.device_sn ?? ""),
    batteryPercent,
    panelInputWatts: panelInput,
    pvInput1Watts: pvInput1,
    pvInput2Watts: pvInput2,
    pvInput3Watts: pvInput3,
    pvInput4Watts: pvInput4,
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
