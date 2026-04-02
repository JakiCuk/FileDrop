import { useState, useCallback, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { api, ApiError } from "../services/api";
import {
  generateEncryptionKey,
  exportKeyToBase64,
} from "../services/crypto";
import {
  uploadFileEncrypted,
  type UploadProgress,
} from "../services/chunkedUpload";
import FileDropzone from "../components/FileDropzone";
import FileList from "../components/FileList";
import ProgressBar from "../components/ProgressBar";

type Stage = "select" | "uploading" | "done";

type Config = { shareExpiryOptions: number[]; shareDefaultExpiryDays: number };

export default function UploadPage() {
  const { t, i18n } = useTranslation();
  const [files, setFiles] = useState<File[]>([]);
  const [allowUpload, setAllowUpload] = useState(false);
  const [maxDownloads, setMaxDownloads] = useState<number | "">("");
  const [expiryOptions, setExpiryOptions] = useState<number[]>([1, 7, 14, 30, 90]);
  const [expiryDays, setExpiryDays] = useState(30);

  useEffect(() => {
    api.get<Config>("/api/config").then((cfg) => {
      setExpiryOptions(cfg.shareExpiryOptions);
      setExpiryDays(cfg.shareDefaultExpiryDays);
    }).catch(() => {});
  }, []);
  const [stage, setStage] = useState<Stage>("select");
  const [progress, setProgress] = useState<UploadProgress | null>(null);
  const [overallPercent, setOverallPercent] = useState(0);
  const [shareUrl, setShareUrl] = useState("");
  const [error, setError] = useState("");

  const handleFiles = useCallback((newFiles: File[]) => {
    setFiles((prev) => [...prev, ...newFiles]);
  }, []);

  const removeFile = useCallback((index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleShare = async () => {
    if (files.length === 0) return;
    setError("");
    setStage("uploading");

    try {
      const encryptionKey = await generateEncryptionKey();
      const keyBase64 = await exportKeyToBase64(encryptionKey);

      const { slug } = await api.post<{ slug: string }>("/api/shares", {
        allowRecipientUpload: allowUpload,
        expiresInDays: expiryDays,
        maxDownloads: maxDownloads === "" || maxDownloads === 0 ? null : maxDownloads,
        locale: i18n.language,
      });

      const totalSize = files.reduce((s, f) => s + f.size, 0);
      let uploadedTotal = 0;

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        await uploadFileEncrypted(
          slug,
          file,
          encryptionKey,
          "OWNER",
          (p) => {
            setProgress(p);
            const fileUploaded = uploadedTotal + p.bytesUploaded;
            setOverallPercent((fileUploaded / totalSize) * 100);
          },
          i,
          files.length,
        );
        uploadedTotal += file.size;
      }

      const url = `${window.location.origin}/s/${slug}#${keyBase64}`;
      setShareUrl(url);
      setStage("done");
    } catch (err) {
      if (err instanceof ApiError && err.status === 507) {
        setError(t("upload.diskFull"));
      } else {
        setError(err instanceof Error ? err.message : t("upload.uploadFailed"));
      }
      setStage("select");
    }
  };

  const copyLink = () => {
    navigator.clipboard.writeText(shareUrl);
  };

  if (stage === "done") {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6">
        <div className="bg-green-50 border border-green-200 rounded-2xl p-8 w-full max-w-lg text-center">
          <svg
            className="w-16 h-16 text-green-500 mx-auto mb-4"
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
          <h2 className="text-2xl font-bold text-gray-900 mb-2">
            {t("upload.filesUploaded")}
          </h2>
          <p className="text-gray-600 mb-6">
            {t("upload.shareLink")}
          </p>

          <div className="flex gap-2">
            <input
              readOnly
              value={shareUrl}
              className="flex-1 px-4 py-3 border border-gray-300 rounded-lg bg-white text-sm font-mono truncate"
            />
            <button
              onClick={copyLink}
              className="bg-brand-600 hover:bg-brand-700 text-white px-4 py-3 rounded-lg font-semibold transition whitespace-nowrap"
            >
              {t("upload.copy")}
            </button>
          </div>

          <p className="text-xs text-gray-400 mt-4">
            {t("upload.keyInfo")}
          </p>
        </div>

        <button
          onClick={() => {
            setFiles([]);
            setStage("select");
            setShareUrl("");
            setProgress(null);
            setOverallPercent(0);
          }}
          className="text-brand-600 hover:text-brand-800 font-medium transition"
        >
          {t("upload.uploadMore")}
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h1 className="text-3xl font-bold text-gray-900">{t("upload.title")}</h1>

      <FileDropzone
        onFiles={handleFiles}
        disabled={stage === "uploading"}
      />

      {files.length > 0 && (
        <>
          <FileList
            files={files.map((f) => ({ name: f.name, size: f.size }))}
            onRemove={removeFile}
            removable={stage === "select"}
          />

          <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
            <h3 className="font-semibold text-gray-900">{t("upload.settings")}</h3>

            <div className="flex items-center gap-3">
              <label className="text-sm text-gray-700">{t("upload.expiryLabel")}</label>
              <select
                value={expiryOptions.includes(expiryDays) ? expiryDays : expiryOptions[0]}
                onChange={(e) => setExpiryDays(Number(e.target.value))}
                disabled={stage === "uploading"}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm
                  focus:outline-none focus:ring-2 focus:ring-brand-500"
              >
                {expiryOptions.map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-3">
              <label className="text-sm text-gray-700">{t("upload.maxDownloadsLabel")}</label>
              {maxDownloads === "" ? (
                <button
                  type="button"
                  onClick={() => setMaxDownloads(1)}
                  disabled={stage === "uploading"}
                  className="px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-400
                    hover:border-brand-500 hover:text-gray-600 transition
                    focus:outline-none focus:ring-2 focus:ring-brand-500"
                >
                  {t("upload.unlimited")}
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={1}
                    step={1}
                    value={maxDownloads}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v === "" || v === "0") { setMaxDownloads(""); return; }
                      setMaxDownloads(Math.max(1, Math.floor(Number(v))));
                    }}
                    disabled={stage === "uploading"}
                    className="w-28 px-3 py-2 border border-gray-300 rounded-lg text-sm
                      focus:outline-none focus:ring-2 focus:ring-brand-500
                      [appearance:textfield] [&::-webkit-outer-spin-button]:opacity-100
                      [&::-webkit-inner-spin-button]:opacity-100"
                  />
                  <button
                    type="button"
                    onClick={() => setMaxDownloads("")}
                    disabled={stage === "uploading"}
                    className="text-gray-400 hover:text-red-500 transition"
                    title={t("upload.unlimited")}
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              )}
            </div>

            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={allowUpload}
                onChange={(e) => setAllowUpload(e.target.checked)}
                disabled={stage === "uploading"}
                className="w-5 h-5 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
              />
              <span className="text-sm text-gray-700">
                {t("upload.allowUpload")}
              </span>
            </label>
          </div>

          {stage === "uploading" && progress && (
            <div className="space-y-3">
              <ProgressBar
                percent={overallPercent}
                label={t("upload.overallProgress", { current: progress.fileIndex + 1, total: progress.totalFiles })}
              />
              <ProgressBar
                percent={(progress.chunkIndex / progress.totalChunks) * 100}
                label={progress.fileName}
              />
            </div>
          )}

          {error && (
            <p className="text-sm text-red-600 bg-red-50 px-4 py-3 rounded-lg">
              {error}
            </p>
          )}

          <button
            onClick={handleShare}
            disabled={stage === "uploading" || files.length === 0}
            className="w-full bg-brand-600 hover:bg-brand-700 text-white font-semibold
              py-4 rounded-xl text-lg transition shadow-lg shadow-brand-600/25
              disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {stage === "uploading"
              ? t("upload.uploading")
              : t("upload.shareFiles", { count: files.length })}
          </button>
        </>
      )}
    </div>
  );
}
