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
export declare class AnkerSolixClient {
    private readonly email;
    private readonly password;
    private readonly countryId;
    private readonly apiBase;
    private readonly ecdh;
    private readonly sharedKey;
    private token;
    private gtoken;
    constructor(options: AnkerClientOptions);
    getCurrentStatus(siteId?: string, deviceSn?: string): Promise<DeviceStatus>;
    getSiteList(): Promise<SiteInfo[]>;
    getSceneInfo(siteId: string): Promise<JsonObject>;
    private request;
    private authenticate;
    private headers;
    private encryptPassword;
}
export declare function extractStatusFromScene(siteId: string, scene: JsonObject, deviceSn?: string): DeviceStatus | null;
export {};
//# sourceMappingURL=client.d.ts.map