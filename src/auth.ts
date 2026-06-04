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

export function loadAuthTokens(): AuthTokens {
  const token = process.env.ANKER_TOKEN ?? null;
  const gtoken = process.env.ANKER_GTOKEN ?? null;
  return { token, gtoken };
}

export function loadAuthInfo(): AuthCredentials & AuthTokens {
  return { ...loadCredentials(), ...loadAuthTokens() };
}