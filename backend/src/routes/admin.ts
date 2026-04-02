import { Router } from "express";
import { PrismaClient } from "@prisma/client";
import { config } from "../config";
import { requireAdmin, requireAdminWrite } from "../middleware/admin";
import { isValidSlug, sanitizeString } from "../middleware/validate";
import { deleteShareDir } from "../services/storage";
import { cleanupExpiredShares } from "../services/cleanup";
import { cronRegistry } from "../services/cronRegistry";
import { getDiskInfo, getDirSizeBytes } from "../services/diskMonitor";

const router = Router();
const prisma = new PrismaClient();

function param(val: string | string[] | undefined): string {
  return Array.isArray(val) ? val[0] : val ?? "";
}

router.get("/me", requireAdmin, (req, res) => {
  res.json({
    email: req.user!.email,
    role: req.adminRole,
  });
});

router.get("/stats", requireAdmin, async (_req, res) => {
  try {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekStart = new Date(todayStart);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const [
      totalShares,
      activeShares,
      expiredSharesPending,
      totalFiles,
      totalUsers,
      sharesCreatedToday,
      sharesCreatedThisWeek,
      sharesCreatedThisMonth,
      storageAgg,
      downloadsAgg,
    ] = await Promise.all([
      prisma.share.count(),
      prisma.share.count({
        where: {
          OR: [{ expiresAt: null }, { expiresAt: { gte: now } }],
        },
      }),
      prisma.share.count({
        where: { expiresAt: { not: null, lt: now } },
      }),
      prisma.fileRecord.count({ where: { completed: true } }),
      prisma.user.count(),
      prisma.share.count({ where: { createdAt: { gte: todayStart } } }),
      prisma.share.count({ where: { createdAt: { gte: weekStart } } }),
      prisma.share.count({ where: { createdAt: { gte: monthStart } } }),
      prisma.fileRecord.aggregate({
        _sum: { size: true },
        where: { completed: true },
      }),
      prisma.share.aggregate({ _sum: { downloadCount: true } }),
    ]);

    res.json({
      totalShares,
      activeShares,
      expiredSharesPending,
      totalFiles,
      totalStorageBytes: (storageAgg._sum.size ?? BigInt(0)).toString(),
      totalUsers,
      totalDownloads: downloadsAgg._sum.downloadCount ?? 0,
      sharesCreatedToday,
      sharesCreatedThisWeek,
      sharesCreatedThisMonth,
    });
  } catch (err) {
    console.error("[Admin] stats error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

const VALID_METRICS = [
  "sharesCreated", "sharesActive", "totalFiles",
  "totalStorageBytes", "totalUsers", "totalDownloads",
] as const;

router.get("/stats/timeline", requireAdmin, async (req, res) => {
  try {
    const days = Math.min(parseInt(String(req.query.days || "30"), 10), 365);
    const metric = String(req.query.metric || "sharesCreated");
    if (!VALID_METRICS.includes(metric as (typeof VALID_METRICS)[number])) {
      res.status(400).json({ error: `Invalid metric. Valid: ${VALID_METRICS.join(", ")}` });
      return;
    }

    const since = new Date();
    since.setDate(since.getDate() - days);
    since.setHours(0, 0, 0, 0);

    const rows = await prisma.dailyStats.findMany({
      where: { date: { gte: since } },
      orderBy: { date: "asc" },
    });

    const lookup = new Map<string, number>();
    for (const r of rows) {
      const val = r[metric as keyof typeof r];
      lookup.set(r.date.toISOString().slice(0, 10), typeof val === "bigint" ? Number(val) : Number(val));
    }

    const result: { date: string; value: number }[] = [];
    let lastValue = 0;
    const isCumulative = metric !== "sharesCreated" && metric !== "totalDownloads";
    for (let i = 0; i <= days; i++) {
      const d = new Date(since);
      d.setDate(d.getDate() + i);
      const key = d.toISOString().slice(0, 10);
      if (lookup.has(key)) {
        lastValue = lookup.get(key)!;
        result.push({ date: key, value: lastValue });
      } else {
        result.push({ date: key, value: isCumulative ? lastValue : 0 });
      }
    }

    res.json(result);
  } catch (err) {
    console.error("[Admin] timeline error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/shares", requireAdmin, async (req, res) => {
  try {
    const page = Math.max(parseInt(String(req.query.page || "1"), 10), 1);
    const limit = Math.min(Math.max(parseInt(String(req.query.limit || "20"), 10), 1), 100);
    const skip = (page - 1) * limit;
    const search = String(req.query.search || "").trim().slice(0, 200);
    const status = String(req.query.status || "all");
    const sort = String(req.query.sort || "createdAt");
    const order = String(req.query.order || "desc") as "asc" | "desc";

    const now = new Date();
    const where: any = {};

    if (search) {
      where.OR = [
        { slug: { contains: search, mode: "insensitive" } },
        { user: { email: { contains: search, mode: "insensitive" } } },
      ];
    }

    if (status === "active") {
      where.AND = [
        ...(where.AND || []),
        { OR: [{ expiresAt: null }, { expiresAt: { gte: now } }] },
      ];
    } else if (status === "expired") {
      where.expiresAt = { not: null, lt: now };
    }

    const allowedSorts = ["createdAt", "expiresAt", "slug"];
    const sortField = allowedSorts.includes(sort) ? sort : "createdAt";

    const [shares, total] = await Promise.all([
      prisma.share.findMany({
        where,
        include: {
          user: { select: { email: true } },
          files: {
            where: { completed: true },
            select: { id: true, size: true },
          },
          _count: { select: { replies: true } },
        },
        orderBy: { [sortField]: order },
        skip,
        take: limit,
      }),
      prisma.share.count({ where }),
    ]);

    res.json({
      data: shares.map((s) => ({
        id: s.id,
        slug: s.slug,
        ownerEmail: s.user.email,
        fileCount: s.files.length,
        totalSize: s.files.reduce((sum, f) => sum + f.size, BigInt(0)).toString(),
        allowRecipientUpload: s.allowRecipientUpload,
        expiresAt: s.expiresAt,
        createdAt: s.createdAt,
        downloadCount: s.downloadCount,
        replyCount: s._count.replies,
        isExpired: s.expiresAt ? s.expiresAt < now : false,
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    console.error("[Admin] shares list error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/shares/:slug", requireAdmin, async (req, res) => {
  try {
    const slug = param(req.params.slug);
    if (!isValidSlug(slug)) {
      res.status(400).json({ error: "Invalid slug" });
      return;
    }
    const share = await prisma.share.findUnique({
      where: { slug },
      include: {
        user: { select: { email: true } },
        parentShare: { select: { slug: true } },
        files: {
          where: { completed: true },
          select: {
            id: true,
            encryptedName: true,
            size: true,
            chunkCount: true,
            uploadedBy: true,
            createdAt: true,
          },
        },
        replies: {
          select: {
            id: true,
            slug: true,
            createdAt: true,
            expiresAt: true,
          },
        },
      },
    });

    if (!share) {
      res.status(404).json({ error: "Share not found" });
      return;
    }

    const now = new Date();
    res.json({
      id: share.id,
      slug: share.slug,
      ownerEmail: share.user.email,
      allowRecipientUpload: share.allowRecipientUpload,
      expiresAt: share.expiresAt,
      createdAt: share.createdAt,
      downloadCount: share.downloadCount,
      maxDownloads: share.maxDownloads,
      parentShareSlug: share.parentShare?.slug ?? null,
      isExpired: share.expiresAt ? share.expiresAt < now : false,
      files: share.files.map((f) => ({
        id: f.id,
        encryptedName: f.encryptedName,
        size: f.size.toString(),
        chunkCount: f.chunkCount,
        uploadedBy: f.uploadedBy,
        createdAt: f.createdAt,
      })),
      replies: share.replies,
    });
  } catch (err) {
    console.error("[Admin] share detail error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/shares/:slug", requireAdminWrite, async (req, res) => {
  try {
    const slug = param(req.params.slug);
    if (!isValidSlug(slug)) {
      res.status(400).json({ error: "Invalid slug" });
      return;
    }
    const share = await prisma.share.findUnique({
      where: { slug },
    });

    if (!share) {
      res.status(404).json({ error: "Share not found" });
      return;
    }

    deleteShareDir(share.id);
    await prisma.share.delete({ where: { id: share.id } });

    console.log(`[Admin] Share ${share.slug} deleted by ${req.user!.email}`);
    res.json({ message: "Share deleted" });
  } catch (err) {
    console.error("[Admin] share delete error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/system", requireAdmin, async (_req, res) => {
  try {
    const uploadDirSize = getDirSizeBytes(config.uploadDir);
    const diskInfo = getDiskInfo(config.uploadDir);
    const diskTotal = diskInfo.total;
    const diskFree = diskInfo.free;
    const diskUsed = diskTotal - diskFree;
    const diskUsedPercent = diskTotal > 0
      ? Math.round(Number((BigInt(10000) * diskUsed) / diskTotal)) / 100
      : 0;
    const uploadDirPercent = diskTotal > 0
      ? Math.round(Number((BigInt(10000) * uploadDirSize) / diskTotal)) / 100
      : 0;

    const jobs = cronRegistry.getAll();

    res.json({
      disk: {
        uploadDirPath: config.uploadDir,
        uploadDirSizeBytes: uploadDirSize.toString(),
        uploadDirPercent,
        diskTotalBytes: diskTotal.toString(),
        diskFreeBytes: diskFree.toString(),
        diskUsedBytes: diskUsed.toString(),
        diskUsedPercent,
      },
      cronJobs: jobs.map((j) => ({
        id: j.id,
        name: j.name,
        description: j.description,
        schedule: j.schedule,
        enabled: j.enabled,
        lastRunAt: j.lastRunAt,
        nextRunAt: j.nextRunAt,
      })),
    });
  } catch (err) {
    console.error("[Admin] system error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/cleanup-logs", requireAdmin, async (req, res) => {
  try {
    const page = Math.max(parseInt(String(req.query.page || "1"), 10), 1);
    const limit = Math.min(Math.max(parseInt(String(req.query.limit || "20"), 10), 1), 100);
    const skip = (page - 1) * limit;

    const [logs, total] = await Promise.all([
      prisma.cleanupLog.findMany({
        orderBy: { startedAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.cleanupLog.count(),
    ]);

    res.json({
      data: logs.map((l) => ({
        id: l.id,
        startedAt: l.startedAt,
        completedAt: l.completedAt,
        sharesDeleted: l.sharesDeleted,
        bytesFreed: l.bytesFreed.toString(),
        error: l.error,
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    console.error("[Admin] cleanup-logs error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/cron-jobs/:id", requireAdminWrite, async (req, res) => {
  try {
    const id = param(req.params.id);
    const { schedule, enabled } = req.body;

    const updates: { schedule?: string; enabled?: boolean } = {};
    if (typeof schedule === "string") {
      const safe = schedule.trim().slice(0, 100);
      updates.schedule = safe;
    }
    if (typeof enabled === "boolean") updates.enabled = enabled;

    const result = await cronRegistry.updateJob(id, updates);
    if (!result) {
      res.status(404).json({ error: "Cron job not found" });
      return;
    }

    console.log(`[Admin] Cron job "${id}" updated by ${req.user!.email}: schedule=${result.schedule}, enabled=${result.enabled}`);
    res.json(result);
  } catch (err) {
    if (err instanceof Error && err.message.startsWith("Invalid cron")) {
      res.status(400).json({ error: err.message });
      return;
    }
    console.error("[Admin] cron update error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/cron-jobs/:id/run", requireAdminWrite, async (req, res) => {
  try {
    const id = param(req.params.id);
    console.log(`[Admin] Manual run of "${id}" triggered by ${req.user!.email}`);
    const ok = await cronRegistry.runNow(id);
    if (!ok) {
      res.status(404).json({ error: "Cron job not found" });
      return;
    }
    res.json({ message: "Job executed successfully" });
  } catch (err) {
    console.error("[Admin] manual run error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// --- Security endpoints ---

type JwtSecretLevel = "ok" | "warn" | "error";

function normalizeSecretForCompare(secret: string): string {
  return secret.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

function getDomainsFromAdminEmails(): string[] {
  const domains: string[] = [];
  for (const u of config.adminUsers) {
    const at = u.email.lastIndexOf("@");
    if (at > -1) domains.push(u.email.slice(at + 1));
  }
  return domains;
}

function checkJwtSecretStrength(secretRaw: string, bannedDomains: string[]): {
  level: JwtSecretLevel;
  reasons: string[];
  length: number;
} {
  const secret = String(secretRaw ?? "");
  const length = secret.length;
  const reasons: string[] = [];

  const normalized = normalizeSecretForCompare(secret);
  const placeholderExact = new Set([
    "changeme",
    "changemeinproduction",
    "sharedropsecret",
    "secret",
    "password",
    "jwtsecret",
  ]);
  if (normalized.length === 0) reasons.push("empty");
  if (placeholderExact.has(normalized)) reasons.push("placeholder");

  if (length > 0 && length < 32) reasons.push("too_short_critical");
  else if (length >= 32 && length < 48) reasons.push("too_short_warn");

  const lower = secret.toLowerCase();
  const domains = Array.from(new Set(bannedDomains.map((d) => d.trim().toLowerCase()).filter(Boolean)));
  if (domains.some((d) => lower.includes(d))) reasons.push("contains_domain");

  const isHex = /^[0-9a-f]+$/i.test(secret) && secret.length >= 64;
  const isBase64ish = /^[A-Za-z0-9+/=]+$/.test(secret) && secret.length >= 44;
  const hasLower = /[a-z]/.test(secret);
  const hasUpper = /[A-Z]/.test(secret);
  const hasLetter = hasLower || hasUpper;
  const hasDigit = /\d/.test(secret);
  const hasSpecial = /[^A-Za-z0-9]/.test(secret);
  if (!isHex && !isBase64ish) {
    if (!hasLetter) reasons.push("no_letters");
    if (!hasDigit) reasons.push("no_digits");
    if (!hasSpecial) reasons.push("no_special");
  }

  const uniqueChars = new Set(secret).size;
  if (length >= 16 && uniqueChars <= Math.min(10, Math.floor(length / 3))) reasons.push("low_variety");

  let level: JwtSecretLevel = "ok";
  if (reasons.includes("empty") || reasons.includes("placeholder") || reasons.includes("too_short_critical")) {
    level = "error";
  } else if (reasons.length > 0) {
    level = "warn";
  }

  return { level, reasons, length };
}

router.get("/security/status", requireAdmin, async (_req, res) => {
  try {
    const jobs = cronRegistry.getAll();
    const diskMonitorJob = jobs.find((j) => j.id === "disk-monitor");
    const bannedDomains = [...config.allowedEmailDomains, ...getDomainsFromAdminEmails()];
    const jwtSecret = checkJwtSecretStrength(config.jwtSecret, bannedDomains);

    // Count security events in last 24h to verify logging is actually working
    let securityLoggingVerified = false;
    let securityEventCount = 0;
    try {
      securityEventCount = await prisma.securityEvent.count({
        where: { createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
      });
      // Table exists and is queryable = logging is functional
      securityLoggingVerified = true;
    } catch {
      securityLoggingVerified = false;
    }

    // Check if CORS is properly restricted
    const corsRestricted = config.corsOrigin !== "*";

    // Check if email domain whitelist is set
    const emailDomainWhitelist = config.allowedEmailDomains.length > 0;

    res.json({
      jwtSecret,
      jwtSecretSafe: jwtSecret.level === "ok",
      smtpConfigured: config.smtp.mode !== "none",
      diskMonitorActive: diskMonitorJob?.enabled ?? false,
      adminNotifyConfigured: config.adminUsers.length > 0,
      jwtAlgorithmPinned: true,
      rateLimitingActive: true,
      inputValidationActive: true,
      pathTraversalProtection: true,
      securityHeadersActive: true,
      securityLoggingActive: securityLoggingVerified,
      // Enhanced details per check
      details: {
        jwtSecret: {
          category: "configurable" as const,
          configKeys: ["JWT_SECRET", "JWT_EXPIRY"],
          currentConfig: {
            length: jwtSecret.length,
            expiry: config.jwtExpiry,
            algorithm: "HS256",
          },
          recommendations: jwtSecret.level !== "ok"
            ? ["generate_strong_secret"]
            : [],
        },
        smtpConfigured: {
          category: "configurable" as const,
          configKeys: ["SMTP_MODE", "SMTP_HOST", "SMTP_PORT", "SMTP_FROM"],
          currentConfig: {
            mode: config.smtp.mode,
            host: config.smtp.mode !== "none" ? config.smtp.host : null,
            port: config.smtp.mode !== "none" ? config.smtp.port : null,
            from: config.smtp.mode !== "none" ? config.smtp.from : null,
            tlsRejectUnauthorized: config.smtp.tlsRejectUnauthorized,
          },
          recommendations: config.smtp.mode === "none"
            ? ["configure_smtp"]
            : !config.smtp.tlsRejectUnauthorized
            ? ["enable_tls_verification"]
            : [],
        },
        diskMonitorActive: {
          category: "configurable" as const,
          configKeys: ["DISK_WARN_THRESHOLD_PERCENT", "DISK_BLOCK_THRESHOLD_PERCENT"],
          currentConfig: {
            enabled: diskMonitorJob?.enabled ?? false,
            schedule: diskMonitorJob?.schedule ?? null,
            warnThresholdPercent: config.diskWarnThresholdPercent,
            blockThresholdPercent: config.diskBlockThresholdPercent,
          },
          recommendations: !(diskMonitorJob?.enabled)
            ? ["enable_disk_monitor"]
            : [],
        },
        adminNotifyConfigured: {
          category: "configurable" as const,
          configKeys: ["ADMIN_EMAILS"],
          currentConfig: {
            count: config.adminUsers.length,
            roles: config.adminUsers.map((u) => ({ email: u.email.replace(/(.{2}).*(@.*)/, "$1***$2"), role: u.role })),
          },
          recommendations: config.adminUsers.length === 0
            ? ["add_admin_emails"]
            : config.adminUsers.every((u) => u.role === "viewer")
            ? ["add_admin_role"]
            : [],
        },
        jwtAlgorithmPinned: {
          category: "code_level" as const,
          configKeys: [],
          currentConfig: {
            algorithm: "HS256",
            verifyLocations: ["middleware/auth.ts:requireAuth", "middleware/auth.ts:optionalAuth"],
          },
          recommendations: [],
        },
        rateLimitingActive: {
          category: "code_level" as const,
          configKeys: [],
          currentConfig: {
            limiters: [
              { name: "otp", windowMs: 900000, max: 5, endpoint: "POST /auth/request-otp" },
              { name: "verifyOtp", windowMs: 900000, max: 10, endpoint: "POST /auth/verify-otp" },
              { name: "upload", windowMs: 60000, max: 200, endpoint: "POST /:slug/files/:id/chunks/:idx" },
              { name: "download", windowMs: 60000, max: 100, endpoint: "GET /:slug/files/:id/chunks/:idx" },
              { name: "shareCreate", windowMs: 60000, max: 20, endpoint: "POST /shares" },
              { name: "admin", windowMs: 60000, max: 60, endpoint: "/api/admin/*" },
            ],
          },
          recommendations: [],
        },
        inputValidationActive: {
          category: "code_level" as const,
          configKeys: [],
          currentConfig: {
            validators: ["email", "slug", "uuid", "otp", "base64", "locale", "positiveInt"],
            sourceFile: "middleware/validate.ts",
          },
          recommendations: [],
        },
        pathTraversalProtection: {
          category: "code_level" as const,
          configKeys: [],
          currentConfig: {
            method: "safePath()",
            sourceFile: "services/storage.ts",
            protectedOperations: ["getShareDir", "getFileDir", "getChunkPath", "deleteShareDir"],
          },
          recommendations: [],
        },
        securityHeadersActive: {
          category: "infrastructure" as const,
          configKeys: [],
          currentConfig: {
            headers: [
              "X-Frame-Options: DENY",
              "X-Content-Type-Options: nosniff",
              "Referrer-Policy: strict-origin-when-cross-origin",
              "Permissions-Policy: geolocation=(), microphone=(), camera=()",
              "Content-Security-Policy: default-src 'self'; ...",
            ],
            source: "nginx/nginx-http.conf, nginx/nginx-ssl.conf",
            hstsEnabled: "only in SSL mode",
          },
          recommendations: ["verify_headers_manually"],
        },
        securityLoggingActive: {
          category: "configurable" as const,
          configKeys: [],
          currentConfig: {
            verified: securityLoggingVerified,
            eventsLast24h: securityEventCount,
            eventTypes: ["auth_failed", "admin_denied", "otp_invalid", "rate_limited", "path_traversal", "invalid_input"],
            retentionDays: 30,
          },
          recommendations: !securityLoggingVerified
            ? ["check_database_connection"]
            : [],
        },
        // Additional checks
        corsRestricted: {
          category: "configurable" as const,
          status: corsRestricted,
          configKeys: ["CORS_ORIGIN"],
          currentConfig: {
            origin: config.corsOrigin,
          },
          recommendations: !corsRestricted
            ? ["restrict_cors_origin"]
            : [],
        },
        emailDomainWhitelist: {
          category: "configurable" as const,
          status: emailDomainWhitelist,
          configKeys: ["ALLOWED_EMAIL_DOMAINS"],
          currentConfig: {
            domains: config.allowedEmailDomains,
            count: config.allowedEmailDomains.length,
          },
          recommendations: !emailDomainWhitelist
            ? ["set_email_domains"]
            : [],
        },
      },
    });
  } catch (err) {
    console.error("[Admin] security status error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/security/stats", requireAdmin, async (_req, res) => {
  try {
    const now = new Date();
    const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const last7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const last30d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [byType24h, byType7d, byType30d, topIps, dailyCounts] = await Promise.all([
      prisma.securityEvent.groupBy({
        by: ["event"],
        where: { createdAt: { gte: last24h } },
        _count: true,
      }),
      prisma.securityEvent.groupBy({
        by: ["event"],
        where: { createdAt: { gte: last7d } },
        _count: true,
      }),
      prisma.securityEvent.groupBy({
        by: ["event"],
        where: { createdAt: { gte: last30d } },
        _count: true,
      }),
      prisma.securityEvent.groupBy({
        by: ["ip"],
        where: { createdAt: { gte: last7d } },
        _count: true,
        orderBy: { _count: { ip: "desc" } },
        take: 10,
      }),
      prisma.$queryRaw<{ date: string; event: string; count: bigint }[]>`
        SELECT DATE(created_at) as date, event, COUNT(*)::bigint as count
        FROM security_events
        WHERE created_at >= ${last30d}
        GROUP BY DATE(created_at), event
        ORDER BY date ASC
      `,
    ]);

    const toMap = (rows: { event: string; _count: number }[]) => {
      const m: Record<string, number> = {};
      for (const r of rows) m[r.event] = r._count;
      return m;
    };

    res.json({
      byType: {
        "24h": toMap(byType24h),
        "7d": toMap(byType7d),
        "30d": toMap(byType30d),
      },
      topIps: topIps.map((r) => ({ ip: r.ip, count: r._count })),
      daily: dailyCounts.map((r) => ({
        date: typeof r.date === "string" ? r.date : new Date(r.date).toISOString().slice(0, 10),
        event: r.event,
        count: Number(r.count),
      })),
    });
  } catch (err) {
    console.error("[Admin] security stats error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/security/events", requireAdmin, async (req, res) => {
  try {
    const page = Math.max(parseInt(String(req.query.page || "1"), 10), 1);
    const limit = Math.min(Math.max(parseInt(String(req.query.limit || "20"), 10), 1), 100);
    const skip = (page - 1) * limit;
    const eventFilter = String(req.query.event || "").trim();
    const ipFilter = String(req.query.ip || "").trim().slice(0, 45);
    const days = Math.min(Math.max(parseInt(String(req.query.days || "7"), 10), 1), 30);

    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const where: any = { createdAt: { gte: since } };
    if (eventFilter) where.event = eventFilter;
    if (ipFilter) where.ip = { contains: ipFilter };

    const [events, total] = await Promise.all([
      prisma.securityEvent.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.securityEvent.count({ where }),
    ]);

    res.json({
      data: events.map((e) => ({
        id: e.id,
        event: e.event,
        ip: e.ip,
        method: e.method,
        path: e.path,
        details: e.details,
        createdAt: e.createdAt,
      })),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (err) {
    console.error("[Admin] security events error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/cleanup/run", requireAdminWrite, async (req, res) => {
  try {
    console.log(`[Admin] Manual cleanup triggered by ${req.user!.email}`);
    await cleanupExpiredShares();
    res.json({ message: "Cleanup completed" });
  } catch (err) {
    console.error("[Admin] manual cleanup error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
