import { useState, useEffect, useCallback, useRef } from "react";
import { useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { api, ApiError } from "../services/api";
import {
  importKeyFromBase64,
  generateEncryptionKey,
  exportKeyToBase64,
} from "../services/crypto";
import {
  decryptFileName,
  downloadFileDecrypted,
  downloadFileStreaming,
  downloadFileToWritable,
  supportsDirectoryPicker,
  supportsStreamingDownload,
  triggerDownload,
  type ShareFileInfo,
  type DownloadProgress,
} from "../services/chunkedDownload";
import { uploadFileEncrypted } from "../services/chunkedUpload";
import FileDropzone from "../components/FileDropzone";
import ProgressBar from "../components/ProgressBar";

const LARGE_FILE_THRESHOLD = 2 * 1024 * 1024 * 1024; // 2 GB

const EMAIL_LOCALES = ["en", "cs", "sk", "uk"] as const;
function getEmailLocale(lang: string): string {
  const base = lang?.split("-")[0] || "en";
  return EMAIL_LOCALES.includes(base as (typeof EMAIL_LOCALES)[number]) ? base : "en";
}

interface ShareData {
  slug: string;
  allowRecipientUpload: boolean;
  expiresAt: string | null;
  maxDownloads: number | null;
  downloadCount: number;
  files: ShareFileInfo[];
}

interface DecryptedFile {
  info: ShareFileInfo;
  name: string;
}

export default function ShareViewPage() {
  const { slug } = useParams<{ slug: string }>();
  const { t, i18n } = useTranslation();
  const [share, setShare] = useState<ShareData | null>(null);
  const [cryptoKey, setCryptoKey] = useState<CryptoKey | null>(null);
  const [decryptedFiles, setDecryptedFiles] = useState<DecryptedFile[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const [downloading, setDownloading] = useState<string | null>(null);
  const [dlProgress, setDlProgress] = useState<DownloadProgress | null>(null);
  const [batchDownloading, setBatchDownloading] = useState(false);
  const [batchProgress, setBatchProgress] = useState<{ current: number; total: number } | null>(
    null,
  );
  const abortRef = useRef<AbortController | null>(null);
  const uploadAbortRef = useRef<AbortController | null>(null);
  const currentUploadRef = useRef<{ slug: string; fileId: string } | null>(null);

  const [uploading, setUploading] = useState(false);
  const [uploadPercent, setUploadPercent] = useState(0);
  const [uploadDone, setUploadDone] = useState(false);

  const loadShare = useCallback(async () => {
    if (!slug) return;
    setLoading(true);
    setError("");

    try {
      const keyStr = window.location.hash.slice(1);
      if (!keyStr) {
        setError(t("share.missingKey"));
        setLoading(false);
        return;
      }

      const key = await importKeyFromBase64(keyStr);
      setCryptoKey(key);

      const data = await api.get<ShareData>(`/api/shares/${slug}`);
      setShare(data);

      const decrypted: DecryptedFile[] = [];
      for (const f of data.files) {
        const name = await decryptFileName(key, f.encryptedName);
        decrypted.push({ info: f, name });
      }
      setDecryptedFiles(decrypted);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError(t("share.loadFailed"));
      }
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  useEffect(() => {
    loadShare();
  }, [loadShare]);

  const handleDownload = async (file: DecryptedFile) => {
    if (!cryptoKey || !slug) return;

    const fileSize = Number(file.info.size);
    const isLarge = fileSize > LARGE_FILE_THRESHOLD;
    const canStream = supportsStreamingDownload();

    if (isLarge && !canStream) {
      const proceed = confirm(t("share.largeFileWarning"));
      if (!proceed) return;
    }

    const controller = new AbortController();
    abortRef.current = controller;
    setDownloading(file.info.id);
    setDlProgress(null);

    try {
      if (canStream) {
        await downloadFileStreaming(
          slug,
          file.info,
          file.name,
          cryptoKey,
          (p) => setDlProgress(p),
          controller.signal,
        );
      } else {
        const blob = await downloadFileDecrypted(
          slug,
          file.info,
          cryptoKey,
          (p) => setDlProgress(p),
          controller.signal,
        );
        triggerDownload(blob, file.name);
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        // User cancelled the save dialog or pressed Cancel
      } else {
        setError(err instanceof Error ? err.message : t("share.downloadFailed"));
      }
    } finally {
      abortRef.current = null;
      setDownloading(null);
      setDlProgress(null);
    }
  };

  const handleCancelDownload = () => {
    abortRef.current?.abort();
  };

  const handleDownloadAll = async () => {
    if (!cryptoKey || !slug || decryptedFiles.length === 0) return;

    const controller = new AbortController();
    abortRef.current = controller;
    setError("");

    if (supportsDirectoryPicker()) {
      let dirHandle: FileSystemDirectoryHandle;
      try {
        dirHandle = await window.showDirectoryPicker({ mode: "readwrite" });
      } catch (err) {
        abortRef.current = null;
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(err instanceof Error ? err.message : t("share.downloadFailed"));
        return;
      }

      setBatchDownloading(true);
      try {
        for (let i = 0; i < decryptedFiles.length; i++) {
          if (controller.signal.aborted) break;
          const file = decryptedFiles[i];
          setBatchProgress({ current: i + 1, total: decryptedFiles.length });
          setDlProgress(null);

          const fileHandle = await dirHandle.getFileHandle(file.name, {
            create: true,
          });
          const writable = await fileHandle.createWritable();
          await downloadFileToWritable(
            slug,
            file.info,
            cryptoKey,
            writable,
            (p) => setDlProgress(p),
            controller.signal,
          );
        }
      } catch (err) {
        if (!(err instanceof DOMException && err.name === "AbortError")) {
          setError(err instanceof Error ? err.message : t("share.downloadFailed"));
        }
      } finally {
        abortRef.current = null;
        setBatchDownloading(false);
        setBatchProgress(null);
        setDlProgress(null);
      }
      return;
    }

    // Fallback: sequential in-memory downloads triggering Save As dialogs.
    setBatchDownloading(true);
    try {
      for (let i = 0; i < decryptedFiles.length; i++) {
        if (controller.signal.aborted) break;
        const file = decryptedFiles[i];
        setBatchProgress({ current: i + 1, total: decryptedFiles.length });
        setDlProgress(null);
        const blob = await downloadFileDecrypted(
          slug,
          file.info,
          cryptoKey,
          (p) => setDlProgress(p),
          controller.signal,
        );
        triggerDownload(blob, file.name);
      }
    } catch (err) {
      if (!(err instanceof DOMException && err.name === "AbortError")) {
        setError(err instanceof Error ? err.message : t("share.downloadFailed"));
      }
    } finally {
      abortRef.current = null;
      setBatchDownloading(false);
      setBatchProgress(null);
      setDlProgress(null);
    }
  };

  const handleRecipientUpload = async (newFiles: File[]) => {
    if (!slug || !share?.allowRecipientUpload) return;
    setUploading(true);
    setUploadPercent(0);
    setError("");
    const controller = new AbortController();
    uploadAbortRef.current = controller;

    try {
      const replyKey = await generateEncryptionKey();
      const replyKeyBase64 = await exportKeyToBase64(replyKey);

      const { slug: replySlug } = await api.post<{ slug: string; expiresAt: string | null }>(
        `/api/shares/${slug}/reply`,
        {},
        controller.signal,
      );

      const totalSize = newFiles.reduce((s, f) => s + f.size, 0);
      let uploaded = 0;

      for (let i = 0; i < newFiles.length; i++) {
        const file = newFiles[i];
        await uploadFileEncrypted(
          replySlug,
          file,
          replyKey,
          "RECIPIENT",
          (p) => {
            const done = uploaded + p.bytesUploaded;
            setUploadPercent((done / totalSize) * 100);
          },
          i,
          newFiles.length,
          controller.signal,
          (fileId) => {
            currentUploadRef.current = { slug: replySlug, fileId };
          },
        );
        currentUploadRef.current = null;
        uploaded += file.size;
      }

      const shareUrl = `${window.location.origin}/s/${replySlug}#${replyKeyBase64}`;
      await api.post(
        `/api/shares/${replySlug}/notify-owner`,
        {
          shareUrl,
          locale: getEmailLocale(i18n.language),
        },
        controller.signal,
      );

      setUploadDone(true);
    } catch (err) {
      const partial = currentUploadRef.current;
      if (partial) {
        api.del(`/api/shares/${partial.slug}/files/${partial.fileId}`).catch(() => {});
        currentUploadRef.current = null;
      }
      if (err instanceof DOMException && err.name === "AbortError") {
        // user cancelled
      } else {
        setError(err instanceof Error ? err.message : t("share.uploadFailed"));
      }
    } finally {
      uploadAbortRef.current = null;
      setUploading(false);
      setUploadPercent(0);
    }
  };

  const handleCancelRecipientUpload = () => {
    uploadAbortRef.current?.abort();
  };

  function formatSize(bytes: number | string): string {
    const b = Number(bytes);
    if (b === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const idx = Math.floor(Math.log(b) / Math.log(k));
    return parseFloat((b / Math.pow(k, idx)).toFixed(1)) + " " + sizes[idx];
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin w-8 h-8 border-4 border-brand-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (error && !share) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <div className="bg-red-50 border border-red-200 rounded-2xl p-8 max-w-md text-center">
          <h2 className="text-xl font-bold text-red-800 mb-2">{t("share.error")}</h2>
          <p className="text-red-600">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-gray-900">{t("share.title")}</h1>
        <div className="text-right space-y-0.5">
          {share?.expiresAt && (
            <span className="text-sm text-gray-400 block">
              {t("share.validUntil")}{" "}
              {new Date(share.expiresAt).toLocaleDateString(i18n.language)}
            </span>
          )}
          {share?.maxDownloads && (
            <span className="text-sm text-gray-400 block">
              {t("share.downloadsRemaining", {
                remaining: Math.max(0, share.maxDownloads - share.downloadCount),
                max: share.maxDownloads,
              })}
            </span>
          )}
        </div>
      </div>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 px-4 py-3 rounded-lg">
          {error}
        </p>
      )}

      {decryptedFiles.length > 1 && (
        <div className="flex flex-col items-end gap-1">
          <button
            onClick={handleDownloadAll}
            disabled={batchDownloading || downloading !== null}
            title={supportsDirectoryPicker() ? t("share.downloadAllHint") : undefined}
            className="text-sm font-medium text-brand-600 hover:text-brand-800 disabled:opacity-50 transition"
          >
            {batchDownloading ? t("share.downloading") : t("share.downloadAll")}
          </button>
          {supportsDirectoryPicker() && (
            <p className="text-xs text-gray-400 text-right max-w-xs">
              {t("share.downloadAllHint")}
            </p>
          )}
        </div>
      )}

      <div className="border border-gray-200 rounded-xl divide-y divide-gray-100 bg-white">
        {decryptedFiles.length === 0 ? (
          <p className="text-center text-gray-400 py-8">{t("share.noFiles")}</p>
        ) : (
          decryptedFiles.map((file) => (
            <div
              key={file.info.id}
              className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition"
            >
              <div className="flex items-center gap-3 min-w-0">
                <svg
                  className="w-5 h-5 text-gray-400 flex-shrink-0"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                  />
                </svg>
                <div className="min-w-0">
                  <p className="text-sm text-gray-700 truncate">{file.name}</p>
                  <p className="text-xs text-gray-400">
                    {formatSize(file.info.size)}
                    {file.info.uploadedBy === "RECIPIENT" && (
                      <span className="ml-2 text-brand-600">
                        {t("share.fromRecipient")}
                      </span>
                    )}
                  </p>
                </div>
              </div>

              <button
                onClick={() => handleDownload(file)}
                disabled={downloading !== null || batchDownloading}
                className="text-brand-600 hover:text-brand-800 font-medium text-sm
                  disabled:opacity-50 transition flex-shrink-0 ml-4"
              >
                {downloading === file.info.id ? t("share.downloading") : t("share.download")}
              </button>
            </div>
          ))
        )}
      </div>

      {(downloading || batchDownloading) && (
        <div className="space-y-2">
          <ProgressBar
            percent={
              dlProgress
                ? (dlProgress.chunkIndex / dlProgress.totalChunks) * 100
                : 0
            }
            label={
              batchProgress
                ? t("share.batchProgress", {
                    current: batchProgress.current,
                    total: batchProgress.total,
                  })
                : t("share.downloadProgress")
            }
          />
          <div className="flex justify-end">
            <button
              onClick={handleCancelDownload}
              className="text-sm text-gray-500 hover:text-red-600 transition"
            >
              {t("share.cancel")}
            </button>
          </div>
        </div>
      )}

      {share?.allowRecipientUpload && !uploadDone && (
        <div className="space-y-4">
          <h2 className="text-xl font-bold text-gray-900">
            {t("share.uploadBack")}
          </h2>
          <FileDropzone onFiles={handleRecipientUpload} disabled={uploading} />
          {uploading && (
            <div className="space-y-2">
              <ProgressBar percent={uploadPercent} label={t("share.encryptingUploading")} />
              <div className="flex justify-end">
                <button
                  onClick={handleCancelRecipientUpload}
                  className="text-sm text-gray-500 hover:text-red-600 transition"
                >
                  {t("share.cancel")}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {uploadDone && (
        <div className="bg-green-50 border border-green-200 rounded-2xl p-6 text-center">
          <svg
            className="w-12 h-12 text-green-500 mx-auto mb-3"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <h3 className="text-lg font-bold text-green-800 mb-1">
            {t("share.uploadSuccess")}
          </h3>
          <p className="text-green-700 text-sm">
            {t("share.ownerNotified")}
          </p>
        </div>
      )}
    </div>
  );
}
