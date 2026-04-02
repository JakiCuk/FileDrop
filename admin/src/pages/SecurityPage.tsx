import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { api } from "../services/api";
import StatsCard from "../components/StatsCard";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface CheckDetail {
  category: "configurable" | "code_level" | "infrastructure";
  status?: boolean;
  configKeys: string[];
  currentConfig: Record<string, unknown>;
  recommendations: string[];
}

interface SecurityStatus {
  jwtSecret?: { level: "ok" | "warn" | "error"; reasons: string[]; length: number };
  jwtSecretSafe?: boolean;
  smtpConfigured: boolean;
  diskMonitorActive: boolean;
  adminNotifyConfigured: boolean;
  jwtAlgorithmPinned: boolean;
  rateLimitingActive: boolean;
  inputValidationActive: boolean;
  pathTraversalProtection: boolean;
  securityHeadersActive: boolean;
  securityLoggingActive: boolean;
  details?: Record<string, CheckDetail>;
}

interface SecurityStats {
  byType: Record<string, Record<string, number>>;
  topIps: { ip: string; count: number }[];
  daily: { date: string; event: string; count: number }[];
}

interface SecurityEvent {
  id: string;
  event: string;
  ip: string;
  method: string;
  path: string;
  details: string | null;
  createdAt: string;
}

interface EventsPagination {
  data: SecurityEvent[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

const EVENT_TYPES = [
  "auth_failed", "admin_denied", "otp_invalid",
  "rate_limited", "path_traversal", "invalid_input",
] as const;

const EVENT_COLORS: Record<string, string> = {
  auth_failed: "#ef4444",
  admin_denied: "#f97316",
  otp_invalid: "#eab308",
  rate_limited: "#8b5cf6",
  path_traversal: "#ec4899",
  invalid_input: "#6366f1",
};

const EVENT_BADGE_CLASSES: Record<string, string> = {
  auth_failed: "bg-red-900/40 text-red-400 border-red-700",
  admin_denied: "bg-orange-900/40 text-orange-400 border-orange-700",
  otp_invalid: "bg-yellow-900/40 text-yellow-400 border-yellow-700",
  rate_limited: "bg-purple-900/40 text-purple-400 border-purple-700",
  path_traversal: "bg-pink-900/40 text-pink-400 border-pink-700",
  invalid_input: "bg-indigo-900/40 text-indigo-400 border-indigo-700",
};

/* All known status check keys */
const STATUS_CHECKS = [
  "jwtSecret",
  "smtpConfigured",
  "diskMonitorActive",
  "adminNotifyConfigured",
  "jwtAlgorithmPinned",
  "rateLimitingActive",
  "inputValidationActive",
  "pathTraversalProtection",
  "securityHeadersActive",
  "securityLoggingActive",
  "corsRestricted",
  "emailDomainWhitelist",
] as const;

type StatusCheckKey = (typeof STATUS_CHECKS)[number];

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/** Get the boolean/level status for a given check key */
function getCheckStatus(key: StatusCheckKey, status: SecurityStatus): "ok" | "warn" | "error" {
  const detail = status.details?.[key];
  switch (key) {
    case "jwtSecret": {
      const jwt = status.jwtSecret ?? (status.jwtSecretSafe ? { level: "ok" } : { level: "error" });
      return jwt.level as "ok" | "warn" | "error";
    }
    case "smtpConfigured":
      return status.smtpConfigured ? "ok" : "warn";
    case "diskMonitorActive":
      return status.diskMonitorActive ? "ok" : "warn";
    case "adminNotifyConfigured":
      return status.adminNotifyConfigured ? "ok" : "warn";
    case "corsRestricted":
    case "emailDomainWhitelist":
      return detail?.status ? "ok" : "warn";
    default:
      return (status as unknown as Record<string, boolean>)[key] ? "ok" : "error";
  }
}

function getCategory(key: StatusCheckKey, status: SecurityStatus): "configurable" | "code_level" | "infrastructure" {
  return status.details?.[key]?.category ?? "code_level";
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function SecurityPage() {
  const { t } = useTranslation();
  const [status, setStatus] = useState<SecurityStatus | null>(null);
  const [stats, setStats] = useState<SecurityStats | null>(null);
  const [events, setEvents] = useState<EventsPagination | null>(null);
  const [loading, setLoading] = useState(true);

  const [timelineRange, setTimelineRange] = useState<"7" | "30">("7");
  const [eventFilter, setEventFilter] = useState("");
  const [ipFilter, setIpFilter] = useState("");
  const [daysFilter, setDaysFilter] = useState("7");
  const [page, setPage] = useState(1);

  /* Detail modal state */
  const [selectedCheck, setSelectedCheck] = useState<StatusCheckKey | null>(null);
  const [modalTab, setModalTab] = useState<"detail" | "info">("detail");

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const results = await Promise.allSettled([
      api.get("/api/admin/security/status"),
      api.get("/api/admin/security/stats"),
      api.get(`/api/admin/security/events?page=${page}&limit=15&event=${eventFilter}&ip=${encodeURIComponent(ipFilter)}&days=${daysFilter}`),
    ]);
    if (results[0].status === "fulfilled") setStatus(results[0].value);
    if (results[1].status === "fulfilled") setStats(results[1].value);
    if (results[2].status === "fulfilled") setEvents(results[2].value);
    setLoading(false);
  }, [page, eventFilter, ipFilter, daysFilter]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const eventLabel = (type: string): string => {
    const key = `security.event${type.charAt(0).toUpperCase() + type.slice(1).replace(/_([a-z])/g, (_, c) => c.toUpperCase())}`;
    return t(key, type);
  };

  const jwtReasonLabel = (reason: string): string =>
    t(`security.jwtReason.${reason}`, { defaultValue: reason });

  const jwt = status?.jwtSecret ?? (status?.jwtSecretSafe === undefined
    ? null
    : {
        level: status.jwtSecretSafe ? ("ok" as const) : ("error" as const),
        reasons: status.jwtSecretSafe ? [] : ["placeholder"],
        length: 0,
      });

  const warnings: { key: string; message: string; level: "error" | "warning" }[] = [];
  if (status) {
    if (jwt && jwt.level !== "ok") {
      const joined = jwt.reasons.length > 0
        ? jwt.reasons.map(jwtReasonLabel).join(", ")
        : t("security.jwtSecretWeak");
      warnings.push({
        key: "jwt",
        message: `${t(jwt.level === "error" ? "security.jwtSecretUnsafe" : "security.jwtSecretWeak")}: ${joined}`,
        level: jwt.level === "error" ? "error" : "warning",
      });
    }
    if (!status.smtpConfigured) warnings.push({ key: "smtp", message: t("security.smtpNotConfigured"), level: "warning" });
    if (!status.diskMonitorActive) warnings.push({ key: "disk", message: t("security.diskMonitorInactive"), level: "warning" });
    if (!status.adminNotifyConfigured) warnings.push({ key: "notify", message: t("security.adminNotifyNotConfigured"), level: "warning" });
    // New checks
    if (status.details?.corsRestricted && !status.details.corsRestricted.status) {
      warnings.push({ key: "cors", message: t("security.corsNotRestricted"), level: "warning" });
    }
    if (status.details?.emailDomainWhitelist && !status.details.emailDomainWhitelist.status) {
      warnings.push({ key: "emailDomain", message: t("security.emailDomainNotSet"), level: "warning" });
    }
  }

  const timelineData = buildTimeline(stats?.daily ?? [], parseInt(timelineRange));
  const stats24h = stats?.byType?.["24h"] ?? {};
  const total24h = Object.values(stats24h).reduce((a, b) => a + b, 0);

  if (loading && !status) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold text-white mb-6">{t("security.title")}</h1>
        <p className="text-admin-400">{t("common.loading")}</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-8">
      <h1 className="text-2xl font-bold text-white">{t("security.title")}</h1>

      {/* Warnings Banner */}
      {warnings.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-lg font-semibold text-white">{t("security.warningsTitle")}</h2>
          {warnings.map((w) => (
            <div
              key={w.key}
              className={`flex items-center gap-3 px-4 py-3 rounded-lg border ${
                w.level === "error"
                  ? "bg-red-900/20 border-red-800 text-red-300"
                  : "bg-yellow-900/20 border-yellow-800 text-yellow-300"
              }`}
            >
              <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
              <span className="text-sm">{w.message}</span>
            </div>
          ))}
        </div>
      )}
      {warnings.length === 0 && status && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-lg border bg-green-900/20 border-green-800 text-green-300">
          <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span className="text-sm">{t("security.allGood")}</span>
        </div>
      )}

      {/* Protection Status Grid */}
      {status && (
        <div>
          <h2 className="text-lg font-semibold text-white mb-4">{t("security.statusTitle")}</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {STATUS_CHECKS.map((key) => {
              const checkStatus = getCheckStatus(key, status);
              const category = getCategory(key, status);
              const detail = status.details?.[key];
              const hasRecommendations = (detail?.recommendations?.length ?? 0) > 0;

              return (
                <button
                  key={key}
                  onClick={() => { setSelectedCheck(key); setModalTab("detail"); }}
                  className={`text-left bg-admin-800 border rounded-lg p-4 flex items-start gap-3 transition-all hover:bg-admin-750 hover:shadow-lg cursor-pointer group ${
                    checkStatus === "ok"
                      ? "border-admin-700 hover:border-admin-500"
                      : checkStatus === "warn"
                      ? "border-yellow-800 hover:border-yellow-600"
                      : "border-red-800 hover:border-red-600"
                  }`}
                >
                  <div className={`w-2.5 h-2.5 rounded-full mt-1 flex-shrink-0 ${
                    checkStatus === "ok" ? "bg-green-400" : checkStatus === "warn" ? "bg-yellow-400" : "bg-red-400"
                  }`} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-white">{t(`security.${key}`)}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                        checkStatus === "ok"
                          ? "bg-green-900/40 text-green-400"
                          : checkStatus === "warn"
                          ? "bg-yellow-900/40 text-yellow-400"
                          : "bg-red-900/40 text-red-400"
                      }`}>
                        {checkStatus === "ok" ? t("security.active") : checkStatus === "warn" ? t("security.warning") : t("security.inactive")}
                      </span>
                      {/* Category badge */}
                      <span className={`text-[9px] px-1.5 py-0.5 rounded ${
                        category === "configurable"
                          ? "bg-blue-900/30 text-blue-400 border border-blue-800"
                          : category === "infrastructure"
                          ? "bg-purple-900/30 text-purple-400 border border-purple-800"
                          : "bg-admin-700 text-admin-400 border border-admin-600"
                      }`}>
                        {t(`security.category_${category}`)}
                      </span>
                    </div>
                    <p className="text-xs text-admin-400 mt-0.5">{t(`security.${key}Desc`)}</p>
                    {/* JWT-specific extra info */}
                    {key === "jwtSecret" && jwt && (
                      <p className="text-xs text-admin-500 mt-0.5">
                        {t("security.jwtSecretInfo")} {jwt.length}
                        {jwt.reasons.length > 0 && (
                          <> {" \u2022 "} {t("security.reasons")}: {jwt.reasons.map(jwtReasonLabel).join(", ")}</>
                        )}
                      </p>
                    )}
                    {/* Warning indicator for recommendations */}
                    {hasRecommendations && (
                      <div className="flex items-center gap-1 mt-1">
                        <svg className="w-3 h-3 text-yellow-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                        </svg>
                        <span className="text-[10px] text-yellow-500">{t("security.hasRecommendations")}</span>
                      </div>
                    )}
                  </div>
                  {/* Click indicator */}
                  <svg className="w-4 h-4 text-admin-500 group-hover:text-admin-300 mt-0.5 flex-shrink-0 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                  </svg>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Detail Modal */}
      {selectedCheck && status && (
        <DetailModal
          checkKey={selectedCheck}
          status={status}
          jwt={jwt}
          onClose={() => setSelectedCheck(null)}
          tab={modalTab}
          onTabChange={setModalTab}
          t={t}
          jwtReasonLabel={jwtReasonLabel}
        />
      )}

      {/* Stats Cards */}
      <div>
        <h2 className="text-lg font-semibold text-white mb-4">{t("security.statsTitle")}</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <StatsCard title={t("security.totalEvents")} value={total24h} icon={<ShieldIcon />} />
          <StatsCard title={t("security.authFailures")} value={stats24h.auth_failed ?? 0} trend={(stats24h.auth_failed ?? 0) > 0 ? "down" : "neutral"} icon={<LockIcon />} />
          <StatsCard title={t("security.rateLimitHits")} value={stats24h.rate_limited ?? 0} trend={(stats24h.rate_limited ?? 0) > 0 ? "down" : "neutral"} icon={<SpeedIcon />} />
          <StatsCard title={t("security.invalidInputs")} value={(stats24h.invalid_input ?? 0) + (stats24h.otp_invalid ?? 0)} trend={((stats24h.invalid_input ?? 0) + (stats24h.otp_invalid ?? 0)) > 0 ? "down" : "neutral"} icon={<AlertIcon />} />
        </div>
      </div>

      {/* Timeline Chart */}
      <div className="bg-admin-800 border border-admin-700 rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white">{t("security.timelineTitle")}</h2>
          <div className="flex gap-2">
            {(["7", "30"] as const).map((r) => (
              <button
                key={r}
                onClick={() => setTimelineRange(r)}
                className={`px-3 py-1 text-xs rounded-lg ${
                  timelineRange === r
                    ? "bg-blue-600 text-white"
                    : "bg-admin-700 text-admin-300 hover:bg-admin-600"
                }`}
              >
                {t(`security.range${r}d`)}
              </button>
            ))}
          </div>
        </div>
        {timelineData.length > 0 ? (
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={timelineData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="date" tick={{ fill: "#9ca3af", fontSize: 11 }} />
              <YAxis tick={{ fill: "#9ca3af", fontSize: 11 }} allowDecimals={false} />
              <Tooltip
                contentStyle={{ backgroundColor: "#1f2937", border: "1px solid #374151", borderRadius: 8 }}
                labelStyle={{ color: "#e5e7eb" }}
              />
              <Legend />
              {EVENT_TYPES.map((type) => (
                <Area
                  key={type}
                  type="monotone"
                  dataKey={type}
                  name={eventLabel(type)}
                  stackId="1"
                  fill={EVENT_COLORS[type]}
                  stroke={EVENT_COLORS[type]}
                  fillOpacity={0.4}
                />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-admin-400 text-sm py-8 text-center">{t("security.noEvents")}</p>
        )}
      </div>

      {/* Top IPs */}
      {stats && stats.topIps.length > 0 && (
        <div className="bg-admin-800 border border-admin-700 rounded-xl p-5">
          <h2 className="text-lg font-semibold text-white mb-4">{t("security.topIps")}</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-admin-400 border-b border-admin-700">
                  <th className="text-left py-2 px-3">#</th>
                  <th className="text-left py-2 px-3">{t("security.ip")}</th>
                  <th className="text-right py-2 px-3">{t("security.count")}</th>
                </tr>
              </thead>
              <tbody>
                {stats.topIps.map((row, i) => (
                  <tr key={row.ip} className="border-b border-admin-700/50 hover:bg-admin-700/30">
                    <td className="py-2 px-3 text-admin-400">{i + 1}</td>
                    <td className="py-2 px-3 text-white font-mono text-xs">{row.ip}</td>
                    <td className="py-2 px-3 text-right text-white">{row.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Events Table */}
      <div className="bg-admin-800 border border-admin-700 rounded-xl p-5">
        <h2 className="text-lg font-semibold text-white mb-4">{t("security.eventsTitle")}</h2>

        <div className="flex flex-wrap gap-3 mb-4">
          <select
            value={eventFilter}
            onChange={(e) => { setEventFilter(e.target.value); setPage(1); }}
            className="bg-admin-700 border border-admin-600 text-white rounded-lg px-3 py-1.5 text-sm"
          >
            <option value="">{t("security.allTypes")}</option>
            {EVENT_TYPES.map((type) => (
              <option key={type} value={type}>{eventLabel(type)}</option>
            ))}
          </select>
          <input
            type="text"
            placeholder={t("security.filterIp")}
            value={ipFilter}
            onChange={(e) => { setIpFilter(e.target.value); setPage(1); }}
            className="bg-admin-700 border border-admin-600 text-white rounded-lg px-3 py-1.5 text-sm w-40"
          />
          <select
            value={daysFilter}
            onChange={(e) => { setDaysFilter(e.target.value); setPage(1); }}
            className="bg-admin-700 border border-admin-600 text-white rounded-lg px-3 py-1.5 text-sm"
          >
            <option value="1">24h</option>
            <option value="7">{t("security.last7d")}</option>
            <option value="30">{t("security.last30d")}</option>
          </select>
        </div>

        {events && events.data.length > 0 ? (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-admin-400 border-b border-admin-700">
                    <th className="text-left py-2 px-3">{t("security.colTime")}</th>
                    <th className="text-left py-2 px-3">{t("security.colType")}</th>
                    <th className="text-left py-2 px-3">{t("security.colIp")}</th>
                    <th className="text-left py-2 px-3">{t("security.colMethod")}</th>
                    <th className="text-left py-2 px-3">{t("security.colPath")}</th>
                    <th className="text-left py-2 px-3">{t("security.colDetail")}</th>
                  </tr>
                </thead>
                <tbody>
                  {events.data.map((ev) => (
                    <tr key={ev.id} className="border-b border-admin-700/50 hover:bg-admin-700/30">
                      <td className="py-2 px-3 text-admin-300 whitespace-nowrap text-xs">
                        {new Date(ev.createdAt).toLocaleString()}
                      </td>
                      <td className="py-2 px-3">
                        <span className={`inline-block text-xs px-2 py-0.5 rounded-full border ${EVENT_BADGE_CLASSES[ev.event] || "bg-admin-700 text-admin-300 border-admin-600"}`}>
                          {eventLabel(ev.event)}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-white font-mono text-xs">{ev.ip}</td>
                      <td className="py-2 px-3 text-admin-300 text-xs">{ev.method}</td>
                      <td className="py-2 px-3 text-admin-300 text-xs font-mono max-w-[200px] truncate">{ev.path}</td>
                      <td className="py-2 px-3 text-admin-400 text-xs max-w-[200px] truncate">
                        {formatDetails(ev.details)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {events.pagination.totalPages > 1 && (
              <div className="flex items-center justify-between mt-4 text-sm text-admin-400">
                <span>
                  {t("common.page")} {events.pagination.page} {t("common.of")} {events.pagination.totalPages}
                </span>
                <div className="flex gap-2">
                  <button
                    disabled={page <= 1}
                    onClick={() => setPage((p) => p - 1)}
                    className="px-3 py-1 rounded bg-admin-700 hover:bg-admin-600 disabled:opacity-40"
                  >
                    {t("common.previous")}
                  </button>
                  <button
                    disabled={page >= events.pagination.totalPages}
                    onClick={() => setPage((p) => p + 1)}
                    className="px-3 py-1 rounded bg-admin-700 hover:bg-admin-600 disabled:opacity-40"
                  >
                    {t("common.next")}
                  </button>
                </div>
              </div>
            )}
          </>
        ) : (
          <p className="text-admin-400 text-sm py-4">{t("security.noEvents")}</p>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Detail Modal                                                       */
/* ------------------------------------------------------------------ */

function DetailModal({
  checkKey,
  status,
  jwt,
  onClose,
  tab,
  onTabChange,
  t,
  jwtReasonLabel,
}: {
  checkKey: StatusCheckKey;
  status: SecurityStatus;
  jwt: { level: string; reasons: string[]; length: number } | null;
  onClose: () => void;
  tab: "detail" | "info";
  onTabChange: (tab: "detail" | "info") => void;
  t: (key: string, options?: any) => string;
  jwtReasonLabel: (reason: string) => string;
}) {
  const checkStatus = getCheckStatus(checkKey, status);
  const detail = status.details?.[checkKey];
  const category = getCategory(checkKey, status);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-admin-800 border border-admin-600 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-admin-700">
          <div className="flex items-center gap-3">
            <div className={`w-3 h-3 rounded-full ${
              checkStatus === "ok" ? "bg-green-400" : checkStatus === "warn" ? "bg-yellow-400" : "bg-red-400"
            }`} />
            <h3 className="text-lg font-semibold text-white">{t(`security.${checkKey}`)}</h3>
            <span className={`text-[10px] px-2 py-0.5 rounded ${
              checkStatus === "ok" ? "bg-green-900/40 text-green-400"
              : checkStatus === "warn" ? "bg-yellow-900/40 text-yellow-400"
              : "bg-red-900/40 text-red-400"
            }`}>
              {checkStatus === "ok" ? t("security.active") : checkStatus === "warn" ? t("security.warning") : t("security.inactive")}
            </span>
          </div>
          <button onClick={onClose} className="text-admin-400 hover:text-white transition-colors p-1">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-admin-700">
          <button
            onClick={() => onTabChange("detail")}
            className={`px-6 py-3 text-sm font-medium transition-colors ${
              tab === "detail"
                ? "text-blue-400 border-b-2 border-blue-400"
                : "text-admin-400 hover:text-white"
            }`}
          >
            {t("security.modalTabDetail")}
          </button>
          <button
            onClick={() => onTabChange("info")}
            className={`px-6 py-3 text-sm font-medium transition-colors ${
              tab === "info"
                ? "text-blue-400 border-b-2 border-blue-400"
                : "text-admin-400 hover:text-white"
            }`}
          >
            {t("security.modalTabInfo")}
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {tab === "detail" ? (
            <DetailTab
              checkKey={checkKey}
              detail={detail}
              category={category}
              checkStatus={checkStatus}
              jwt={checkKey === "jwtSecret" ? jwt : null}
              t={t}
              jwtReasonLabel={jwtReasonLabel}
            />
          ) : (
            <InfoTab checkKey={checkKey} t={t} />
          )}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Detail Tab                                                         */
/* ------------------------------------------------------------------ */

function DetailTab({
  checkKey,
  detail,
  category,
  checkStatus,
  jwt,
  t,
  jwtReasonLabel,
}: {
  checkKey: StatusCheckKey;
  detail?: CheckDetail;
  category: string;
  checkStatus: "ok" | "warn" | "error";
  jwt: { level: string; reasons: string[]; length: number } | null;
  t: (key: string, options?: any) => string;
  jwtReasonLabel: (reason: string) => string;
}) {
  return (
    <>
      {/* Category */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-admin-400">{t("security.modalCategory")}:</span>
        <span className={`text-xs px-2 py-0.5 rounded ${
          category === "configurable"
            ? "bg-blue-900/30 text-blue-400 border border-blue-800"
            : category === "infrastructure"
            ? "bg-purple-900/30 text-purple-400 border border-purple-800"
            : "bg-admin-700 text-admin-400 border border-admin-600"
        }`}>
          {t(`security.category_${category}`)}
        </span>
        <span className="text-xs text-admin-500 ml-2">{t(`security.categoryDesc_${category}`)}</span>
      </div>

      {/* Code-level notice */}
      {category === "code_level" && (
        <div className="bg-admin-700/50 border border-admin-600 rounded-lg p-3 text-xs text-admin-300 flex items-start gap-2">
          <svg className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
          </svg>
          <span>{t("security.codeLevelNotice")}</span>
        </div>
      )}

      {category === "infrastructure" && (
        <div className="bg-purple-900/20 border border-purple-800 rounded-lg p-3 text-xs text-purple-300 flex items-start gap-2">
          <svg className="w-4 h-4 text-purple-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
          </svg>
          <span>{t("security.infrastructureNotice")}</span>
        </div>
      )}

      {/* Config Keys */}
      {detail?.configKeys && detail.configKeys.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-white mb-2">{t("security.modalConfigVars")}</h4>
          <div className="flex flex-wrap gap-2">
            {detail.configKeys.map((key) => (
              <code key={key} className="bg-admin-900 text-blue-300 text-xs px-2 py-1 rounded font-mono border border-admin-700">
                {key}
              </code>
            ))}
          </div>
        </div>
      )}

      {/* Current Configuration */}
      {detail?.currentConfig && (
        <div>
          <h4 className="text-sm font-medium text-white mb-2">{t("security.modalCurrentConfig")}</h4>
          <div className="bg-admin-900 border border-admin-700 rounded-lg p-3 space-y-1.5">
            {renderConfigValues(detail.currentConfig, t)}
          </div>
        </div>
      )}

      {/* JWT-specific reasons */}
      {jwt && jwt.reasons.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-white mb-2">{t("security.reasons")}</h4>
          <div className="space-y-1">
            {jwt.reasons.map((r) => (
              <div key={r} className="flex items-center gap-2 text-xs">
                <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 flex-shrink-0" />
                <span className="text-yellow-300">{jwtReasonLabel(r)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recommendations */}
      {detail?.recommendations && detail.recommendations.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-yellow-400 mb-2">{t("security.modalRecommendations")}</h4>
          <div className="space-y-2">
            {detail.recommendations.map((rec) => (
              <div key={rec} className="bg-yellow-900/15 border border-yellow-800/50 rounded-lg p-3 text-xs text-yellow-200">
                <p className="font-medium mb-1">{t(`security.rec_${rec}`)}</p>
                <p className="text-yellow-300/70">{t(`security.rec_${rec}_example`, { defaultValue: "" })}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* All OK */}
      {checkStatus === "ok" && (!detail?.recommendations || detail.recommendations.length === 0) && (
        <div className="flex items-center gap-2 bg-green-900/15 border border-green-800/50 rounded-lg p-3 text-xs text-green-300">
          <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span>{t("security.checkOk")}</span>
        </div>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Info Tab                                                           */
/* ------------------------------------------------------------------ */

function InfoTab({ checkKey, t }: { checkKey: StatusCheckKey; t: (key: string) => string }) {
  return (
    <div className="space-y-4">
      <div>
        <h4 className="text-sm font-medium text-white mb-2">{t("security.infoWhat")}</h4>
        <p className="text-sm text-admin-300 leading-relaxed">{t(`security.info_${checkKey}_what`)}</p>
      </div>
      <div>
        <h4 className="text-sm font-medium text-white mb-2">{t("security.infoWhy")}</h4>
        <p className="text-sm text-admin-300 leading-relaxed">{t(`security.info_${checkKey}_why`)}</p>
      </div>
      <div>
        <h4 className="text-sm font-medium text-white mb-2">{t("security.infoRisk")}</h4>
        <p className="text-sm text-red-300/80 leading-relaxed">{t(`security.info_${checkKey}_risk`)}</p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Config value renderer                                              */
/* ------------------------------------------------------------------ */

function renderConfigValues(config: Record<string, unknown>, t: (key: string) => string) {
  const entries = Object.entries(config);
  return entries.map(([key, value]) => {
    if (Array.isArray(value) && value.length > 0 && typeof value[0] === "object") {
      // Render array of objects (e.g., rate limiters, roles)
      return (
        <div key={key} className="space-y-1">
          <span className="text-xs text-admin-400">{t(`security.configKey_${key}`)}:</span>
          <div className="ml-3 space-y-1">
            {value.map((item, idx) => (
              <div key={idx} className="text-xs text-admin-300 font-mono bg-admin-800 rounded px-2 py-1">
                {typeof item === "object"
                  ? Object.entries(item as Record<string, unknown>).map(([k, v]) => `${k}: ${v}`).join(" | ")
                  : String(item)}
              </div>
            ))}
          </div>
        </div>
      );
    }
    if (Array.isArray(value)) {
      return (
        <div key={key} className="flex items-start gap-2 text-xs">
          <span className="text-admin-400 min-w-[120px]">{t(`security.configKey_${key}`)}:</span>
          <span className="text-white font-mono">{value.length > 0 ? value.join(", ") : <span className="text-admin-500 italic">{t("security.notSet")}</span>}</span>
        </div>
      );
    }
    return (
      <div key={key} className="flex items-center gap-2 text-xs">
        <span className="text-admin-400 min-w-[120px]">{t(`security.configKey_${key}`)}:</span>
        {typeof value === "boolean" ? (
          <span className={value ? "text-green-400" : "text-red-400"}>{value ? t("security.yes") : t("security.no")}</span>
        ) : value === null || value === undefined ? (
          <span className="text-admin-500 italic">{t("security.notSet")}</span>
        ) : (
          <span className="text-white font-mono">{String(value)}</span>
        )}
      </div>
    );
  });
}

/* ------------------------------------------------------------------ */
/*  Utility functions                                                  */
/* ------------------------------------------------------------------ */

function buildTimeline(daily: { date: string; event: string; count: number }[], days: number) {
  const lookup = new Map<string, Record<string, number>>();
  for (const d of daily) {
    if (!lookup.has(d.date)) lookup.set(d.date, {});
    lookup.get(d.date)![d.event] = d.count;
  }

  const nowMs = Date.now();
  const result: Record<string, unknown>[] = [];
  for (let i = days; i >= 0; i--) {
    const key = new Date(nowMs - i * 86_400_000).toISOString().slice(0, 10);
    const entry: Record<string, unknown> = { date: key };
    const dayData = lookup.get(key) ?? {};
    for (const type of EVENT_TYPES) {
      entry[type] = dayData[type] ?? 0;
    }
    result.push(entry);
  }
  return result;
}

function formatDetails(details: string | null): string {
  if (!details) return "-";
  try {
    const obj = JSON.parse(details);
    return Object.entries(obj)
      .map(([k, v]) => `${k}: ${v}`)
      .join(", ");
  } catch {
    return details;
  }
}

/* ------------------------------------------------------------------ */
/*  Icons                                                              */
/* ------------------------------------------------------------------ */

function ShieldIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
    </svg>
  );
}

function SpeedIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
    </svg>
  );
}

function AlertIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
    </svg>
  );
}
