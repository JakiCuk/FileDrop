import { Request } from "express";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export type SecurityEventType =
  | "auth_failed"
  | "admin_denied"
  | "otp_invalid"
  | "rate_limited"
  | "path_traversal"
  | "invalid_input";

export function logSecurityEvent(
  event: SecurityEventType,
  req: Request,
  details?: Record<string, unknown>,
): void {
  const ip = req.ip || req.socket.remoteAddress || "unknown";
  const method = req.method;
  const path = req.originalUrl;

  console.warn(
    `[SECURITY] ${event}`,
    JSON.stringify({ timestamp: new Date().toISOString(), ip, method, path, ...details }),
  );

  prisma.securityEvent
    .create({
      data: {
        event,
        ip,
        method,
        path,
        details: details ? JSON.stringify(details) : null,
      },
    })
    .catch((err) => {
      console.error("[SecurityLog] DB write failed:", err);
    });
}
