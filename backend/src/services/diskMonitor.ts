import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { config } from "../config";
import { cronRegistry } from "./cronRegistry";
import { sendAdminNotification } from "./adminNotify";

export interface DiskInfo {
  total: bigint;
  free: bigint;
}

export interface DiskSpaceResult {
  totalBytes: bigint;
  freeBytes: bigint;
  freePercent: number;
  status: "ok" | "warn" | "critical";
}

let cachedResult: DiskSpaceResult | null = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 30_000;

export function getDiskInfo(dirPath: string): DiskInfo {
  try {
    if (process.platform === "win32") {
      const drive = path.resolve(dirPath).slice(0, 2);
      const out = execSync(
        `wmic logicaldisk where "DeviceID='${drive}'" get Size,FreeSpace /format:csv`,
        { encoding: "utf-8" },
      );
      const lines = out.trim().split("\n").filter((l) => l.trim());
      const last = lines[lines.length - 1].split(",");
      return { free: BigInt(last[1].trim()), total: BigInt(last[2].trim()) };
    } else {
      const out = execSync(`df -B1 "${dirPath}" | tail -1`, {
        encoding: "utf-8",
      });
      const parts = out.trim().split(/\s+/);
      return { total: BigInt(parts[1]), free: BigInt(parts[3]) };
    }
  } catch {
    return { total: BigInt(0), free: BigInt(0) };
  }
}

export function getDirSizeBytes(dirPath: string): bigint {
  let total = BigInt(0);
  if (!fs.existsSync(dirPath)) return total;

  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      total += getDirSizeBytes(fullPath);
    } else {
      total += BigInt(fs.statSync(fullPath).size);
    }
  }
  return total;
}

export function checkDiskSpace(useCache = true): DiskSpaceResult {
  const now = Date.now();
  if (useCache && cachedResult && now - cacheTimestamp < CACHE_TTL_MS) {
    return cachedResult;
  }

  const info = getDiskInfo(config.uploadDir);
  const freePercent =
    info.total > 0
      ? Math.round(Number((BigInt(10000) * info.free) / info.total)) / 100
      : 100;

  let status: DiskSpaceResult["status"] = "ok";
  if (freePercent <= config.diskBlockThresholdPercent) {
    status = "critical";
  } else if (freePercent <= config.diskWarnThresholdPercent) {
    status = "warn";
  }

  const result: DiskSpaceResult = {
    totalBytes: info.total,
    freeBytes: info.free,
    freePercent,
    status,
  };

  cachedResult = result;
  cacheTimestamp = now;
  return result;
}

async function diskMonitorHandler(): Promise<void> {
  const result = checkDiskSpace(false);
  if (result.status === "critical") {
    await sendAdminNotification("disk_critical", {
      freePercent: result.freePercent,
      freeBytes: result.freeBytes.toString(),
      totalBytes: result.totalBytes.toString(),
    });
  } else if (result.status === "warn") {
    await sendAdminNotification("disk_warn", {
      freePercent: result.freePercent,
      freeBytes: result.freeBytes.toString(),
      totalBytes: result.totalBytes.toString(),
    });
  }
}

export function registerDiskMonitorJob(): void {
  cronRegistry.register({
    id: "disk-monitor",
    name: "Disk Space Monitor",
    description:
      "Periodically checks free disk space and notifies admins when thresholds are exceeded",
    defaultSchedule: "*/30 * * * *",
    handler: diskMonitorHandler,
  });
}
