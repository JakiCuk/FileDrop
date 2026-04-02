import { useTranslation } from "react-i18next";

interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => React.ReactNode;
  sortable?: boolean;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  pagination?: {
    page: number;
    totalPages: number;
    total: number;
    onPageChange: (page: number) => void;
  };
  sort?: {
    field: string;
    order: "asc" | "desc";
    onSort: (field: string) => void;
  };
  onRowClick?: (row: T) => void;
  emptyMessage?: string;
  loading?: boolean;
}

export default function DataTable<T>({
  columns,
  data,
  pagination,
  sort,
  onRowClick,
  emptyMessage,
  loading,
}: DataTableProps<T>) {
  const { t } = useTranslation();

  if (loading) {
    return (
      <div className="bg-admin-800 border border-admin-700 rounded-xl p-12 text-center text-admin-400">
        {t("common.loading")}
      </div>
    );
  }

  return (
    <div className="bg-admin-800 border border-admin-700 rounded-xl overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-admin-700">
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={`px-4 py-3 text-left text-xs font-medium text-admin-400 uppercase tracking-wider ${
                    col.sortable && sort ? "cursor-pointer hover:text-white select-none" : ""
                  }`}
                  onClick={() => col.sortable && sort?.onSort(col.key)}
                >
                  <div className="flex items-center gap-1">
                    {col.header}
                    {col.sortable && sort?.field === col.key && (
                      <span className="text-blue-400">
                        {sort.order === "asc" ? "\u2191" : "\u2193"}
                      </span>
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-admin-700/50">
            {data.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="px-4 py-12 text-center text-admin-400"
                >
                  {emptyMessage || t("dashboard.noData")}
                </td>
              </tr>
            ) : (
              data.map((row, i) => (
                <tr
                  key={i}
                  className={`transition-colors ${
                    onRowClick
                      ? "cursor-pointer hover:bg-admin-700/50"
                      : "hover:bg-admin-700/30"
                  }`}
                  onClick={() => onRowClick?.(row)}
                >
                  {columns.map((col) => (
                    <td key={col.key} className="px-4 py-3 text-sm text-admin-200">
                      {col.render(row)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {pagination && pagination.totalPages > 1 && (
        <div className="flex items-center justify-between px-4 py-3 border-t border-admin-700">
          <span className="text-sm text-admin-400">
            {t("common.page")} {pagination.page} {t("common.of")} {pagination.totalPages} ({pagination.total})
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => pagination.onPageChange(pagination.page - 1)}
              disabled={pagination.page <= 1}
              className="px-3 py-1.5 text-sm bg-admin-700 border border-admin-600 rounded-lg text-admin-300 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {t("common.previous")}
            </button>
            <button
              onClick={() => pagination.onPageChange(pagination.page + 1)}
              disabled={pagination.page >= pagination.totalPages}
              className="px-3 py-1.5 text-sm bg-admin-700 border border-admin-600 rounded-lg text-admin-300 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {t("common.next")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
