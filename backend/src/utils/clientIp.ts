import { Request } from "express";

function normalize(ip: string | undefined | null): string | null {
  if (!ip) return null;
  const trimmed = ip.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("::ffff:")) return trimmed.slice(7);
  return trimmed;
}

export function getClientIp(req: Request): string {
  return (
    normalize(req.ip) ||
    normalize(req.socket?.remoteAddress) ||
    "unknown"
  );
}

const HEADERS = [
  "x-forwarded-for",
  "x-real-ip",
  "x-original-forwarded-for",
  "x-client-ip",
  "true-client-ip",
  "cf-connecting-ip",
  "forwarded",
];

export function debugIpSnapshot(req: Request): Record<string, unknown> {
  const headers: Record<string, string | string[] | undefined> = {};
  for (const h of HEADERS) headers[h] = req.headers[h];
  return {
    resolvedIp: getClientIp(req),
    expressIp: req.ip,
    expressIps: req.ips,
    socketRemoteAddress: req.socket?.remoteAddress,
    headers,
  };
}
