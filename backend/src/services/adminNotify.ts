import { config } from "../config";
import { getTransporter } from "./email";

type NotificationType =
  | "disk_warn"
  | "disk_critical"
  | "cron_error"
  | "cleanup_error"
  | "uncaught_error";

interface NotificationData {
  [key: string]: string | number | undefined;
}

const lastSent = new Map<NotificationType, number>();

function formatBytes(bytes: string | number): string {
  const n = Number(bytes);
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function buildEmail(
  type: NotificationType,
  data: NotificationData,
): { subject: string; text: string; html: string } {
  const timestamp = new Date().toLocaleString("cs-CZ", {
    timeZone: "Europe/Prague",
  });

  switch (type) {
    case "disk_warn":
      return {
        subject: `${config.appName}: Disk blízko kapacity (${data.freePercent}% volné)`,
        text: [
          `Varování: Volné místo na disku kleslo na ${data.freePercent}%.`,
          `Volné: ${formatBytes(data.freeBytes ?? 0)} z ${formatBytes(data.totalBytes ?? 0)}`,
          `Čas: ${timestamp}`,
          "",
          "Doporučení: Uvolněte místo nebo zvětšete disk.",
        ].join("\n"),
        html: `
          <div style="font-family: Calibri, sans-serif; max-width: 500px; margin: 0 auto; padding: 20px;">
            <h2 style="color: #d97706;">⚠ ${config.appName} — Disk blízko kapacity</h2>
            <table style="width: 100%; border-collapse: collapse;">
              <tr><td style="padding: 8px 0; color: #666;">Volné místo</td><td style="padding: 8px 0; font-weight: bold;">${data.freePercent}%</td></tr>
              <tr><td style="padding: 8px 0; color: #666;">Volné</td><td style="padding: 8px 0;">${formatBytes(data.freeBytes ?? 0)} z ${formatBytes(data.totalBytes ?? 0)}</td></tr>
              <tr><td style="padding: 8px 0; color: #666;">Čas</td><td style="padding: 8px 0;">${timestamp}</td></tr>
            </table>
            <p style="color: #666; font-size: 14px; margin-top: 16px;">Doporučení: Uvolněte místo na disku nebo zvětšete diskový prostor.</p>
          </div>`,
      };

    case "disk_critical":
      return {
        subject: `${config.appName}: KRITICKÉ — Disk plný, uploady blokovány (${data.freePercent}% volné)`,
        text: [
          `KRITICKÉ: Volné místo na disku kleslo na ${data.freePercent}%.`,
          `Nové uploady jsou BLOKOVÁNY.`,
          `Volné: ${formatBytes(data.freeBytes ?? 0)} z ${formatBytes(data.totalBytes ?? 0)}`,
          `Čas: ${timestamp}`,
          "",
          "Okamžitá akce: Uvolněte místo na disku!",
        ].join("\n"),
        html: `
          <div style="font-family: Calibri, sans-serif; max-width: 500px; margin: 0 auto; padding: 20px;">
            <h2 style="color: #dc2626;">🔴 ${config.appName} — Disk plný, uploady blokovány</h2>
            <div style="background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 12px; margin-bottom: 16px;">
              <strong style="color: #dc2626;">Nové uploady jsou BLOKOVÁNY.</strong>
            </div>
            <table style="width: 100%; border-collapse: collapse;">
              <tr><td style="padding: 8px 0; color: #666;">Volné místo</td><td style="padding: 8px 0; font-weight: bold; color: #dc2626;">${data.freePercent}%</td></tr>
              <tr><td style="padding: 8px 0; color: #666;">Volné</td><td style="padding: 8px 0;">${formatBytes(data.freeBytes ?? 0)} z ${formatBytes(data.totalBytes ?? 0)}</td></tr>
              <tr><td style="padding: 8px 0; color: #666;">Čas</td><td style="padding: 8px 0;">${timestamp}</td></tr>
            </table>
            <p style="color: #dc2626; font-weight: bold; margin-top: 16px;">Okamžitá akce: Uvolněte místo na disku!</p>
          </div>`,
      };

    case "cron_error":
      return {
        subject: `${config.appName}: Chyba cron jobu — ${data.jobName ?? data.jobId ?? "neznámý"}`,
        text: [
          `Cron job "${data.jobName}" (${data.jobId}) skončil s chybou.`,
          `Chyba: ${data.error}`,
          `Čas: ${timestamp}`,
        ].join("\n"),
        html: `
          <div style="font-family: Calibri, sans-serif; max-width: 500px; margin: 0 auto; padding: 20px;">
            <h2 style="color: #dc2626;">${config.appName} — Chyba cron jobu</h2>
            <table style="width: 100%; border-collapse: collapse;">
              <tr><td style="padding: 8px 0; color: #666;">Job</td><td style="padding: 8px 0; font-weight: bold;">${data.jobName} (${data.jobId})</td></tr>
              <tr><td style="padding: 8px 0; color: #666;">Chyba</td><td style="padding: 8px 0; color: #dc2626;">${data.error}</td></tr>
              <tr><td style="padding: 8px 0; color: #666;">Čas</td><td style="padding: 8px 0;">${timestamp}</td></tr>
            </table>
          </div>`,
      };

    case "cleanup_error":
      return {
        subject: `${config.appName}: Chyba při čištění expirovaných sdílení`,
        text: [
          `Cleanup job skončil s chybou.`,
          `Chyba: ${data.error}`,
          `Smazáno sdílení: ${data.sharesDeleted ?? 0}`,
          `Uvolněno: ${formatBytes(data.bytesFreed ?? 0)}`,
          `Čas: ${timestamp}`,
        ].join("\n"),
        html: `
          <div style="font-family: Calibri, sans-serif; max-width: 500px; margin: 0 auto; padding: 20px;">
            <h2 style="color: #dc2626;">${config.appName} — Chyba při čištění</h2>
            <table style="width: 100%; border-collapse: collapse;">
              <tr><td style="padding: 8px 0; color: #666;">Chyba</td><td style="padding: 8px 0; color: #dc2626;">${data.error}</td></tr>
              <tr><td style="padding: 8px 0; color: #666;">Smazáno sdílení</td><td style="padding: 8px 0;">${data.sharesDeleted ?? 0}</td></tr>
              <tr><td style="padding: 8px 0; color: #666;">Uvolněno</td><td style="padding: 8px 0;">${formatBytes(data.bytesFreed ?? 0)}</td></tr>
              <tr><td style="padding: 8px 0; color: #666;">Čas</td><td style="padding: 8px 0;">${timestamp}</td></tr>
            </table>
          </div>`,
      };

    case "uncaught_error":
      return {
        subject: `${config.appName}: Neočekávaná chyba serveru`,
        text: [
          `Na serveru došlo k neočekávané chybě.`,
          `Chyba: ${data.error}`,
          `Čas: ${timestamp}`,
          data.stack ? `\nStack trace:\n${data.stack}` : "",
        ].join("\n"),
        html: `
          <div style="font-family: Calibri, sans-serif; max-width: 500px; margin: 0 auto; padding: 20px;">
            <h2 style="color: #dc2626;">${config.appName} — Neočekávaná chyba serveru</h2>
            <table style="width: 100%; border-collapse: collapse;">
              <tr><td style="padding: 8px 0; color: #666;">Chyba</td><td style="padding: 8px 0; color: #dc2626;">${data.error}</td></tr>
              <tr><td style="padding: 8px 0; color: #666;">Čas</td><td style="padding: 8px 0;">${timestamp}</td></tr>
            </table>
            ${data.stack ? `<pre style="background: #f5f5f5; padding: 12px; border-radius: 8px; font-size: 12px; overflow-x: auto; margin-top: 16px;">${data.stack}</pre>` : ""}
          </div>`,
      };
  }
}

export async function sendAdminNotification(
  type: NotificationType,
  data: NotificationData,
): Promise<void> {
  try {
    const debounceMs = config.adminNotifyDebounceMinutes * 60 * 1000;
    const now = Date.now();
    const last = lastSent.get(type);
    if (last && now - last < debounceMs) {
      console.log(
        `[AdminNotify] Debounced ${type} (last sent ${Math.round((now - last) / 60000)}min ago)`,
      );
      return;
    }

    const adminEmails = config.adminUsers.map((u) => u.email);
    if (adminEmails.length === 0) {
      console.log(`[AdminNotify] No admin emails configured, skipping ${type}`);
      return;
    }

    if (config.smtp.mode === "none") {
      const { subject } = buildEmail(type, data);
      console.log(`[AdminNotify] (mode=none) ${type}: ${subject}`);
      lastSent.set(type, now);
      return;
    }

    const t = await getTransporter();
    const { subject, text, html } = buildEmail(type, data);

    await t.sendMail({
      from: config.smtp.fromFormatted,
      to: adminEmails.join(","),
      subject,
      text,
      html,
    });

    lastSent.set(type, now);
    console.log(
      `[AdminNotify] Sent ${type} to ${adminEmails.length} admin(s)`,
    );
  } catch (err) {
    console.error(`[AdminNotify] Failed to send ${type}:`, err);
  }
}
