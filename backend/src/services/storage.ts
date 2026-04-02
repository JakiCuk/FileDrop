import fs from "fs";
import path from "path";
import { config } from "../config";

function safePath(base: string, ...segments: string[]): string {
  const resolved = path.resolve(base, ...segments);
  const baseResolved = path.resolve(base);
  if (!resolved.startsWith(baseResolved + path.sep) && resolved !== baseResolved) {
    throw new Error("Path traversal detected");
  }
  return resolved;
}

export function ensureUploadDir(): void {
  if (!fs.existsSync(config.uploadDir)) {
    fs.mkdirSync(config.uploadDir, { recursive: true });
  }
}

export function getShareDir(shareId: string): string {
  const dir = safePath(config.uploadDir, shareId);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

export function getFileDir(shareId: string, fileId: string): string {
  const dir = safePath(config.uploadDir, shareId, fileId);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

export function getChunkPath(shareId: string, fileId: string, chunkIndex: number): string {
  const dir = getFileDir(shareId, fileId);
  return path.join(dir, `chunk_${chunkIndex.toString().padStart(6, "0")}`);
}

export function deleteShareDir(shareId: string): void {
  const dir = safePath(config.uploadDir, shareId);
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

ensureUploadDir();
