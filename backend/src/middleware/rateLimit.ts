import rateLimit from "express-rate-limit";
import { Request, Response } from "express";
import { logSecurityEvent } from "../services/securityLog";

function rateLimitHandler(limiterName: string) {
  return (req: Request, res: Response) => {
    logSecurityEvent("rate_limited", req, { limiter: limiterName });
    res.status(429).json({ error: "Too many requests. Slow down." });
  };
}

export const otpRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.body?.email || req.ip || "unknown",
  handler: rateLimitHandler("otp"),
});

export const verifyOtpRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.body?.email || req.ip || "unknown",
  handler: rateLimitHandler("verifyOtp"),
});

export const fileInitRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler("fileInit"),
});

export const shareCreateRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler("shareCreate"),
});

export const adminRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler("admin"),
});
