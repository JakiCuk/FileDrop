import { PrismaClient } from "@prisma/client";
import { cronRegistry } from "./cronRegistry";

const prisma = new PrismaClient();

function todayDateOnly(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Capture today's aggregate snapshot and finalize the previous, complete day's
 * `sharesCreated`. Pure data work — performs NO retention deletes — so it is safe
 * to call from tests/tools. Throws on error (the cron wrapper below logs & swallows).
 */
export async function captureDailySnapshot(): Promise<void> {
  const date = todayDateOnly();
  const dayStart = new Date(date);
  const dayEnd = new Date(date);
  dayEnd.setDate(dayEnd.getDate() + 1);

  const [
    sharesCreated,
    sharesActive,
    totalFiles,
    storageAgg,
    totalUsers,
    downloadsAgg,
  ] = await Promise.all([
    prisma.share.count({
      where: { createdAt: { gte: dayStart, lt: dayEnd } },
    }),
    prisma.share.count({
      where: {
        OR: [
          { expiresAt: null },
          { expiresAt: { gt: new Date() } },
        ],
      },
    }),
    prisma.fileRecord.count({ where: { completed: true } }),
    prisma.fileRecord.aggregate({
      where: { completed: true },
      _sum: { size: true },
    }),
    prisma.user.count(),
    prisma.share.aggregate({ _sum: { downloadCount: true } }),
  ]);

  const totalStorageBytes = storageAgg._sum.size ?? BigInt(0);
  const totalDownloads = downloadsAgg._sum.downloadCount ?? 0;

  await prisma.dailyStats.upsert({
    where: { date },
    update: {
      sharesCreated,
      sharesActive,
      totalFiles,
      totalStorageBytes,
      totalUsers,
      totalDownloads,
    },
    create: {
      date,
      sharesCreated,
      sharesActive,
      totalFiles,
      totalStorageBytes,
      totalUsers,
      totalDownloads,
    },
  });

  console.log(`[DailyStats] Snapshot saved for ${date.toISOString().slice(0, 10)}`);

  // `sharesCreated` above counts shares created *today*, but this job runs near the
  // start of the day (00:05), so today's count is still incomplete (≈0). Finalize the
  // previous, complete day so the timeline shows real per-day values regardless of
  // server restarts.
  //
  // Running early is deliberate: expired shares are hard-deleted by the 6-hourly
  // cleanup, and the configured expiries are day-granular (min 1 day), so at 00:05
  // none of yesterday's shares have been pruned yet and the count is exact. (Running
  // late — e.g. 23:55 — would let cleanup delete short-lived shares first, undercounting.)
  //
  // updateMany no-ops if yesterday's row is absent: a day with no recorded snapshot
  // (server down) genuinely has no data and cannot be back-filled.
  const prevDay = new Date(date);
  prevDay.setDate(prevDay.getDate() - 1);
  const prevSharesCreated = await prisma.share.count({
    where: { createdAt: { gte: prevDay, lt: date } },
  });
  await prisma.dailyStats.updateMany({
    where: { date: prevDay },
    data: { sharesCreated: prevSharesCreated },
  });
}

/**
 * Delete data past its retention window (daily stats > 1 year, security events > 30
 * days). DESTRUCTIVE — intended for the scheduled job only, never for tests.
 */
async function purgeRetention(): Promise<void> {
  const retentionDate = new Date();
  retentionDate.setFullYear(retentionDate.getFullYear() - 1);
  const { count: purged } = await prisma.dailyStats.deleteMany({
    where: { date: { lt: retentionDate } },
  });
  if (purged > 0) {
    console.log(`[DailyStats] Purged ${purged} entries older than 1 year`);
  }

  const secRetention = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const { count: secPurged } = await prisma.securityEvent.deleteMany({
    where: { createdAt: { lt: secRetention } },
  });
  if (secPurged > 0) {
    console.log(`[DailyStats] Purged ${secPurged} security events older than 30 days`);
  }
}

export async function recordDailySnapshot(): Promise<void> {
  try {
    await captureDailySnapshot();
    await purgeRetention();
  } catch (err) {
    console.error("[DailyStats] Snapshot error:", err);
  }
}

export function registerDailyStatsJob(): void {
  cronRegistry.register({
    id: "daily-stats",
    name: "Daily Statistics Snapshot",
    description: "Records daily aggregate statistics (shares, files, users, downloads, storage) for historical tracking. Also purges security events older than 30 days and daily stats older than 1 year.",
    defaultSchedule: "5 0 * * *",
    handler: recordDailySnapshot,
  });

  recordDailySnapshot();
}
