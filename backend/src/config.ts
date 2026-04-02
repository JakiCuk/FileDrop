import dotenv from "dotenv";
dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || "3000", 10),
  nodeEnv: process.env.NODE_ENV || "development",

  databaseUrl: process.env.DATABASE_URL || "",

  jwtSecret: process.env.JWT_SECRET || "change_me",
  jwtExpiry: process.env.JWT_EXPIRY || "24h",

  allowedEmailDomains: process.env.ALLOWED_EMAIL_DOMAINS
    ? process.env.ALLOWED_EMAIL_DOMAINS.split(",").map((d) => d.trim().toLowerCase())
    : [],

  otpExpiryMinutes: parseInt(process.env.OTP_EXPIRY_MINUTES || "10", 10),

  shareDefaultExpiryDays: parseInt(process.env.SHARE_DEFAULT_EXPIRY_DAYS || "30", 10),
  /** User-selectable expiry options (days). Comma-separated, e.g. "1,7,14,30,90" */
  shareExpiryOptionsDays: (process.env.SHARE_EXPIRY_OPTIONS_DAYS || "1,7,14,30,90")
    .split(",")
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => !isNaN(n) && n > 0),
  replyShareExpiryDays: parseInt(process.env.REPLY_SHARE_EXPIRY_DAYS || "7", 10),
  maxFileSizeMb: parseInt(process.env.MAX_FILE_SIZE_MB || "51200", 10),
  chunkSizeMb: parseInt(process.env.CHUNK_SIZE_MB || "5", 10),

  uploadDir: process.env.UPLOAD_DIR || "./uploads",

  smtp: {
    mode: (process.env.SMTP_MODE || "none") as "none" | "smtp" | "oauth2",
    host: process.env.SMTP_HOST || "smtp.office365.com",
    port: parseInt(process.env.SMTP_PORT || "587", 10),
    from: process.env.SMTP_FROM || "noreply@sharedrop.local",
    user: process.env.SMTP_USER || "",
    pass: process.env.SMTP_PASS || "",
    /** Set to false when connecting via IP to a server with DNS-name cert (e.g. internal SMTP) */
    tlsRejectUnauthorized: process.env.SMTP_TLS_REJECT_UNAUTHORIZED !== "false",
    oauth2TenantId: process.env.SMTP_OAUTH2_TENANT_ID || "",
    oauth2ClientId: process.env.SMTP_OAUTH2_CLIENT_ID || "",
    oauth2ClientSecret: process.env.SMTP_OAUTH2_CLIENT_SECRET || "",
  },

  appName: process.env.APP_NAME || "ShareDrop",

  corsOrigin: process.env.CORS_ORIGIN || "*",

  diskWarnThresholdPercent: parseInt(process.env.DISK_WARN_THRESHOLD_PERCENT || "15", 10),
  diskBlockThresholdPercent: parseInt(process.env.DISK_BLOCK_THRESHOLD_PERCENT || "5", 10),
  adminNotifyDebounceMinutes: parseInt(process.env.ADMIN_NOTIFY_DEBOUNCE_MINUTES || "60", 10),

  adminUsers: process.env.ADMIN_EMAILS
    ? process.env.ADMIN_EMAILS.split(",")
        .map((entry) => {
          const [email, role] = entry.trim().split(":");
          return {
            email: email.toLowerCase(),
            role: (role || "viewer") as "admin" | "viewer",
          };
        })
        .filter((u) => u.email.length > 0)
    : [],
};

if (config.jwtSecret === "change_me" && config.nodeEnv === "production") {
  console.warn("[SECURITY WARNING] JWT_SECRET is set to default value 'change_me'. Change it immediately in production!");
}
