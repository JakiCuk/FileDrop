import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { api, ApiError } from "../services/api";

interface ShareSummary {
  id: string;
  slug: string;
  allowRecipientUpload: boolean;
  expiresAt: string | null;
  maxDownloads: number | null;
  downloadCount: number;
  createdAt: string;
  fileCount: number;
  parentShareId: string | null;
}

export default function MySharesPage() {
  const { t, i18n } = useTranslation();
  const [shares, setShares] = useState<ShareSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    loadShares();
  }, []);

  async function loadShares() {
    setLoading(true);
    try {
      const data = await api.get<ShareSummary[]>("/api/shares");
      setShares(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("myShares.loadFailed"));
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(slug: string) {
    if (!confirm(t("myShares.confirmDelete"))) return;
    try {
      await api.del(`/api/shares/${slug}`);
      setShares((prev) => prev.filter((s) => s.slug !== slug));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("myShares.deleteFailed"));
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin w-8 h-8 border-4 border-brand-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h1 className="text-3xl font-bold text-gray-900">{t("myShares.title")}</h1>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 px-4 py-3 rounded-lg">
          {error}
        </p>
      )}

      {shares.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p className="text-lg">{t("myShares.noShares")}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {shares.map((share) => (
            <div
              key={share.id}
              className="bg-white border border-gray-200 rounded-xl p-5 flex items-center justify-between"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <code className="text-sm font-mono text-brand-700 bg-brand-50 px-2 py-0.5 rounded">
                    {share.slug}
                  </code>
                  {share.parentShareId && (
                    <span className="text-xs bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full">
                      {t("myShares.replyTag")}
                    </span>
                  )}
                  {share.allowRecipientUpload && !share.parentShareId && (
                    <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
                      {t("myShares.bidirectionalTag")}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-4 mt-1 text-xs text-gray-400">
                  <span>{share.fileCount} {t("myShares.files")}</span>
                  <span>
                    {t("myShares.created")}{" "}
                    {new Date(share.createdAt).toLocaleDateString(i18n.language)}
                  </span>
                  {share.expiresAt && (
                    <span>
                      {t("myShares.expires")}{" "}
                      {new Date(share.expiresAt).toLocaleDateString(i18n.language)}
                    </span>
                  )}
                  {share.maxDownloads ? (
                    <span>
                      {t("myShares.downloads")}: {share.downloadCount}/{share.maxDownloads}
                    </span>
                  ) : null}
                </div>
                {share.parentShareId && (
                  <p className="text-xs text-brand-600 mt-1">
                    {t("myShares.emailSent")}
                  </p>
                )}
              </div>

              <div className="flex gap-2 flex-shrink-0 ml-4">
                <button
                  onClick={() => handleDelete(share.slug)}
                  className="text-sm text-red-500 hover:text-red-700 font-medium transition"
                >
                  {t("myShares.delete")}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
