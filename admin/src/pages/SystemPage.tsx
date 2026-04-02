import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../services/api";
import { useAdminAuth } from "../hooks/useAdminAuth";
import DataTable from "../components/DataTable";

interface CronJobInfo {
  id: string;
  name: string;
  description: string;
  schedule: string;
  enabled: boolean;
  lastRunAt: string | null;
  nextRunAt: string;
}

interface SystemInfo {
  disk: {
    uploadDirPath: string;
    uploadDirSizeBytes: string;
    uploadDirPercent: number;
    diskTotalBytes: string;
    diskFreeBytes: string;
    diskUsedBytes: string;
    diskUsedPercent: number;
  };
  cronJobs: CronJobInfo[];
}

interface CleanupLog {
  id: string;
  startedAt: string;
  completedAt: string;
  sharesDeleted: number;
  bytesFreed: string;
  error: string | null;
}

interface Pagination {
  page: number;
  totalPages: number;
  total: number;
}

type ScheduleType = "everyNHours" | "daily" | "custom";

interface ScheduleForm {
  type: ScheduleType;
  hours: number;
  dailyHour: number;
  dailyMinute: number;
  custom: string;
}

function parseCronToForm(cron: string): ScheduleForm {
  const parts = cron.split(/\s+/);
  if (parts.length !== 5) return { type: "custom", hours: 6, dailyHour: 0, dailyMinute: 0, custom: cron };

  const [minute, hour] = parts;

  if (hour.startsWith("*/") && minute !== "*") {
    const interval = parseInt(hour.slice(2), 10);
    if ([1, 2, 3, 4, 6, 8, 12].includes(interval)) {
      return { type: "everyNHours", hours: interval, dailyHour: 0, dailyMinute: parseInt(minute, 10) || 0, custom: cron };
    }
  }

  if (/^\d+$/.test(minute) && /^\d+$/.test(hour) && parts[2] === "*" && parts[3] === "*" && parts[4] === "*") {
    return { type: "daily", hours: 6, dailyHour: parseInt(hour, 10), dailyMinute: parseInt(minute, 10), custom: cron };
  }

  return { type: "custom", hours: 6, dailyHour: 0, dailyMinute: 0, custom: cron };
}

function formToCron(form: ScheduleForm): string {
  switch (form.type) {
    case "everyNHours":
      return `0 */${form.hours} * * *`;
    case "daily":
      return `${form.dailyMinute} ${form.dailyHour} * * *`;
    case "custom":
      return form.custom;
  }
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

function formatDuration(start: string, end: string): string {
  const ms = new Date(end).getTime() - new Date(start).getTime();
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export default function SystemPage() {
  const { t } = useTranslation();
  const { role } = useAdminAuth();
  const byteUnits = t("format.bytes", { returnObjects: true }) as string[];
  const isAdmin = role === "admin";

  const [system, setSystem] = useState<SystemInfo | null>(null);
  const [logs, setLogs] = useState<CleanupLog[]>([]);
  const [logsPagination, setLogsPagination] = useState<Pagination>({ page: 1, totalPages: 0, total: 0 });
  const [loading, setLoading] = useState(true);

  const [editingJob, setEditingJob] = useState<string | null>(null);
  const [scheduleForm, setScheduleForm] = useState<ScheduleForm>({
    type: "everyNHours", hours: 6, dailyHour: 0, dailyMinute: 0, custom: "",
  });
  const [saving, setSaving] = useState(false);
  const [runningJob, setRunningJob] = useState<string | null>(null);
  const [jobMsg, setJobMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const loadSystem = useCallback(async () => {
    try {
      const data = await api.get("/api/admin/system");
      setSystem(data);
    } catch (err) {
      console.error("Failed to load system info:", err);
    }
  }, []);

  const loadLogs = useCallback(async () => {
    try {
      const res = await api.get(`/api/admin/cleanup-logs?page=${logsPagination.page}&limit=15`);
      setLogs(res.data);
      setLogsPagination(res.pagination);
    } catch (err) {
      console.error("Failed to load cleanup logs:", err);
    }
  }, [logsPagination.page]);

  useEffect(() => {
    Promise.all([loadSystem(), loadLogs()]).finally(() => setLoading(false));
  }, [loadSystem, loadLogs]);

  const handleEditJob = (job: CronJobInfo) => {
    setEditingJob(job.id);
    setScheduleForm(parseCronToForm(job.schedule));
    setJobMsg(null);
  };

  const handleSaveSchedule = async () => {
    if (!editingJob) return;
    setSaving(true);
    setJobMsg(null);
    try {
      const schedule = formToCron(scheduleForm);
      await api.put(`/api/admin/cron-jobs/${editingJob}`, { schedule });
      setEditingJob(null);
      setJobMsg({ type: "success", text: t("system.cronSaved") });
      await loadSystem();
    } catch {
      setJobMsg({ type: "error", text: t("system.cronSaveError") });
    } finally {
      setSaving(false);
    }
  };

  const handleToggleJob = async (job: CronJobInfo) => {
    try {
      await api.put(`/api/admin/cron-jobs/${job.id}`, { enabled: !job.enabled });
      setJobMsg({ type: "success", text: job.enabled ? t("system.cronDisabled") : t("system.cronEnabled") });
      await loadSystem();
    } catch {
      setJobMsg({ type: "error", text: t("system.cronSaveError") });
    }
  };

  const handleRunJob = async (jobId: string) => {
    setRunningJob(jobId);
    setJobMsg(null);
    try {
      await api.post(`/api/admin/cron-jobs/${jobId}/run`);
      setJobMsg({ type: "success", text: t("system.cronRunDone") });
      await Promise.all([loadSystem(), loadLogs()]);
    } catch {
      setJobMsg({ type: "error", text: t("system.cronRunError") });
    } finally {
      setRunningJob(null);
    }
  };

  if (loading) {
    return <div className="text-center py-20 text-admin-400">{t("common.loading")}</div>;
  }

  const logColumns = [
    { key: "startedAt", header: t("system.date"), render: (row: CleanupLog) => new Date(row.startedAt).toLocaleString() },
    { key: "duration", header: t("system.duration"), render: (row: CleanupLog) => formatDuration(row.startedAt, row.completedAt) },
    { key: "sharesDeleted", header: t("system.sharesDeleted"), render: (row: CleanupLog) => row.sharesDeleted },
    { key: "bytesFreed", header: t("system.bytesFreed"), render: (row: CleanupLog) => formatBytes(row.bytesFreed, byteUnits) },
    {
      key: "status", header: t("system.statusCol"), render: (row: CleanupLog) => (
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
          row.error ? "bg-red-900/50 text-red-300 border border-red-700" : "bg-green-900/50 text-green-300 border border-green-700"
        }`}>{row.error ? t("system.errorStatus") : t("system.success")}</span>
      ),
    },
  ];

  const hourOptions = [1, 2, 3, 4, 6, 8, 12];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-white">{t("system.title")}</h1>

      {system && (
        <div className="space-y-4">
          <div className="bg-admin-800 border border-admin-700 rounded-xl p-6">
            <h2 className="text-sm font-medium text-admin-400 mb-4">{t("system.uploadDirTitle")}</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
              <div>
                <p className="text-xs text-admin-400">{t("system.uploadDir")}</p>
                <p className="text-sm text-white font-mono mt-1">{system.disk.uploadDirPath}</p>
              </div>
              <div>
                <p className="text-xs text-admin-400">{t("system.uploadDirSize")}</p>
                <p className="text-sm text-white mt-1">{formatBytes(system.disk.uploadDirSizeBytes, byteUnits)}</p>
              </div>
              <div>
                <p className="text-xs text-admin-400">{t("system.uploadDirDiskShare")}</p>
                <p className="text-sm text-white mt-1">{system.disk.uploadDirPercent < 0.01 && Number(system.disk.uploadDirSizeBytes) > 0 ? "< 0.01" : system.disk.uploadDirPercent}%</p>
              </div>
            </div>
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-admin-400">{t("system.uploadDirOfDisk")}</span>
                <span className="text-admin-300">{formatBytes(system.disk.uploadDirSizeBytes, byteUnits)} / {formatBytes(system.disk.diskTotalBytes, byteUnits)}</span>
              </div>
              <div className="w-full h-2 bg-admin-700 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all bg-blue-500"
                  style={{ width: `${Math.max(system.disk.uploadDirPercent, system.disk.uploadDirPercent > 0 ? 0.5 : 0)}%` }}
                />
              </div>
            </div>
          </div>

          <div className="bg-admin-800 border border-admin-700 rounded-xl p-6">
            <h2 className="text-sm font-medium text-admin-400 mb-4">{t("system.diskUsage")}</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
              <div>
                <p className="text-xs text-admin-400">{t("system.diskTotal")}</p>
                <p className="text-sm text-white mt-1">{formatBytes(system.disk.diskTotalBytes, byteUnits)}</p>
              </div>
              <div>
                <p className="text-xs text-admin-400">{t("system.diskUsed")}</p>
                <p className="text-sm text-white mt-1">{formatBytes(system.disk.diskUsedBytes, byteUnits)}</p>
              </div>
              <div>
                <p className="text-xs text-admin-400">{t("system.diskFree")}</p>
                <p className="text-sm text-white mt-1">{formatBytes(system.disk.diskFreeBytes, byteUnits)}</p>
              </div>
            </div>
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-admin-300">{t("system.diskUsed")}</span>
                <span className="text-white font-medium">{system.disk.diskUsedPercent}%</span>
              </div>
              <div className="w-full h-4 bg-admin-700 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    system.disk.diskUsedPercent > 90 ? "bg-red-500" : system.disk.diskUsedPercent > 70 ? "bg-amber-500" : "bg-blue-500"
                  }`}
                  style={{ width: `${system.disk.diskUsedPercent}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Cron Jobs */}
      <div className="bg-admin-800 border border-admin-700 rounded-xl p-6">
        <h2 className="text-sm font-medium text-admin-400 mb-4">{t("system.scheduledTasks")}</h2>

        {jobMsg && (
          <div className={`mb-4 p-3 rounded-lg text-sm ${
            jobMsg.type === "success" ? "bg-green-900/50 border border-green-700 text-green-300" : "bg-red-900/50 border border-red-700 text-red-300"
          }`}>{jobMsg.text}</div>
        )}

        <div className="space-y-4">
          {system?.cronJobs.map((job) => (
            <div key={job.id} className={`border rounded-xl p-5 transition-colors ${
              job.enabled ? "border-admin-600 bg-admin-700/30" : "border-admin-700/50 bg-admin-800/50 opacity-60"
            }`}>
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-1">
                    <h3 className="text-white font-medium">{job.name}</h3>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                      job.enabled ? "bg-green-900/50 text-green-300 border border-green-700" : "bg-admin-700 text-admin-400 border border-admin-600"
                    }`}>{job.enabled ? t("system.enabled") : t("system.disabled")}</span>
                  </div>
                  <p className="text-sm text-admin-400 mb-3">{job.description}</p>
                  <div className="flex flex-wrap items-center gap-4 text-xs text-admin-300">
                    <span>
                      <span className="text-admin-500">{t("system.schedule")}:</span>{" "}
                      <code className="bg-admin-700 px-1.5 py-0.5 rounded text-blue-300">{job.schedule}</code>
                    </span>
                    {job.lastRunAt && (
                      <span>
                        <span className="text-admin-500">{t("system.lastRun")}:</span>{" "}
                        {new Date(job.lastRunAt).toLocaleString()}
                      </span>
                    )}
                    {job.nextRunAt && (
                      <span>
                        <span className="text-admin-500">{t("system.nextRun")}:</span>{" "}
                        {new Date(job.nextRunAt).toLocaleString()}
                      </span>
                    )}
                  </div>
                </div>

                {isAdmin && (
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      onClick={() => handleRunJob(job.id)}
                      disabled={runningJob === job.id}
                      className="px-3 py-1.5 text-xs bg-blue-600 hover:bg-blue-700 disabled:bg-admin-600 text-white rounded-lg transition-colors"
                    >
                      {runningJob === job.id ? t("system.running") : t("system.runNow")}
                    </button>
                    <button
                      onClick={() => handleEditJob(job)}
                      className="px-3 py-1.5 text-xs bg-admin-600 hover:bg-admin-500 text-white rounded-lg transition-colors"
                    >
                      {t("system.editSchedule")}
                    </button>
                    <button
                      onClick={() => handleToggleJob(job)}
                      className={`px-3 py-1.5 text-xs rounded-lg transition-colors ${
                        job.enabled
                          ? "bg-amber-600/20 text-amber-300 hover:bg-amber-600/40 border border-amber-700"
                          : "bg-green-600/20 text-green-300 hover:bg-green-600/40 border border-green-700"
                      }`}
                    >
                      {job.enabled ? t("system.disable") : t("system.enable")}
                    </button>
                  </div>
                )}
              </div>

              {/* Edit form */}
              {editingJob === job.id && (
                <div className="mt-4 pt-4 border-t border-admin-600">
                  <div className="space-y-4">
                    <div>
                      <label className="text-xs text-admin-400 block mb-2">{t("system.scheduleType")}</label>
                      <div className="flex gap-2">
                        {(["everyNHours", "daily", "custom"] as ScheduleType[]).map((type) => (
                          <button
                            key={type}
                            onClick={() => setScheduleForm((f) => ({ ...f, type }))}
                            className={`px-3 py-1.5 text-xs rounded-lg transition-colors ${
                              scheduleForm.type === type ? "bg-blue-600 text-white" : "bg-admin-700 text-admin-300 hover:bg-admin-600"
                            }`}
                          >
                            {t(`system.type_${type}`)}
                          </button>
                        ))}
                      </div>
                    </div>

                    {scheduleForm.type === "everyNHours" && (
                      <div className="flex items-center gap-3">
                        <span className="text-sm text-admin-300">{t("system.every")}</span>
                        <select
                          value={scheduleForm.hours}
                          onChange={(e) => setScheduleForm((f) => ({ ...f, hours: Number(e.target.value) }))}
                          className="bg-admin-700 text-white text-sm rounded-lg px-3 py-2 border border-admin-600 focus:outline-none focus:ring-1 focus:ring-blue-500"
                        >
                          {hourOptions.map((h) => (
                            <option key={h} value={h}>{h}</option>
                          ))}
                        </select>
                        <span className="text-sm text-admin-300">{t("system.hoursLabel")}</span>
                      </div>
                    )}

                    {scheduleForm.type === "daily" && (
                      <div className="flex items-center gap-3">
                        <span className="text-sm text-admin-300">{t("system.dailyAt")}</span>
                        <select
                          value={scheduleForm.dailyHour}
                          onChange={(e) => setScheduleForm((f) => ({ ...f, dailyHour: Number(e.target.value) }))}
                          className="bg-admin-700 text-white text-sm rounded-lg px-3 py-2 border border-admin-600 focus:outline-none focus:ring-1 focus:ring-blue-500"
                        >
                          {Array.from({ length: 24 }, (_, i) => (
                            <option key={i} value={i}>{String(i).padStart(2, "0")}</option>
                          ))}
                        </select>
                        <span className="text-sm text-white">:</span>
                        <select
                          value={scheduleForm.dailyMinute}
                          onChange={(e) => setScheduleForm((f) => ({ ...f, dailyMinute: Number(e.target.value) }))}
                          className="bg-admin-700 text-white text-sm rounded-lg px-3 py-2 border border-admin-600 focus:outline-none focus:ring-1 focus:ring-blue-500"
                        >
                          {[0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55].map((m) => (
                            <option key={m} value={m}>{String(m).padStart(2, "0")}</option>
                          ))}
                        </select>
                      </div>
                    )}

                    {scheduleForm.type === "custom" && (
                      <div>
                        <label className="text-xs text-admin-400 block mb-1">{t("system.cronExpression")}</label>
                        <input
                          value={scheduleForm.custom}
                          onChange={(e) => setScheduleForm((f) => ({ ...f, custom: e.target.value }))}
                          placeholder="0 */6 * * *"
                          className="bg-admin-700 text-white text-sm rounded-lg px-3 py-2 border border-admin-600 w-64 font-mono
                            focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                        <p className="text-xs text-admin-500 mt-1">{t("system.cronHelp")}</p>
                      </div>
                    )}

                    <div className="flex items-center gap-3">
                      <div className="text-xs text-admin-400">
                        {t("system.preview")}:{" "}
                        <code className="bg-admin-700 px-1.5 py-0.5 rounded text-blue-300">{formToCron(scheduleForm)}</code>
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <button
                        onClick={handleSaveSchedule}
                        disabled={saving}
                        className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 disabled:bg-admin-600 text-white rounded-lg transition-colors"
                      >
                        {saving ? t("system.saving") : t("system.save")}
                      </button>
                      <button
                        onClick={() => setEditingJob(null)}
                        className="px-4 py-2 text-sm bg-admin-700 hover:bg-admin-600 text-admin-300 rounded-lg transition-colors"
                      >
                        {t("common.cancel")}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Cleanup Logs */}
      <div className="bg-admin-800 border border-admin-700 rounded-xl p-6">
        <h2 className="text-sm font-medium text-admin-400 mb-4">{t("system.cleanupLogs")}</h2>
        <DataTable
          columns={logColumns}
          data={logs}
          emptyMessage={t("system.noLogs")}
          pagination={{
            page: logsPagination.page,
            totalPages: logsPagination.totalPages,
            total: logsPagination.total,
            onPageChange: (p) => setLogsPagination((prev) => ({ ...prev, page: p })),
          }}
        />
      </div>
    </div>
  );
}
