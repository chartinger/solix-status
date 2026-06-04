const API_PUBLIC_KEY_HEX =
  "04c5c00c4f8d1197cc7c3167c52bf7acb054d722f0ef08dcd7e0883236e0d72a3868d9750cb47fa4619248f3d83f0f662671dadc6e2d31c2f41db0161651c7c076";

export type CryptoMaterial = {
  publicKeyHex: string;
  sharedKey: Uint8Array;
};

export async function createCryptoMaterial(
  serverPublicKeyHex: string = API_PUBLIC_KEY_HEX,
): Promise<CryptoMaterial> {
  const cryptoApi = getCryptoApi();
  const keyPair = await cryptoApi.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"],
  );
  const serverPublicKey = await cryptoApi.subtle.importKey(
    "raw",
    hexToBytes(serverPublicKeyHex),
    { name: "ECDH", namedCurve: "P-256" },
    false,
    [],
  );
  const sharedKeyBuffer = await cryptoApi.subtle.deriveBits(
    { name: "ECDH", public: serverPublicKey },
    keyPair.privateKey,
    256,
  );
  const publicKeyBuffer = await cryptoApi.subtle.exportKey("raw", keyPair.publicKey);
  return {
    publicKeyHex: bytesToHex(new Uint8Array(publicKeyBuffer)),
    sharedKey: new Uint8Array(sharedKeyBuffer),
  };
}

export async function encryptPassword(password: string, sharedKey: Uint8Array): Promise<string> {
  const iv = sharedKey.subarray(0, 16);
  const cryptoApi = getCryptoApi();
  const key = await cryptoApi.subtle.importKey(
    "raw",
    sharedKey,
    { name: "AES-CBC" },
    false,
    ["encrypt"],
  );
  const plaintext = new TextEncoder().encode(password);
  const encrypted = await cryptoApi.subtle.encrypt({ name: "AES-CBC", iv }, key, plaintext);
  return bytesToBase64(new Uint8Array(encrypted));
}

type CryptoSubtleLike = {
  generateKey: (
    algorithm: unknown,
    extractable: boolean,
    keyUsages: string[],
  ) => Promise<{ privateKey: unknown; publicKey: unknown }>;
  importKey: (
    format: string,
    keyData: Uint8Array | ArrayBuffer,
    algorithm: unknown,
    extractable: boolean,
    keyUsages: string[],
  ) => Promise<unknown>;
  deriveBits: (algorithm: unknown, baseKey: unknown, length: number) => Promise<ArrayBuffer>;
  exportKey: (format: string, key: unknown) => Promise<ArrayBuffer>;
  encrypt: (
    algorithm: unknown,
    key: unknown,
    data: Uint8Array | ArrayBuffer,
  ) => Promise<ArrayBuffer>;
};

function getCryptoApi(): { subtle: CryptoSubtleLike } {
  const cryptoApi = (globalThis as { crypto?: { subtle?: CryptoSubtleLike } }).crypto;
  if (!cryptoApi?.subtle) {
    throw new Error("Web Crypto API is not available in this runtime.");
  }
  return cryptoApi as { subtle: CryptoSubtleLike };
}

function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) {
    throw new Error("Invalid hex string length.");
  }
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
}

function bytesToBase64(bytes: Uint8Array): string {
  if (typeof btoa === "function") {
    let binary = "";
    for (const byte of bytes) {
      binary += String.fromCharCode(byte);
    }
    return btoa(binary);
  }
  return Buffer.from(bytes).toString("base64");
}

const MD5_S = [
  7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 5, 9, 14, 20, 5, 9,
  14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16,
  23, 4, 11, 16, 23, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
];

const MD5_K = Array.from(
  { length: 64 },
  (_, index) => Math.floor(Math.abs(Math.sin(index + 1)) * 2 ** 32) >>> 0,
);

export function md5Hex(value: string): string {
  const encoder = new TextEncoder();
  const input = encoder.encode(value);
  const withPadding = padMd5(input);

  let a0 = 0x67452301;
  let b0 = 0xefcdab89;
  let c0 = 0x98badcfe;
  let d0 = 0x10325476;

  for (let offset = 0; offset < withPadding.length; offset += 64) {
    const words = new Uint32Array(16);
    for (let i = 0; i < 16; i += 1) {
      const index = offset + i * 4;
      words[i] =
        withPadding[index]! |
        (withPadding[index + 1]! << 8) |
        (withPadding[index + 2]! << 16) |
        (withPadding[index + 3]! << 24);
    }

    let a = a0;
    let b = b0;
    let c = c0;
    let d = d0;

    for (let i = 0; i < 64; i += 1) {
      let f = 0;
      let g = 0;
      if (i < 16) {
        f = (b & c) | (~b & d);
        g = i;
      } else if (i < 32) {
        f = (d & b) | (~d & c);
        g = (5 * i + 1) % 16;
      } else if (i < 48) {
        f = b ^ c ^ d;
        g = (3 * i + 5) % 16;
      } else {
        f = c ^ (b | ~d);
        g = (7 * i) % 16;
      }

      const temp = d;
      d = c;
      c = b;
      const sum = (a + f + MD5_K[i]! + words[g]!) >>> 0;
      b = (b + rotateLeft(sum, MD5_S[i]!)) >>> 0;
      a = temp;
    }

    a0 = (a0 + a) >>> 0;
    b0 = (b0 + b) >>> 0;
    c0 = (c0 + c) >>> 0;
    d0 = (d0 + d) >>> 0;
  }

  const digest = new Uint8Array(16);
  writeUint32Le(digest, 0, a0);
  writeUint32Le(digest, 4, b0);
  writeUint32Le(digest, 8, c0);
  writeUint32Le(digest, 12, d0);
  return bytesToHex(digest);
}

function padMd5(input: Uint8Array): Uint8Array {
  const totalLength = (((input.length + 9 + 63) >> 6) << 6) >>> 0;
  const output = new Uint8Array(totalLength);
  output.set(input);
  output[input.length] = 0x80;

  const bitLength = input.length * 8;
  for (let i = 0; i < 8; i += 1) {
    output[output.length - 8 + i] = Math.floor(bitLength / 2 ** (8 * i)) & 0xff;
  }
  return output;
}

function rotateLeft(value: number, bits: number): number {
  return ((value << bits) | (value >>> (32 - bits))) >>> 0;
}

function writeUint32Le(buffer: Uint8Array, offset: number, value: number): void {
  buffer[offset] = value & 0xff;
  buffer[offset + 1] = (value >>> 8) & 0xff;
  buffer[offset + 2] = (value >>> 16) & 0xff;
  buffer[offset + 3] = (value >>> 24) & 0xff;
}