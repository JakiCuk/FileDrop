import { Router } from "express";
import jwt from "jsonwebtoken";
import { PrismaClient } from "@prisma/client";
import { config } from "../config";
import { generateOtp } from "../utils/crypto";
import { sendOtpEmail } from "../services/email";
import { otpRateLimit, verifyOtpRateLimit } from "../middleware/rateLimit";
import { isValidEmail, isValidOtp, isValidLocale } from "../middleware/validate";
import { logSecurityEvent } from "../services/securityLog";

const router = Router();
const prisma = new PrismaClient();

router.post("/request-otp", otpRateLimit, async (req, res) => {
  try {
    const { email, locale } = req.body;
    if (!isValidEmail(email)) {
      res.status(400).json({ error: "Invalid email" });
      return;
    }

    const safeLocale = isValidLocale(locale) ? locale : undefined;
    const normalizedEmail = email.trim().toLowerCase();
    const domain = normalizedEmail.split("@")[1];

    if (config.allowedEmailDomains.length > 0 && !config.allowedEmailDomains.includes(domain)) {
      res.status(403).json({ error: "Email domain not allowed" });
      return;
    }

    let user = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (!user) {
      user = await prisma.user.create({ data: { email: normalizedEmail } });
    }

    await prisma.otpCode.updateMany({
      where: { userId: user.id, used: false },
      data: { used: true },
    });

    const code = generateOtp();
    await prisma.otpCode.create({
      data: {
        userId: user.id,
        code,
        expiresAt: new Date(Date.now() + config.otpExpiryMinutes * 60 * 1000),
      },
    });

    await sendOtpEmail(normalizedEmail, code, safeLocale);
    res.json({ message: "OTP sent", email: normalizedEmail });
  } catch (err) {
    console.error("[Auth] request-otp error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/verify-otp", verifyOtpRateLimit, async (req, res) => {
  try {
    const { email, code } = req.body;
    if (!isValidEmail(email) || !isValidOtp(code)) {
      logSecurityEvent("invalid_input", req, { reason: "invalid email or OTP format" });
      res.status(400).json({ error: "Email and code are required" });
      return;
    }

    const normalizedEmail = email.trim().toLowerCase();
    const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });

    if (!user) {
      res.status(401).json({ error: "Invalid email or code" });
      return;
    }

    const otp = await prisma.otpCode.findFirst({
      where: {
        userId: user.id,
        code: code.toString(),
        used: false,
        expiresAt: { gt: new Date() },
      },
    });

    if (!otp) {
      logSecurityEvent("otp_invalid", req, { email: normalizedEmail });
      res.status(401).json({ error: "Invalid or expired code" });
      return;
    }

    await prisma.otpCode.update({
      where: { id: otp.id },
      data: { used: true },
    });

    const payload = { userId: user.id, email: user.email };
    const token = jwt.sign(payload, config.jwtSecret, {
      expiresIn: config.jwtExpiry as string,
    } as jwt.SignOptions);

    res.json({ token, user: { id: user.id, email: user.email } });
  } catch (err) {
    console.error("[Auth] verify-otp error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
