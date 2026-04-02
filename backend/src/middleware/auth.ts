import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { config } from "../config";
import { logSecurityEvent } from "../services/securityLog";

export interface AuthPayload {
  userId: string;
  email: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthPayload;
    }
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    logSecurityEvent("auth_failed", req, { reason: "missing token" });
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, config.jwtSecret, { algorithms: ["HS256"] }) as AuthPayload;
    req.user = payload;
    next();
  } catch {
    logSecurityEvent("auth_failed", req, { reason: "invalid token" });
    res.status(401).json({ error: "Invalid or expired token" });
  }
}

export function optionalAuth(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (header?.startsWith("Bearer ")) {
    const token = header.slice(7);
    try {
      req.user = jwt.verify(token, config.jwtSecret, { algorithms: ["HS256"] }) as AuthPayload;
    } catch {
      // token invalid — proceed without auth
    }
  }
  next();
}
