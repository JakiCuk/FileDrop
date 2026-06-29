/**
 * Functional / regression test for the "Vytvořená sdílení" (sharesCreated) timeline fix.
 *
 * Reproduces the real flow against a DEV/TEST database:
 *   1. seeds N shares dated *yesterday* (no expiry, so cleanup never touches them),
 *   2. runs captureDailySnapshot() — the non-destructive snapshot+finalize path,
 *   3. asserts yesterday's daily_stats.sharesCreated was finalized to the real live
 *      count (== a fresh recount, and includes the N seeded rows) instead of ~0.
 *
 * It calls captureDailySnapshot() (NOT recordDailySnapshot()), so it performs no
 * retention purges. Everything it writes is restored in a finally block, and it
 * refuses to run against NODE_ENV=production. Run from the backend/ directory:
 *   npm run test:timeline
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { captureDailySnapshot } from "../src/services/dailyStats";

const prisma = new PrismaClient();
const PREFIX = "__test_sct_";
const N = 3;

/** Local-midnight date, `offset` days from today (matches captureDailySnapshot). */
function midnight(offset: number): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + offset);
  return d;
}

async function main(): Promise<void> {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Refusing to run against NODE_ENV=production — use a dev/test DB.");
  }

  const user = await prisma.user.findFirst();
  if (!user) throw new Error("No user in DB — create one before running this test.");

  const yesterday = midnight(-1);
  const today = midnight(0);
  const seedAt = new Date(yesterday);
  seedAt.setHours(12, 0, 0, 0); // yesterday noon → safely inside the day window

  // Snapshot any pre-existing yesterday row so we can restore it afterwards.
  const priorRow = await prisma.dailyStats.findUnique({ where: { date: yesterday } });

  // Seed N back-dated shares (Share requires userId + unique slug; null expiry).
  for (let i = 0; i < N; i++) {
    await prisma.share.create({
      data: {
        userId: user.id,
        slug: `${PREFIX}${i}_${seedAt.getTime()}`,
        createdAt: seedAt,
      },
    });
  }
  // Ensure yesterday's row exists — in production it was written by yesterday's run;
  // the finalize step uses updateMany and no-ops if the row is absent.
  await prisma.dailyStats.upsert({
    where: { date: yesterday },
    update: {},
    create: {
      date: yesterday,
      sharesCreated: 0,
      sharesActive: 0,
      totalFiles: 0,
      totalStorageBytes: BigInt(0),
      totalUsers: 0,
      totalDownloads: 0,
    },
  });

  try {
    await captureDailySnapshot();

    // Compare the finalized value against a fresh live recount (robust to other real
    // shares existing) and confirm our N seeded rows are included.
    const stored = (await prisma.dailyStats.findUnique({ where: { date: yesterday } }))?.sharesCreated ?? -1;
    const live = await prisma.share.count({ where: { createdAt: { gte: yesterday, lt: today } } });

    if (stored === live && live >= N) {
      console.log(`PASS: yesterday sharesCreated finalized to ${stored} (live count ${live}, includes ${N} seeded)`);
    } else {
      console.error(`FAIL: stored=${stored}, live=${live} — expected stored===live and live>=${N}`);
      process.exitCode = 1;
    }
  } finally {
    await prisma.share.deleteMany({ where: { slug: { startsWith: PREFIX } } });
    // Restore yesterday's row non-destructively (updateMany/deleteMany never throw).
    if (priorRow) {
      await prisma.dailyStats.updateMany({
        where: { date: yesterday },
        data: { sharesCreated: priorRow.sharesCreated },
      });
    } else {
      await prisma.dailyStats.deleteMany({ where: { date: yesterday } });
    }
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
