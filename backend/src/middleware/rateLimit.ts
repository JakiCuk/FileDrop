import rateLimit from "express-rate-limit";
import { Request, Response } from "express";
import jwt from "jsonwebtoken";
import { logSecurityEvent } from "../services/securityLog";
import { getClientIp } from "../utils/clientIp";

function rateLimitHandler(limiterName: string) {
  return (req: Request, res: Response) => {
    logSecurityEvent("rate_limited", req, { limiter: limiterName });
    res.status(429).json({ error: "Too many requests. Slow down." });
  };
}

/**
 * Bucket key for admin endpoints. Prefers the email from a Bearer JWT
 * (decoded without verification — `requireAdmin` does the cryptographic
 * check later). Falls back to the client IP when no token is present or
 * the token is malformed, so unauthenticated abuse stays IP-throttled.
 */
function adminEmailKey(req: Request): string {
  const header = req.headers.authorization;
  if (header?.startsWith("Bearer ")) {
    const decoded = jwt.decode(header.slice(7)) as { email?: string } | null;
    if (decoded?.email) return `admin:${decoded.email.toLowerCase()}`;
  }
  return `ip:${getClientIp(req)}`;
}

export const otpRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.body?.email || getClientIp(req),
  handler: rateLimitHandler("otp"),
});

export const verifyOtpRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.body?.email || getClientIp(req),
  handler: rateLimitHandler("verifyOtp"),
});

export const fileInitRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => getClientIp(req),
  handler: rateLimitHandler("fileInit"),
});

export const shareCreateRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => getClientIp(req),
  handler: rateLimitHandler("shareCreate"),
});

export const adminRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: adminEmailKey,
  handler: rateLimitHandler("admin"),
});

export const adminWriteRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: adminEmailKey,
  handler: rateLimitHandler("adminWrite"),
});
