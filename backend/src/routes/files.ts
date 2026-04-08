import { Router } from "express";
import fs from "fs";
import { promises as fsp } from "fs";
import { PrismaClient } from "@prisma/client";
import { config } from "../config";
import { optionalAuth } from "../middleware/auth";
import { fileInitRateLimit } from "../middleware/rateLimit";
import { getChunkPath, deleteFileDir } from "../services/storage";
import { checkDiskSpace } from "../services/diskMonitor";
import { sendAdminNotification } from "../services/adminNotify";
import { isValidSlug, isValidUuid, isValidBase64, sanitizeString, isPositiveInt } from "../middleware/validate";
import express from "express";

const router = Router();
const prisma = new PrismaClient();
const MAX_CHUNK_BYTES = (config.chunkSizeMb + 1) * 1024 * 1024;

function param(val: string | string[] | undefined): string {
  return Array.isArray(val) ? val[0] : val ?? "";
}

router.post(
  "/:slug/files/init",
  fileInitRateLimit,
  optionalAuth,
  async (req, res) => {
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

      if (share.expiresAt && share.expiresAt < new Date()) {
        res.status(410).json({ error: "Share has expired" });
        return;
      }

      const isOwner = req.user?.userId === share.userId;
      const isReplyShare = !!share.parentShareId;
      if (!isOwner && !share.allowRecipientUpload && !isReplyShare) {
        res.status(403).json({ error: "Upload not allowed for recipients" });
        return;
      }

      const { encryptedName, size, chunkCount } = req.body;
      if (!encryptedName || size == null || !chunkCount) {
        res.status(400).json({ error: "encryptedName, size, and chunkCount are required" });
        return;
      }

      const safeName = sanitizeString(encryptedName, 1024);
      if (!safeName) {
        res.status(400).json({ error: "Invalid encrypted name" });
        return;
      }

      if (Number(size) > config.maxFileSizeMb * 1024 * 1024) {
        res.status(413).json({ error: `File too large. Max: ${config.maxFileSizeMb} MB` });
        return;
      }

      const maxChunks = Math.ceil((config.maxFileSizeMb * 1024 * 1024) / (config.chunkSizeMb * 1024 * 1024)) + 1;
      if (!isPositiveInt(Number(chunkCount), maxChunks)) {
        res.status(400).json({ error: "Invalid chunk count" });
        return;
      }

      const file = await prisma.fileRecord.create({
        data: {
          shareId: share.id,
          encryptedName: safeName,
          size: BigInt(size),
          chunkCount: Number(chunkCount),
          uploadedBy: isOwner ? "OWNER" : "RECIPIENT",
          storagePath: `${share.id}/${Date.now()}`,
        },
      });

      res.status(201).json({ fileId: file.id });
    } catch (err) {
      console.error("[Files] init error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

router.post(
  "/:slug/files/:fileId/chunks/:index",
  optionalAuth,
  express.raw({ type: "application/octet-stream", limit: `${MAX_CHUNK_BYTES}` }),
  async (req, res) => {
    try {
      const slug = param(req.params.slug);
      if (!isValidSlug(slug)) {
        res.status(400).json({ error: "Invalid slug" });
        return;
      }
      const fileId = param(req.params.fileId);
      if (!isValidUuid(fileId)) {
        res.status(400).json({ error: "Invalid file ID" });
        return;
      }
      const indexStr = param(req.params.index);
      const iv = req.headers["x-chunk-iv"];
      const ivStr = Array.isArray(iv) ? iv[0] : iv;

      if (!ivStr || !isValidBase64(ivStr, 64)) {
        res.status(400).json({ error: "Invalid X-Chunk-IV header" });
        return;
      }

      const share = await prisma.share.findUnique({ where: { slug } });
      if (!share) {
        res.status(404).json({ error: "Share not found" });
        return;
      }

      const file = await prisma.fileRecord.findFirst({
        where: { id: fileId, shareId: share.id },
      });

      if (!file) {
        res.status(404).json({ error: "File not found" });
        return;
      }

      if (file.completed) {
        res.status(409).json({ error: "File upload already completed" });
        return;
      }

      const chunkIndex = parseInt(indexStr, 10);
      if (isNaN(chunkIndex) || chunkIndex < 0 || chunkIndex >= file.chunkCount) {
        res.status(400).json({ error: "Invalid chunk index" });
        return;
      }

      const data = req.body as Buffer;
      if (!data || data.length === 0) {
        res.status(400).json({ error: "Chunk data is empty" });
        return;
      }

      const diskStatus = checkDiskSpace();
      if (diskStatus.status === "critical") {
        sendAdminNotification("disk_critical", {
          freePercent: diskStatus.freePercent,
          freeBytes: diskStatus.freeBytes.toString(),
          totalBytes: diskStatus.totalBytes.toString(),
        });
        res.status(507).json({ error: "disk_full" });
        return;
      }
      if (diskStatus.status === "warn") {
        sendAdminNotification("disk_warn", {
          freePercent: diskStatus.freePercent,
          freeBytes: diskStatus.freeBytes.toString(),
          totalBytes: diskStatus.totalBytes.toString(),
        });
      }

      const chunkPath = getChunkPath(share.id, fileId, chunkIndex);
      await fsp.writeFile(chunkPath, data);

      await prisma.chunk.upsert({
        where: { fileId_index: { fileId, index: chunkIndex } },
        create: {
          fileId,
          index: chunkIndex,
          iv: ivStr,
          size: data.length,
          storagePath: chunkPath,
        },
        update: {
          iv: ivStr,
          size: data.length,
          storagePath: chunkPath,
        },
      });

      res.json({ chunkIndex, size: data.length });
    } catch (err) {
      console.error("[Files] chunk upload error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

router.post(
  "/:slug/files/:fileId/complete",
  optionalAuth,
  async (req, res) => {
    try {
      const slug = param(req.params.slug);
      if (!isValidSlug(slug)) {
        res.status(400).json({ error: "Invalid slug" });
        return;
      }
      const fileId = param(req.params.fileId);
      if (!isValidUuid(fileId)) {
        res.status(400).json({ error: "Invalid file ID" });
        return;
      }

      const share = await prisma.share.findUnique({ where: { slug } });
      if (!share) {
        res.status(404).json({ error: "Share not found" });
        return;
      }

      const file = await prisma.fileRecord.findFirst({
        where: { id: fileId, shareId: share.id },
      });

      if (!file) {
        res.status(404).json({ error: "File not found" });
        return;
      }

      const chunkCount = await prisma.chunk.count({ where: { fileId } });
      if (chunkCount < file.chunkCount) {
        res.status(400).json({
          error: `Missing chunks: uploaded ${chunkCount}/${file.chunkCount}`,
        });
        return;
      }

      await prisma.fileRecord.update({
        where: { id: fileId },
        data: { completed: true },
      });

      res.json({ message: "File upload completed", fileId });
    } catch (err) {
      console.error("[Files] complete error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

router.get(
  "/:slug/files/:fileId/chunks/:index",
  async (req, res) => {
    try {
      const slug = param(req.params.slug);
      if (!isValidSlug(slug)) {
        res.status(400).json({ error: "Invalid slug" });
        return;
      }
      const fileId = param(req.params.fileId);
      if (!isValidUuid(fileId)) {
        res.status(400).json({ error: "Invalid file ID" });
        return;
      }
      const indexStr = param(req.params.index);

      const share = await prisma.share.findUnique({ where: { slug } });
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

      const chunkIndex = parseInt(indexStr, 10);
      const chunk = await prisma.chunk.findUnique({
        where: { fileId_index: { fileId, index: chunkIndex } },
      });

      if (!chunk) {
        res.status(404).json({ error: "Chunk not found" });
        return;
      }

      if (!fs.existsSync(chunk.storagePath)) {
        res.status(404).json({ error: "Chunk data not found on disk" });
        return;
      }

      if (chunkIndex === 0) {
        await prisma.share.update({
          where: { id: share.id },
          data: { downloadCount: { increment: 1 } },
        }).catch(() => {});
      }

      res.setHeader("Content-Type", "application/octet-stream");
      res.setHeader("X-Chunk-IV", chunk.iv);
      res.setHeader("Content-Length", chunk.size.toString());

      const stream = fs.createReadStream(chunk.storagePath);
      stream.pipe(res);
    } catch (err) {
      console.error("[Files] chunk download error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

router.delete(
  "/:slug/files/:fileId",
  optionalAuth,
  async (req, res) => {
    try {
      const slug = param(req.params.slug);
      if (!isValidSlug(slug)) {
        res.status(400).json({ error: "Invalid slug" });
        return;
      }
      const fileId = param(req.params.fileId);
      if (!isValidUuid(fileId)) {
        res.status(400).json({ error: "Invalid file ID" });
        return;
      }

      const share = await prisma.share.findUnique({ where: { slug } });
      if (!share) {
        res.status(404).json({ error: "Share not found" });
        return;
      }

      const isOwner = req.user?.userId === share.userId;
      const isReplyShare = !!share.parentShareId;

      const file = await prisma.fileRecord.findFirst({
        where: { id: fileId, shareId: share.id },
      });

      if (!file) {
        res.status(404).json({ error: "File not found" });
        return;
      }

      // Owner môže mazať čokoľvek. Ne-owner (recipient/reply uploader)
      // môže mazať iba vlastný incomplete upload (cancel scenár).
      if (!isOwner) {
        if (file.completed) {
          res.status(403).json({ error: "Only the share owner can delete completed files" });
          return;
        }
        if (!share.allowRecipientUpload && !isReplyShare) {
          res.status(403).json({ error: "Not allowed" });
          return;
        }
      }

      deleteFileDir(share.id, file.id);
      await prisma.fileRecord.delete({ where: { id: fileId } });

      res.json({ message: "File deleted" });
    } catch (err) {
      console.error("[Files] delete error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

export default router;
