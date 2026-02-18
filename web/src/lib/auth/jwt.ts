// JWT creation, verification, and refresh logic
// Uses jose library for edge-compatible JWT operations (no Node.js crypto dependency)

import { SignJWT, jwtVerify, type JWTPayload } from "jose";

/** Access token payload shape */
export interface AccessTokenPayload extends JWTPayload {
  sub: string;
  email: string;
  role: string;
}

/** Refresh token payload shape */
export interface RefreshTokenPayload extends JWTPayload {
  sub: string;
  type: "refresh";
}

const ACCESS_TOKEN_EXPIRY = "15m";
const REFRESH_TOKEN_EXPIRY = "7d";

/**
 * Get the JWT signing secret as a Uint8Array (required by jose).
 */
function getSecret(envVar: string): Uint8Array {
  const secret = process.env[envVar];
  if (!secret) {
    throw new Error(`${envVar} environment variable is not set`);
  }
  return new TextEncoder().encode(secret);
}

/**
 * Create a signed access token (15 min expiry).
 */
export async function createAccessToken(payload: { sub: string; email: string; role: string }): Promise<string> {
  return new SignJWT({ ...payload }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime(ACCESS_TOKEN_EXPIRY).sign(getSecret("JWT_SECRET"));
}

/**
 * Create a signed refresh token (7 day expiry).
 */
export async function createRefreshToken(sub: string): Promise<string> {
  return new SignJWT({ sub, type: "refresh" }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime(REFRESH_TOKEN_EXPIRY).sign(getSecret("JWT_REFRESH_SECRET"));
}

/**
 * Verify and decode an access token.
 */
export async function verifyAccessToken(token: string): Promise<AccessTokenPayload> {
  const { payload } = await jwtVerify(token, getSecret("JWT_SECRET"));
  return payload as AccessTokenPayload;
}

/**
 * Verify and decode a refresh token.
 */
export async function verifyRefreshToken(token: string): Promise<RefreshTokenPayload> {
  const { payload } = await jwtVerify(token, getSecret("JWT_REFRESH_SECRET"));
  return payload as RefreshTokenPayload;
}
