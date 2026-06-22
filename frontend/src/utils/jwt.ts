/**
 * Decode the `exp` claim of a JWT without any external dependency.
 * Returns the expiry time in milliseconds since epoch, or null if the token
 * cannot be parsed or has no numeric `exp` (in which case callers fall back to
 * the reactive 401 path).
 */
export function getTokenExpiryMs(token: string): number | null {
  try {
    const payload = token.split(".")[1];
    if (!payload) return null;
    // base64url -> base64
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const json = JSON.parse(atob(base64));
    if (typeof json.exp !== "number") return null;
    return json.exp * 1000;
  } catch {
    return null;
  }
}
