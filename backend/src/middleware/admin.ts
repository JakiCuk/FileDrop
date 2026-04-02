import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { config } from "../config";
import { logSecurityEvent } from "../services/securityLog";
import { AuthPayload } from "./auth";

declare global {
  namespace Express {
    interface Request {
      adminRole?: "admin" | "viewer";
    }
  }
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    logSecurityEvent("auth_failed", req, { reason: "missing token", target: "admin" });
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, config.jwtSecret, { algorithms: ["HS256"] }) as AuthPayload;
    req.user = payload;
  } catch {
    logSecurityEvent("auth_failed", req, { reason: "invalid token", target: "admin" });
    res.status(401).json({ error: "Invalid or expired token" });
    return;
  }

  const adminEntry = config.adminUsers.find(
    (u) => u.email === req.user!.email.toLowerCase()
  );

  if (!adminEntry) {
    logSecurityEvent("admin_denied", req, { email: req.user!.email });
    res.status(403).json({ error: "Admin access required" });
    return;
  }

  req.adminRole = adminEntry.role;
  next();
}

export function requireAdminWrite(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    logSecurityEvent("auth_failed", req, { reason: "missing token", target: "admin" });
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, config.jwtSecret, { algorithms: ["HS256"] }) as AuthPayload;
    req.user = payload;
  } catch {
    logSecurityEvent("auth_failed", req, { reason: "invalid token", target: "admin" });
    res.status(401).json({ error: "Invalid or expired token" });
    return;
  }

  const adminEntry = config.adminUsers.find(
    (u) => u.email === req.user!.email.toLowerCase()
  );

  if (!adminEntry) {
    logSecurityEvent("admin_denied", req, { email: req.user!.email });
    res.status(403).json({ error: "Admin access required" });
    return;
  }

  if (adminEntry.role !== "admin") {
    logSecurityEvent("admin_denied", req, { email: req.user!.email, reason: "viewer role" });
    res.status(403).json({ error: "Write access requires admin role" });
    return;
  }

  req.adminRole = adminEntry.role;
  next();
}
