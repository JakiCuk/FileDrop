const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SLUG_RE = /^[a-zA-Z0-9_-]{1,64}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const OTP_RE = /^\d{6}$/;
const BASE64_RE = /^[A-Za-z0-9+/=_-]+$/;

export function sanitizeString(value: unknown, maxLen: number): string | null {
  if (typeof value !== "string") return null;
  return value.trim().slice(0, maxLen);
}

export function isValidEmail(value: unknown): value is string {
  return typeof value === "string" && value.length <= 254 && EMAIL_RE.test(value);
}

export function isValidSlug(value: unknown): value is string {
  return typeof value === "string" && SLUG_RE.test(value);
}

export function isValidUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

export function isValidOtp(value: unknown): boolean {
  const str = typeof value === "number" ? String(value) : value;
  return typeof str === "string" && OTP_RE.test(str);
}

export function isValidBase64(value: unknown, maxLen: number): value is string {
  return typeof value === "string" && value.length <= maxLen && BASE64_RE.test(value);
}

export function isValidLocale(value: unknown): value is string {
  return typeof value === "string" && value.length <= 10;
}

export function isPositiveInt(value: unknown, max?: number): value is number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) return false;
  if (max !== undefined && value > max) return false;
  return true;
}
