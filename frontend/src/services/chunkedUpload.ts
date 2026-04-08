import { encryptChunk, encryptString } from "./crypto";
import { api } from "./api";

const CHUNK_SIZE = 5 * 1024 * 1024;

export interface UploadProgress {
  fileIndex: number;
  fileName: string;
  chunkIndex: number;
  totalChunks: number;
  totalFiles: number;
  bytesUploaded: number;
  totalBytes: number;
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new DOMException("Aborted", "AbortError");
  }
}

export async function uploadFileEncrypted(
  slug: string,
  file: File,
  encryptionKey: CryptoKey,
  uploadedBy: "OWNER" | "RECIPIENT",
  onProgress?: (p: UploadProgress) => void,
  fileIndex = 0,
  totalFiles = 1,
  signal?: AbortSignal,
  onFileIdReceived?: (fileId: string) => void,
): Promise<string> {
  const totalChunks = Math.max(1, Math.ceil(file.size / CHUNK_SIZE));

  throwIfAborted(signal);
  const encryptedName = await encryptString(encryptionKey, file.name);

  const { fileId } = await api.post<{ fileId: string }>(
    `/api/shares/${slug}/files/init`,
    {
      encryptedName,
      size: file.size,
      chunkCount: totalChunks,
      uploadedBy,
    },
    signal,
  );

  onFileIdReceived?.(fileId);

  for (let i = 0; i < totalChunks; i++) {
    throwIfAborted(signal);
    const start = i * CHUNK_SIZE;
    const end = Math.min(start + CHUNK_SIZE, file.size);
    const rawChunk = await file.slice(start, end).arrayBuffer();

    const { iv, ciphertext } = await encryptChunk(encryptionKey, rawChunk);

    await api.uploadChunk(
      `/api/shares/${slug}/files/${fileId}/chunks/${i}`,
      ciphertext,
      iv,
      signal,
    );

    onProgress?.({
      fileIndex,
      fileName: file.name,
      chunkIndex: i + 1,
      totalChunks,
      totalFiles,
      bytesUploaded: end,
      totalBytes: file.size,
    });
  }

  await api.post(`/api/shares/${slug}/files/${fileId}/complete`, {}, signal);
  return fileId;
}
