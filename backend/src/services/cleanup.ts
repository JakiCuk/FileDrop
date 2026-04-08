import { PrismaClient } from "@prisma/client";
import { deleteShareDir, deleteFileDir } from "./storage";
import { cronRegistry } from "./cronRegistry";
import { sendAdminNotification } from "./adminNotify";

const prisma = new PrismaClient();

export async function cleanupExpiredShares(): Promise<void> {
  const startedAt = new Date();
  let sharesDeleted = 0;
  let incompleteFilesDeleted = 0;
  let bytesFreed = BigInt(0);
  let error: string | undefined;

  try {
    const staleThreshold = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const incomplete = await prisma.fileRecord.findMany({
      where: { completed: false, createdAt: { lt: staleThreshold } },
      select: { id: true, shareId: true },
    });
    for (const f of incomplete) {
      try {
        deleteFileDir(f.shareId, f.id);
        await prisma.fileRecord.delete({ where: { id: f.id } });
        incompleteFilesDeleted++;
      } catch (e) {
        console.error(`[Cleanup] Failed to delete incomplete file ${f.id}:`, e);
      }
    }
    if (incompleteFilesDeleted > 0) {
      console.log(`[Cleanup] Removed ${incompleteFilesDeleted} stale incomplete files (>24h)`);
    }

    const expired = await prisma.share.findMany({
      where: {
        expiresAt: { not: null, lt: startedAt },
      },
      include: {
        files: {
          select: { size: true },
        },
      },
    });

    for (const share of expired) {
      for (const file of share.files) {
        bytesFreed += file.size;
      }
      deleteShareDir(share.id);
      await prisma.share.delete({ where: { id: share.id } });
      sharesDeleted++;
      console.log(`[Cleanup] Deleted expired share ${share.slug}`);
    }

    if (sharesDeleted > 0) {
      console.log(`[Cleanup] Removed ${sharesDeleted} expired shares, freed ${bytesFreed} bytes`);
    }
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
    console.error("[Cleanup] Error:", err);
  }

  try {
    await prisma.cleanupLog.create({
      data: {
        startedAt,
        completedAt: new Date(),
        sharesDeleted,
        bytesFreed,
        error: error ?? null,
      },
    });

    if (error) {
      sendAdminNotification("cleanup_error", {
        error,
        sharesDeleted: String(sharesDeleted),
        bytesFreed: bytesFreed.toString(),
      });
    }

    const retentionDate = new Date();
    retentionDate.setDate(retentionDate.getDate() - 90);
    const { count: purged } = await prisma.cleanupLog.deleteMany({
      where: { startedAt: { lt: retentionDate } },
    });
    if (purged > 0) {
      console.log(`[Cleanup] Purged ${purged} old cleanup log entries (>90 days)`);
    }
  } catch (logErr) {
    console.error("[Cleanup] Failed to write cleanup log:", logErr);
  }
}

export function registerCleanupJob(): void {
  cronRegistry.register({
    id: "cleanup",
    name: "Expired Shares Cleanup",
    description: "Deletes expired shares and their files from disk, frees storage space",
    defaultSchedule: "0 */6 * * *",
    handler: cleanupExpiredShares,
  });
}
