import { Router } from "express";
import { PrismaClient } from "@prisma/client";
import { config } from "../config";
import { requireAuth } from "../middleware/auth";
import { generateSlug } from "../utils/crypto";
import { deleteShareDir } from "../services/storage";
import { sendReplyNotification } from "../services/email";
import { isValidSlug, isValidLocale, sanitizeString } from "../middleware/validate";
import { shareCreateRateLimit } from "../middleware/rateLimit";

const router = Router();
const prisma = new PrismaClient();

function param(val: string | string[] | undefined): string {
  return Array.isArray(val) ? val[0] : val ?? "";
}

router.post("/", requireAuth, shareCreateRateLimit, async (req, res) => {
  try {
    const { allowRecipientUpload, expiresInDays, maxDownloads, locale } = req.body;
    const userId = req.user!.userId;

    const slug = generateSlug();
    const opts = config.shareExpiryOptionsDays;
    const allowedDays = opts.length > 0 ? opts : [1, 7, 14, 30, 90];
    const requestedDays = expiresInDays ?? config.shareDefaultExpiryDays;
    const days = allowedDays.includes(requestedDays) ? requestedDays : allowedDays[0] ?? config.shareDefaultExpiryDays;
    const expiresAt = days > 0 ? new Date(Date.now() + days * 24 * 60 * 60 * 1000) : null;
    const parsedMaxDownloads = typeof maxDownloads === "number" && maxDownloads > 0 ? maxDownloads : null;

    const share = await prisma.share.create({
      data: {
        userId,
        slug,
        allowRecipientUpload: !!allowRecipientUpload,
        expiresAt,
        maxDownloads: parsedMaxDownloads,
        ownerLocale: isValidLocale(locale) ? locale : undefined,
      },
    });

    res.status(201).json({
      id: share.id,
      slug: share.slug,
      allowRecipientUpload: share.allowRecipientUpload,
      expiresAt: share.expiresAt,
      createdAt: share.createdAt,
    });
  } catch (err) {
    console.error("[Shares] create error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/", requireAuth, async (req, res) => {
  try {
    const shares = await prisma.share.findMany({
      where: { userId: req.user!.userId },
      include: {
        files: {
          where: { completed: true },
          select: { id: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    res.json(
      shares.map((s) => ({
        id: s.id,
        slug: s.slug,
        allowRecipientUpload: s.allowRecipientUpload,
        expiresAt: s.expiresAt,
        maxDownloads: s.maxDownloads,
        downloadCount: s.downloadCount,
        createdAt: s.createdAt,
        fileCount: s.files.length,
        parentShareId: s.parentShareId,
      }))
    );
  } catch (err) {
    console.error("[Shares] list error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/:slug", async (req, res) => {
  try {
    const slug = param(req.params.slug);
    if (!isValidSlug(slug)) {
      res.status(400).json({ error: "Invalid slug" });
      return;
    }
    const share = await prisma.share.findUnique({
      where: { slug },
      include: {
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
      },
    });

    if (!share) {
      res.status(404).json({ error: "Share not found" });
      return;
    }

    if (share.expiresAt && share.expiresAt < new Date()) {
      res.status(410).json({ error: "Share has expired" });
      return;
    }

    if (share.maxDownloads && share.downloadCount >= share.maxDownloads) {
      res.status(410).json({ error: "Download limit reached" });
      return;
    }

    res.json({
      slug: share.slug,
      allowRecipientUpload: share.allowRecipientUpload,
      expiresAt: share.expiresAt,
      maxDownloads: share.maxDownloads,
      downloadCount: share.downloadCount,
      files: share.files.map((f) => ({
        id: f.id,
        encryptedName: f.encryptedName,
        size: f.size.toString(),
        chunkCount: f.chunkCount,
        uploadedBy: f.uploadedBy,
        createdAt: f.createdAt,
      })),
    });
  } catch (err) {
    console.error("[Shares] get error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/:slug/reply", async (req, res) => {
  try {
    const parentSlug = param(req.params.slug);
    if (!isValidSlug(parentSlug)) {
      res.status(400).json({ error: "Invalid slug" });
      return;
    }
    const parentShare = await prisma.share.findUnique({
      where: { slug: parentSlug },
    });

    if (!parentShare) {
      res.status(404).json({ error: "Share not found" });
      return;
    }

    if (parentShare.expiresAt && parentShare.expiresAt < new Date()) {
      res.status(410).json({ error: "Share has expired" });
      return;
    }

    if (!parentShare.allowRecipientUpload) {
      res.status(403).json({ error: "Recipient upload not allowed for this share" });
      return;
    }

    const slug = generateSlug();
    const days = config.replyShareExpiryDays;
    const expiresAt = days > 0 ? new Date(Date.now() + days * 24 * 60 * 60 * 1000) : null;

    const replyShare = await prisma.share.create({
      data: {
        userId: parentShare.userId,
        slug,
        allowRecipientUpload: false,
        expiresAt,
        parentShareId: parentShare.id,
      },
    });

    res.status(201).json({
      slug: replyShare.slug,
      expiresAt: replyShare.expiresAt,
    });
  } catch (err) {
    console.error("[Shares] reply create error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/:slug/notify-owner", async (req, res) => {
  try {
    const slug = param(req.params.slug);
    if (!isValidSlug(slug)) {
      res.status(400).json({ error: "Invalid slug" });
      return;
    }
    const { shareUrl, locale } = req.body;

    if (!shareUrl) {
      res.status(400).json({ error: "shareUrl is required" });
      return;
    }
    const safeShareUrl = sanitizeString(shareUrl, 2048);
    if (!safeShareUrl) {
      res.status(400).json({ error: "Invalid shareUrl" });
      return;
    }

    const share = await prisma.share.findUnique({ where: { slug } });

    if (!share) {
      res.status(404).json({ error: "Share not found" });
      return;
    }

    if (!share.parentShareId) {
      res.status(400).json({ error: "Not a reply share" });
      return;
    }

    const parentShare = await prisma.share.findUnique({
      where: { id: share.parentShareId },
      include: { user: true },
    });

    if (!parentShare) {
      res.status(404).json({ error: "Parent share not found" });
      return;
    }

    await sendReplyNotification(
      parentShare.user.email,
      safeShareUrl,
      share.expiresAt,
      parentShare.ownerLocale ?? (isValidLocale(locale) ? locale : undefined),
    );

    res.json({ message: "Owner notified" });
  } catch (err) {
    console.error("[Shares] notify-owner error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/:slug", requireAuth, async (req, res) => {
  try {
    const slug = param(req.params.slug);
    if (!isValidSlug(slug)) {
      res.status(400).json({ error: "Invalid slug" });
      return;
    }
    const share = await prisma.share.findUnique({ where: { slug } });

    if (!share) {
      res.status(404).json({ error: "Share not found" });
      return;
    }

    if (share.userId !== req.user!.userId) {
      res.status(403).json({ error: "Not authorized" });
      return;
    }

    deleteShareDir(share.id);
    await prisma.share.delete({ where: { id: share.id } });

    res.json({ message: "Share deleted" });
  } catch (err) {
    console.error("[Shares] delete error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
