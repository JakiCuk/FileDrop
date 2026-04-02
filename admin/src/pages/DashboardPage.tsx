import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, BarChart, Bar, Legend,
} from "recharts";
import { api } from "../services/api";
import StatsCard from "../components/StatsCard";

interface Stats {
  totalShares: number;
  activeShares: number;
  expiredSharesPending: number;
  totalFiles: number;
  totalStorageBytes: string;
  totalUsers: number;
  totalDownloads: number;
  sharesCreatedToday: number;
  sharesCreatedThisWeek: number;
  sharesCreatedThisMonth: number;
}

interface TimelinePoint {
  date: string;
  value: number;
}

type Metric = "sharesCreated" | "sharesActive" | "totalFiles" | "totalStorageBytes" | "totalUsers" | "totalDownloads";

interface SystemInfo {
  disk: {
    uploadDirSizeBytes: string;
    uploadDirPercent: number;
    diskTotalBytes: string;
    diskFreeBytes: string;
    diskUsedBytes: string;
    diskUsedPercent: number;
  };
  cronJobs: Array<{
    id: string;
    name: string;
    lastRunAt: string | null;
    nextRunAt: string;
  }>;
}

interface ShareRow {
  slug: string;
  ownerEmail: string;
  totalSize: string;
  fileCount: number;
}

const COLORS = ["#3b82f6", "#f59e0b", "#10b981", "#ef4444", "#8b5cf6", "#ec4899", "#06b6d4", "#84cc16", "#f97316", "#6366f1"];

function formatBytes(bytes: number | string, units: string[]): string {
  let n = typeof bytes === "string" ? parseFloat(bytes) : bytes;
  if (isNaN(n) || n === 0) return `0 ${units[0]}`;
  let i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

export default function DashboardPage() {
  const { t } = useTranslation();
  const byteUnits = t("format.bytes", { returnObjects: true }) as string[];

  const [stats, setStats] = useState<Stats | null>(null);
  const [timeline, setTimeline] = useState<TimelinePoint[]>([]);
  const [system, setSystem] = useState<SystemInfo | null>(null);
  const [topShares, setTopShares] = useState<ShareRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [timelineDays, setTimelineDays] = useState(30);
  const [timelineMetric, setTimelineMetric] = useState<Metric>("sharesCreated");

  const timelineRanges = [
    { days: 30, label: t("dashboard.range30d") },
    { days: 90, label: t("dashboard.range90d") },
    { days: 365, label: t("dashboard.range1y") },
  ];

  const metricOptions: { value: Metric; label: string }[] = [
    { value: "sharesCreated", label: t("dashboard.metricSharesCreated") },
    { value: "sharesActive", label: t("dashboard.metricSharesActive") },
    { value: "totalFiles", label: t("dashboard.metricFiles") },
    { value: "totalUsers", label: t("dashboard.metricUsers") },
    { value: "totalDownloads", label: t("dashboard.metricDownloads") },
    { value: "totalStorageBytes", label: t("dashboard.metricStorage") },
  ];

  const loadTimeline = useCallback(async (days: number, metric: Metric) => {
    try {
      const data = await api.get(`/api/admin/stats/timeline?days=${days}&metric=${metric}`);
      setTimeline(data);
    } catch (err) {
      console.error("Timeline load error:", err);
    }
  }, []);

  const load = useCallback(async () => {
    const results = await Promise.allSettled([
      api.get("/api/admin/stats"),
      api.get(`/api/admin/stats/timeline?days=${timelineDays}&metric=${timelineMetric}`),
      api.get("/api/admin/system"),
      api.get("/api/admin/shares?page=1&limit=10"),
    ]);

    if (results[0].status === "fulfilled") setStats(results[0].value);
    if (results[1].status === "fulfilled") setTimeline(results[1].value);
    if (results[2].status === "fulfilled") setSystem(results[2].value);
    if (results[3].status === "fulfilled") {
      const sorted = [...results[3].value.data]
        .sort((a: ShareRow, b: ShareRow) => parseFloat(b.totalSize) - parseFloat(a.totalSize))
        .slice(0, 10);
      setTopShares(sorted);
    }

    for (const r of results) {
      if (r.status === "rejected") console.error("Dashboard load error:", r.reason);
    }

    setLoading(false);
  }, [timelineDays, timelineMetric]);

  useEffect(() => { load(); }, [load]);

  if (loading || !stats) {
    return <div className="text-center py-20 text-admin-400">{t("common.loading")}</div>;
  }

  const pieData = [
    { name: t("dashboard.active"), value: stats.activeShares },
    { name: t("dashboard.expired"), value: stats.expiredSharesPending },
  ];

  const cleanupTask = system?.cronJobs?.find((j) => j.id === "cleanup");

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-white">{t("dashboard.title")}</h1>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatsCard
          title={t("dashboard.totalShares")}
          value={stats.totalShares}
          subtitle={`${t("dashboard.today")}: +${stats.sharesCreatedToday} | ${t("dashboard.thisMonth")}: +${stats.sharesCreatedThisMonth}`}
          icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m9.86-2.44a4.5 4.5 0 00-1.242-7.244l-4.5-4.5a4.5 4.5 0 00-6.364 6.364L5.25 9.503" /></svg>}
        />
        <StatsCard
          title={t("dashboard.activeShares")}
          value={stats.activeShares}
          subtitle={`${t("dashboard.expiredPending")}: ${stats.expiredSharesPending}`}
          icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
        />
        <StatsCard
          title={t("dashboard.totalFiles")}
          value={stats.totalFiles}
          subtitle={`${t("dashboard.totalStorage")}: ${formatBytes(stats.totalStorageBytes, byteUnits)}`}
          icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" /></svg>}
        />
        <StatsCard
          title={t("dashboard.totalUsers")}
          value={stats.totalUsers}
          subtitle={`${t("dashboard.downloads")}: ${stats.totalDownloads}`}
          icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" /></svg>}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-admin-800 border border-admin-700 rounded-xl p-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
            <div className="flex items-center gap-3">
              <h2 className="text-sm font-medium text-admin-400">{t("dashboard.timeline")}</h2>
              <select
                value={timelineMetric}
                onChange={(e) => {
                  const m = e.target.value as Metric;
                  setTimelineMetric(m);
                  loadTimeline(timelineDays, m);
                }}
                className="bg-admin-700 text-white text-xs rounded-lg px-2 py-1 border border-admin-600
                  focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                {metricOptions.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            <div className="flex gap-1 bg-admin-700/50 rounded-lg p-0.5">
              {timelineRanges.map((r) => (
                <button
                  key={r.days}
                  onClick={() => {
                    setTimelineDays(r.days);
                    loadTimeline(r.days, timelineMetric);
                  }}
                  className={`px-3 py-1 text-xs rounded-md transition-colors ${
                    timelineDays === r.days
                      ? "bg-blue-600 text-white"
                      : "text-admin-400 hover:text-white"
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={timeline}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="date" tick={{ fill: "#94a3b8", fontSize: 11 }} tickFormatter={(v) => v.slice(5)} />
              <YAxis
                tick={{ fill: "#94a3b8", fontSize: 11 }}
                allowDecimals={false}
                tickFormatter={timelineMetric === "totalStorageBytes" ? (v) => formatBytes(v, byteUnits) : undefined}
              />
              <Tooltip
                contentStyle={{ backgroundColor: "#1e293b", border: "1px solid #334155", borderRadius: "8px", color: "#e2e8f0" }}
                labelStyle={{ color: "#94a3b8" }}
                formatter={(v: number) =>
                  timelineMetric === "totalStorageBytes" ? formatBytes(v, byteUnits) : v
                }
              />
              <Line type="monotone" dataKey="value" stroke="#3b82f6" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-admin-800 border border-admin-700 rounded-xl p-5">
          <h2 className="text-sm font-medium text-admin-400 mb-4">{t("dashboard.storageDistribution")}</h2>
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie data={pieData} cx="50%" cy="50%" innerRadius={60} outerRadius={90} paddingAngle={4} dataKey="value">
                {pieData.map((_, i) => (
                  <Cell key={i} fill={COLORS[i]} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{ backgroundColor: "#1e293b", border: "1px solid #334155", borderRadius: "8px", color: "#e2e8f0" }}
              />
              <Legend wrapperStyle={{ color: "#94a3b8", fontSize: 12 }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-admin-800 border border-admin-700 rounded-xl p-5">
          <h2 className="text-sm font-medium text-admin-400 mb-4">{t("dashboard.topShares")}</h2>
          {topShares.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={topShares} layout="vertical" margin={{ left: 60 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis type="number" tick={{ fill: "#94a3b8", fontSize: 11 }} tickFormatter={(v) => formatBytes(v, byteUnits)} />
                <YAxis type="category" dataKey="slug" tick={{ fill: "#94a3b8", fontSize: 11 }} width={80} />
                <Tooltip
                  contentStyle={{ backgroundColor: "#1e293b", border: "1px solid #334155", borderRadius: "8px", color: "#e2e8f0" }}
                  formatter={(value: number) => formatBytes(value, byteUnits)}
                />
                <Bar dataKey="totalSize" radius={[0, 4, 4, 0]}>
                  {topShares.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-admin-400 text-center py-12">{t("dashboard.noData")}</p>
          )}
        </div>

        <div className="bg-admin-800 border border-admin-700 rounded-xl p-5 space-y-4">
          <h2 className="text-sm font-medium text-admin-400">{t("dashboard.diskUsage")}</h2>
          {system && (
            <>
              <div className="space-y-3">
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-admin-400">{t("dashboard.uploadStorage")}</span>
                    <span className="text-admin-300">{formatBytes(system.disk.uploadDirSizeBytes, byteUnits)}</span>
                  </div>
                  <div className="w-full h-2 bg-admin-700 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all bg-blue-500"
                      style={{ width: `${Math.max(system.disk.uploadDirPercent, system.disk.uploadDirPercent > 0 ? 0.5 : 0)}%` }}
                    />
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-admin-400">{t("dashboard.totalDisk")}</span>
                    <span className="text-admin-300">{formatBytes(system.disk.diskUsedBytes, byteUnits)} / {formatBytes(system.disk.diskTotalBytes, byteUnits)} ({system.disk.diskUsedPercent}%)</span>
                  </div>
                  <div className="w-full h-2 bg-admin-700 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        system.disk.diskUsedPercent > 90
                          ? "bg-red-500"
                          : system.disk.diskUsedPercent > 70
                          ? "bg-amber-500"
                          : "bg-emerald-500"
                      }`}
                      style={{ width: `${system.disk.diskUsedPercent}%` }}
                    />
                  </div>
                </div>
                <p className="text-xs text-admin-500 italic">{t("dashboard.dockerDiskNote")}</p>
              </div>

              {cleanupTask && (
                <div className="space-y-3 pt-2 border-t border-admin-700">
                  <div>
                    <p className="text-xs text-admin-400">{t("dashboard.lastCleanup")}</p>
                    <p className="text-sm text-white">
                      {cleanupTask.lastRunAt
                        ? new Date(cleanupTask.lastRunAt).toLocaleString()
                        : "—"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-admin-400">{t("dashboard.nextCleanup")}</p>
                    <p className="text-sm text-white">
                      {cleanupTask.nextRunAt ? new Date(cleanupTask.nextRunAt).toLocaleString() : "—"}
                    </p>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
