import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import helmet from "helmet";
import { PrismaClient } from "@prisma/client";
import { config } from "./config";
import authRoutes from "./routes/auth";
import shareRoutes from "./routes/shares";
import fileRoutes from "./routes/files";
import adminRoutes from "./routes/admin";
import { registerCleanupJob } from "./services/cleanup";
import { registerDailyStatsJob } from "./services/dailyStats";
import { registerDiskMonitorJob } from "./services/diskMonitor";
import { checkDiskSpace } from "./services/diskMonitor";
import { sendAdminNotification } from "./services/adminNotify";
import { cronRegistry } from "./services/cronRegistry";
import { adminRateLimit } from "./middleware/rateLimit";

const prisma = new PrismaClient();

const app = express();

app.set("trust proxy", 1);
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
  frameguard: { action: "deny" },
  referrerPolicy: { policy: "strict-origin-when-cross-origin" },
}));
app.use(cors({
  origin: config.corsOrigin,
  exposedHeaders: ["X-Chunk-IV"],
}));
app.use(express.json({ limit: "1mb" }));

app.use("/api/auth", authRoutes);
app.use("/api/shares", shareRoutes);
app.use("/api/shares", fileRoutes);
app.use("/api/admin", adminRateLimit, adminRoutes);

app.get("/api/health", async (_req, res) => {
  const checks: Record<string, string> = { db: "ok", disk: "ok" };
  let statusCode = 200;

  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    checks.db = "error";
    statusCode = 503;
  }

  const diskResult = checkDiskSpace();
  if (diskResult.status === "critical") {
    checks.disk = "critical";
    statusCode = 503;
  } else if (diskResult.status === "warn") {
    checks.disk = "warn";
  }

  res.status(statusCode).json({
    status: statusCode === 200 ? "ok" : "degraded",
    timestamp: new Date().toISOString(),
    checks,
    disk: { freePercent: diskResult.freePercent },
  });
});

app.get("/api/config", (_req, res) => {
  res.set("Cache-Control", "no-store");
  const opts = config.shareExpiryOptionsDays;
  const defaultVal = config.shareDefaultExpiryDays;
  res.json({
    shareExpiryOptions: opts.length > 0 ? opts : [1, 7, 14, 30, 90],
    shareDefaultExpiryDays: opts.includes(defaultVal) ? defaultVal : (opts[0] ?? 30),
  });
});

registerCleanupJob();
registerDailyStatsJob();
registerDiskMonitorJob();

// Express catch-all error handler
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error("[Express] Unhandled error:", err);
  res.status(500).json({ error: "Internal server error" });
});

cronRegistry.init().then(() => {
  app.listen(config.port, () => {
    console.log(`ShareDrop backend running on port ${config.port}`);
  });
}).catch((err) => {
  console.error("Failed to initialize cron registry:", err);
  process.exit(1);
});

process.on("uncaughtException", async (err) => {
  console.error("[FATAL] Uncaught exception:", err);
  try {
    await sendAdminNotification("uncaught_error", {
      error: err.message,
      stack: err.stack,
    });
  } catch { /* best effort */ }
  process.exit(1);
});

process.on("unhandledRejection", async (reason) => {
  console.error("[FATAL] Unhandled rejection:", reason);
  const msg = reason instanceof Error ? reason.message : String(reason);
  const stack = reason instanceof Error ? reason.stack : undefined;
  try {
    await sendAdminNotification("uncaught_error", { error: msg, stack });
  } catch { /* best effort */ }
});

export default app;
