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

export function supportsDirectoryPicker(): boolean {
  return typeof (window as unknown as { showDirectoryPicker?: unknown })
    .showDirectoryPicker === "function";
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

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new DOMException("Aborted", "AbortError");
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
  signal?: AbortSignal,
): Promise<void> {
  const handle = await window.showSaveFilePicker({
    suggestedName: fileName,
  });
  const writable = await handle.createWritable();

  let aborted = false;
  try {
    await writeChunksToWritable(slug, file, key, writable, onProgress, signal);
  } catch (err) {
    aborted = true;
    try {
      await writable.abort();
    } catch {
      // ignore
    }
    throw err;
  } finally {
    if (!aborted) {
      await writable.close();
    }
  }
}

/**
 * Like downloadFileStreaming, but accepts a pre-opened writable (e.g. obtained
 * from a directory handle). Used by "download all" to write many files into a
 * folder selected once by the user.
 */
export async function downloadFileToWritable(
  slug: string,
  file: ShareFileInfo,
  key: CryptoKey,
  writable: FileSystemWritableFileStream,
  onProgress?: (p: DownloadProgress) => void,
  signal?: AbortSignal,
): Promise<void> {
  let aborted = false;
  try {
    await writeChunksToWritable(slug, file, key, writable, onProgress, signal);
  } catch (err) {
    aborted = true;
    try {
      await writable.abort();
    } catch {
      // ignore
    }
    throw err;
  } finally {
    if (!aborted) {
      await writable.close();
    }
  }
}

async function writeChunksToWritable(
  slug: string,
  file: ShareFileInfo,
  key: CryptoKey,
  writable: FileSystemWritableFileStream,
  onProgress?: (p: DownloadProgress) => void,
  signal?: AbortSignal,
): Promise<void> {
  for (let i = 0; i < file.chunkCount; i++) {
    throwIfAborted(signal);
    const { data, iv } = await api.downloadChunk(
      `/api/shares/${slug}/files/${file.id}/chunks/${i}`,
      signal,
    );

    const decrypted = await decryptChunk(key, iv, data);
    throwIfAborted(signal);
    await writable.write(decrypted);

    onProgress?.({
      fileId: file.id,
      chunkIndex: i + 1,
      totalChunks: file.chunkCount,
    });
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
  signal?: AbortSignal,
): Promise<Blob> {
  const chunks: ArrayBuffer[] = [];

  for (let i = 0; i < file.chunkCount; i++) {
    throwIfAborted(signal);
    const { data, iv } = await api.downloadChunk(
      `/api/shares/${slug}/files/${file.id}/chunks/${i}`,
      signal,
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
