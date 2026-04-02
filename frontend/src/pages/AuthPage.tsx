import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "../hooks/useAuth";
import { api, ApiError } from "../services/api";
import OtpInput from "../components/OtpInput";

const EMAIL_LOCALES = ["en", "cs", "sk", "uk"] as const;
function getEmailLocale(lang: string): string {
  const base = lang?.split("-")[0] || "en";
  return EMAIL_LOCALES.includes(base as (typeof EMAIL_LOCALES)[number]) ? base : "en";
}
/** i18next stored language (from detector), fallback if i18n.language lags */
function getLocaleForEmail(i18n: { language: string }): string {
  const stored = typeof localStorage !== "undefined" ? localStorage.getItem("i18nextLng") : null;
  return getEmailLocale(i18n.language || stored || "en");
}

export default function AuthPage() {
  const navigate = useNavigate();
  const { login, token } = useAuth();
  const { t, i18n } = useTranslation();
  const [step, setStep] = useState<"email" | "otp">("email");
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  if (token) {
    navigate("/upload", { replace: true });
    return null;
  }

  const handleRequestOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await api.post("/api/auth/request-otp", {
        email,
        locale: getLocaleForEmail(i18n),
      });
      setStep("otp");
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : t("auth.sendFailed"),
      );
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (code: string) => {
    setError("");
    setLoading(true);
    try {
      const res = await api.post<{
        token: string;
        user: { id: string; email: string };
      }>("/api/auth/verify-otp", { email, code });
      login(res.token, res.user);
      navigate("/upload", { replace: true });
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : t("auth.invalidCode"),
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh]">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 w-full max-w-md">
        <h2 className="text-2xl font-bold text-gray-900 text-center mb-6">
          {step === "email" ? t("auth.loginTitle") : t("auth.otpTitle")}
        </h2>

        {step === "email" ? (
          <form onSubmit={handleRequestOtp} className="space-y-4">
            <div>
              <label
                htmlFor="email"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                {t("auth.emailLabel")}
              </label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t("auth.emailPlaceholder")}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg
                  focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500
                  transition"
              />
            </div>

            {error && (
              <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-brand-600 hover:bg-brand-700 text-white font-semibold
                py-3 rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? t("auth.sending") : t("auth.sendOtp")}
            </button>
          </form>
        ) : (
          <div className="space-y-6">
            <p className="text-center text-sm text-gray-500">
              {t("auth.otpSentTo")}{" "}
              <strong className="text-gray-700">{email}</strong>
            </p>

            <OtpInput onComplete={handleVerifyOtp} disabled={loading} />

            {error && (
              <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg text-center">
                {error}
              </p>
            )}

            <button
              onClick={() => {
                setStep("email");
                setError("");
              }}
              className="w-full text-sm text-gray-500 hover:text-gray-700 transition"
            >
              {t("auth.changeEmail")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
