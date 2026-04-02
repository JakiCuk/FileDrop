import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { api } from "../services/api";
import { useAdminAuth } from "../hooks/useAdminAuth";

interface ShareDetail {
  id: string;
  slug: string;
  ownerEmail: string;
  allowRecipientUpload: boolean;
  expiresAt: string | null;
  createdAt: string;
  downloadCount: number;
  maxDownloads: number | null;
  parentShareSlug: string | null;
  isExpired: boolean;
  files: Array<{
    id: string;
    encryptedName: string;
    size: string;
    chunkCount: number;
    uploadedBy: string;
    createdAt: string;
  }>;
  replies: Array<{
    id: string;
    slug: string;
    createdAt: string;
    expiresAt: string | null;
  }>;
}

function formatBytes(bytes: string, units: string[]): string {
  let n = parseFloat(bytes);
  if (isNaN(n) || n === 0) return `0 ${units[0]}`;
  let i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

export default function ShareDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { role } = useAdminAuth();
  const byteUnits = t("format.bytes", { returnObjects: true }) as string[];

  const [share, setShare] = useState<ShareDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .get(`/api/admin/shares/${slug}`)
      .then(setShare)
      .catch(() => setError(t("common.error")))
      .finally(() => setLoading(false));
  }, [slug, t]);

  const handleDelete = async () => {
    if (!share || !confirm(t("shares.confirmDelete", { slug: share.slug }))) return;
    try {
      await api.del(`/api/admin/shares/${share.slug}`);
      navigate("/shares");
    } catch {
      setError(t("common.error"));
    }
  };

  if (loading) return <div className="text-center py-20 text-admin-400">{t("common.loading")}</div>;
  if (error || !share) return <div className="text-center py-20 text-red-400">{error || t("common.error")}</div>;

  const infoItems = [
    { label: t("shares.slug"), value: share.slug },
    { label: t("shares.owner"), value: share.ownerEmail },
    { label: t("shares.created"), value: new Date(share.createdAt).toLocaleString() },
    { label: t("shares.expires"), value: share.expiresAt ? new Date(share.expiresAt).toLocaleString() : t("shares.never") },
    { label: t("shares.status"), value: share.isExpired ? t("shares.expired") : t("shares.active") },
    { label: t("shares.downloads"), value: `${share.downloadCount}${share.maxDownloads ? ` / ${share.maxDownloads}` : ` (${t("shares.unlimited")})`}` },
    { label: t("shares.recipientUpload"), value: share.allowRecipientUpload ? t("shares.yes") : t("shares.no") },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate("/shares")}
            className="p-2 rounded-lg text-admin-300 hover:bg-admin-700 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
            </svg>
          </button>
          <h1 className="text-2xl font-bold text-white">{t("shares.detail")}</h1>
        </div>
        {role === "admin" && (
          <button
            onClick={handleDelete}
            className="px-4 py-2 text-sm bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
          >
            {t("shares.delete")}
          </button>
        )}
      </div>

      <div className="bg-admin-800 border border-admin-700 rounded-xl p-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {infoItems.map((item) => (
            <div key={item.label}>
              <p className="text-xs font-medium text-admin-400 uppercase tracking-wider">{item.label}</p>
              <p className="text-sm text-white mt-1 break-all">{item.value}</p>
            </div>
          ))}
          <div>
            <p className="text-xs font-medium text-admin-400 uppercase tracking-wider">{t("shares.parentShare")}</p>
            {share.parentShareSlug ? (
              <button
                onClick={() => navigate(`/shares/${share.parentShareSlug}`)}
                className="text-sm text-blue-400 hover:text-blue-300 mt-1 font-mono transition-colors"
              >
                {share.parentShareSlug}
              </button>
            ) : (
              <p className="text-sm text-white mt-1">—</p>
            )}
          </div>
        </div>
      </div>

      <div className="bg-admin-800 border border-admin-700 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-admin-700">
          <h2 className="text-sm font-medium text-admin-400">{t("shares.fileList")} ({share.files.length})</h2>
        </div>
        {share.files.length === 0 ? (
          <p className="px-6 py-8 text-center text-admin-400">{t("shares.noFiles")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-admin-700">
                  <th className="px-4 py-3 text-left text-xs font-medium text-admin-400 uppercase">ID</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-admin-400 uppercase">{t("shares.size")}</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-admin-400 uppercase">Chunks</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-admin-400 uppercase">Uploaded By</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-admin-400 uppercase">{t("shares.created")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-admin-700/50">
                {share.files.map((f) => (
                  <tr key={f.id} className="hover:bg-admin-700/30">
                    <td className="px-4 py-3 text-sm font-mono text-admin-300">{f.id.slice(0, 8)}</td>
                    <td className="px-4 py-3 text-sm text-admin-200">{formatBytes(f.size, byteUnits)}</td>
                    <td className="px-4 py-3 text-sm text-admin-200">{f.chunkCount}</td>
                    <td className="px-4 py-3 text-sm text-admin-200">{f.uploadedBy}</td>
                    <td className="px-4 py-3 text-sm text-admin-200">{new Date(f.createdAt).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {share.replies.length > 0 && (
        <div className="bg-admin-800 border border-admin-700 rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-admin-700">
            <h2 className="text-sm font-medium text-admin-400">{t("shares.replyShares")} ({share.replies.length})</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-admin-700">
                  <th className="px-4 py-3 text-left text-xs font-medium text-admin-400 uppercase">{t("shares.slug")}</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-admin-400 uppercase">{t("shares.created")}</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-admin-400 uppercase">{t("shares.expires")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-admin-700/50">
                {share.replies.map((r) => (
                  <tr
                    key={r.id}
                    className="hover:bg-admin-700/30 cursor-pointer"
                    onClick={() => navigate(`/shares/${r.slug}`)}
                  >
                    <td className="px-4 py-3 text-sm font-mono text-blue-400">{r.slug}</td>
                    <td className="px-4 py-3 text-sm text-admin-200">{new Date(r.createdAt).toLocaleString()}</td>
                    <td className="px-4 py-3 text-sm text-admin-200">{r.expiresAt ? new Date(r.expiresAt).toLocaleString() : t("shares.never")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
