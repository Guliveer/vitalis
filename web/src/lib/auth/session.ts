import { cookies } from "next/headers";
import { verifyAccessToken, type AccessTokenPayload } from "./jwt";

/**
 * Verify the current session from the access_token cookie.
 * Returns the decoded token payload, or null if not authenticated.
 *
 * Server components only — uses next/headers.
 */
export async function getSession(): Promise<AccessTokenPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get("access_token")?.value;

  if (!token) return null;

  try {
    return await verifyAccessToken(token);
  } catch {
    return null;
  }
}
