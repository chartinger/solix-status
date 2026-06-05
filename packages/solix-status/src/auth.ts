import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TOKEN_CACHE_FILE = join(__dirname, "..", "apitoken.cache.json");

export interface AuthCredentials {
  email: string;
  password: string;
  countryId: string;
}

export interface AuthTokens {
  token: string | null;
  gtoken: string | null;
}

export function loadCredentials(): AuthCredentials {
  const email = process.env.ANKER_EMAIL ?? null;
  const password = process.env.ANKER_PASSWORD ?? null;
  const countryId = process.env.ANKER_COUNTRY_ID ?? 'DE';
  if (!email || !password) {
    throw new Error("Set ANKER_EMAIL and ANKER_PASSWORD environment variables.");
  }
  return { email, password, countryId };
}

export function loadAuthTokensFromCache(): AuthTokens {
  try {
    if (existsSync(TOKEN_CACHE_FILE)) {
      const raw = readFileSync(TOKEN_CACHE_FILE, "utf-8");
      const data = JSON.parse(raw) as AuthTokens;
      return { token: data.token ?? null, gtoken: data.gtoken ?? null };
    }
  } catch {
    // Ignore cache read errors
  }
  return { token: null, gtoken: null };
}

export function saveAuthTokensToCache(tokens: AuthTokens): void {
  try {
    writeFileSync(TOKEN_CACHE_FILE, JSON.stringify(tokens, null, 2), "utf-8");
  } catch (error) {
    console.warn("Failed to write token cache:", error instanceof Error ? error.message : String(error));
  }
}

export function loadAuthTokens(): AuthTokens {
  // Try cache first, fall back to environment variables
  const cached = loadAuthTokensFromCache();
  if (cached.token && cached.gtoken) {
    return cached;
  }
  const token = process.env.ANKER_TOKEN ?? null;
  const gtoken = process.env.ANKER_GTOKEN ?? null;
  return { token, gtoken };
}

export function loadAuthInfo(): AuthCredentials & AuthTokens {
  return { ...loadCredentials(), ...loadAuthTokens() };
}