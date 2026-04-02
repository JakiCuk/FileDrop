import { PrismaClient } from "@prisma/client";
import { cronRegistry } from "./cronRegistry";

const prisma = new PrismaClient();

function todayDateOnly(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export async function recordDailySnapshot(): Promise<void> {
  const date = todayDateOnly();

  try {
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
