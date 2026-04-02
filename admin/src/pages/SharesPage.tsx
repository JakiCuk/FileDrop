import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { api } from "../services/api";
import { useAdminAuth } from "../hooks/useAdminAuth";
import DataTable from "../components/DataTable";

interface Share {
  id: string;
  slug: string;
  ownerEmail: string;
  fileCount: number;
  totalSize: string;
  allowRecipientUpload: boolean;
  expiresAt: string | null;
  createdAt: string;
  downloadCount: number;
  replyCount: number;
  isExpired: boolean;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
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

export default function SharesPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { role } = useAdminAuth();
  const byteUnits = t("format.bytes", { returnObjects: true }) as string[];

  const [shares, setShares] = useState<Share[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 20, total: 0, totalPages: 0 });
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [sort, setSort] = useState("createdAt");
  const [order, setOrder] = useState<"asc" | "desc">("desc");
  const [loading, setLoading] = useState(true);
  const [deleteSlug, setDeleteSlug] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(pagination.page),
        limit: String(pagination.limit),
        sort,
        order,
        status,
      });
      if (search) params.set("search", search);
      const res = await api.get(`/api/admin/shares?${params}`);
      setShares(res.data);
      setPagination(res.pagination);
    } catch (err) {
      console.error("Failed to load shares:", err);
    } finally {
      setLoading(false);
    }
  }, [pagination.page, pagination.limit, sort, order, status, search]);

  useEffect(() => { load(); }, [load]);

  const handleSort = (field: string) => {
    if (sort === field) {
      setOrder(order === "asc" ? "desc" : "asc");
    } else {
      setSort(field);
      setOrder("desc");
    }
  };

  const handleDelete = async (slug: string) => {
    try {
      await api.del(`/api/admin/shares/${slug}`);
      setDeleteSlug(null);
      load();
    } catch (err) {
      console.error("Failed to delete share:", err);
    }
  };

  const columns = [
    {
      key: "slug",
      header: t("shares.slug"),
      sortable: true,
      render: (row: Share) => (
        <span className="font-mono text-blue-400">{row.slug}</span>
      ),
    },
    {
      key: "ownerEmail",
      header: t("shares.owner"),
      render: (row: Share) => <span className="truncate max-w-[200px] block">{row.ownerEmail}</span>,
    },
    {
      key: "fileCount",
      header: t("shares.files"),
      render: (row: Share) => row.fileCount,
    },
    {
      key: "totalSize",
      header: t("shares.size"),
      render: (row: Share) => formatBytes(row.totalSize, byteUnits),
    },
    {
      key: "createdAt",
      header: t("shares.created"),
      sortable: true,
      render: (row: Share) => new Date(row.createdAt).toLocaleDateString(),
    },
    {
      key: "expiresAt",
      header: t("shares.expires"),
      sortable: true,
      render: (row: Share) =>
        row.expiresAt ? new Date(row.expiresAt).toLocaleDateString() : t("shares.never"),
    },
    {
      key: "status",
      header: t("shares.status"),
      render: (row: Share) => (
        <span
          className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
            row.isExpired
              ? "bg-red-900/50 text-red-300 border border-red-700"
              : "bg-green-900/50 text-green-300 border border-green-700"
          }`}
        >
          {row.isExpired ? t("shares.expired") : t("shares.active")}
        </span>
      ),
    },
    ...(role === "admin"
      ? [
          {
            key: "actions",
            header: t("shares.actions"),
            render: (row: Share) => (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setDeleteSlug(row.slug);
                }}
                className="text-red-400 hover:text-red-300 text-sm font-medium transition-colors"
              >
                {t("shares.delete")}
              </button>
            ),
          },
        ]
      : []),
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-white">{t("shares.title")}</h1>

      <div className="flex flex-col sm:flex-row gap-3">
        <input
          type="text"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPagination((p) => ({ ...p, page: 1 })); }}
          placeholder={t("shares.search")}
          className="flex-1 px-4 py-2.5 bg-admin-800 border border-admin-700 rounded-lg text-white placeholder-admin-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-colors"
        />
        <select
          value={status}
          onChange={(e) => { setStatus(e.target.value); setPagination((p) => ({ ...p, page: 1 })); }}
          className="px-4 py-2.5 bg-admin-800 border border-admin-700 rounded-lg text-white focus:border-blue-500 outline-none transition-colors"
        >
          <option value="all">{t("shares.all")}</option>
          <option value="active">{t("shares.active")}</option>
          <option value="expired">{t("shares.expired")}</option>
        </select>
      </div>

      <DataTable
        columns={columns}
        data={shares}
        loading={loading}
        emptyMessage={t("shares.noShares")}
        onRowClick={(row) => navigate(`/shares/${row.slug}`)}
        pagination={{
          page: pagination.page,
          totalPages: pagination.totalPages,
          total: pagination.total,
          onPageChange: (p) => setPagination((prev) => ({ ...prev, page: p })),
        }}
        sort={{
          field: sort,
          order,
          onSort: handleSort,
        }}
      />

      {deleteSlug && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-admin-800 border border-admin-700 rounded-2xl p-6 max-w-md w-full shadow-2xl">
            <h3 className="text-lg font-semibold text-white mb-2">{t("shares.delete")}</h3>
            <p className="text-admin-300 text-sm mb-6">
              {t("shares.confirmDelete", { slug: deleteSlug })}
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setDeleteSlug(null)}
                className="px-4 py-2 text-sm bg-admin-700 border border-admin-600 rounded-lg text-admin-300 hover:text-white transition-colors"
              >
                {t("common.cancel")}
              </button>
              <button
                onClick={() => handleDelete(deleteSlug)}
                className="px-4 py-2 text-sm bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
              >
                {t("common.confirm")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
