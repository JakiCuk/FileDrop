import { decryptChunk, decryptString } from "./crypto";
import { api } from "./api";

export interface DownloadProgress {
  fileId: string;
  chunkIndex: number;
  totalChunks: number;
}

export interface ShareFileInfo {
  id: string;
  encryptedName: string;
  size: string;
  chunkCount: number;
  uploadedBy: string;
  createdAt: string;
}

export function supportsStreamingDownload(): boolean {
  return typeof window.showSaveFilePicker === "function";
}

export async function decryptFileName(
  key: CryptoKey,
  encryptedName: string,
): Promise<string> {
  try {
    return await decryptString(key, encryptedName);
  } catch {
    return "unknown-file";
  }
}

/**
 * Streaming download — writes decrypted chunks directly to disk via
 * File System Access API. Zero RAM accumulation regardless of file size.
 * Supported in Chrome 86+, Edge 86+.
 */
export async function downloadFileStreaming(
  slug: string,
  file: ShareFileInfo,
  fileName: string,
  key: CryptoKey,
  onProgress?: (p: DownloadProgress) => void,
): Promise<void> {
  const handle = await window.showSaveFilePicker({
    suggestedName: fileName,
  });
  const writable = await handle.createWritable();

  try {
    for (let i = 0; i < file.chunkCount; i++) {
      const { data, iv } = await api.downloadChunk(
        `/api/shares/${slug}/files/${file.id}/chunks/${i}`,
      );

      const decrypted = await decryptChunk(key, iv, data);
      await writable.write(decrypted);

      onProgress?.({
        fileId: file.id,
        chunkIndex: i + 1,
        totalChunks: file.chunkCount,
      });
    }
  } finally {
    await writable.close();
  }
}

/**
 * Fallback in-memory download for browsers without File System Access API.
 * All decrypted chunks accumulate in RAM — practical limit ~2 GB.
 */
export async function downloadFileDecrypted(
  slug: string,
  file: ShareFileInfo,
  key: CryptoKey,
  onProgress?: (p: DownloadProgress) => void,
): Promise<Blob> {
  const chunks: ArrayBuffer[] = [];

  for (let i = 0; i < file.chunkCount; i++) {
    const { data, iv } = await api.downloadChunk(
      `/api/shares/${slug}/files/${file.id}/chunks/${i}`,
    );

    const decrypted = await decryptChunk(key, iv, data);
    chunks.push(decrypted);

    onProgress?.({
      fileId: file.id,
      chunkIndex: i + 1,
      totalChunks: file.chunkCount,
    });
  }

  return new Blob(chunks);
}

export function triggerDownload(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
