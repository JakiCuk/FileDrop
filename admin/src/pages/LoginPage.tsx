import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAdminAuth } from "../hooks/useAdminAuth";
import { api, ApiError } from "../services/api";
import OtpInput from "../components/OtpInput";

export default function LoginPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { token, login } = useAdminAuth();
  const [step, setStep] = useState<"email" | "otp">("email");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  if (token) {
    navigate("/", { replace: true });
    return null;
  }

  const handleRequestOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await api.post("/api/auth/request-otp", { email });
      setInfo(t("login.otpSent"));
      setStep("otp");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("login.error"));
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (code: string) => {
    setError("");
    setLoading(true);
    try {
      const { token: jwt, user } = await api.post("/api/auth/verify-otp", { email, code });
      api.setToken(jwt);

      try {
        const adminInfo = await api.get("/api/admin/me");
        login(jwt, user, adminInfo.role);
        navigate("/", { replace: true });
      } catch (err) {
        api.setToken(null);
        if (err instanceof ApiError && err.status === 403) {
          setError(t("login.notAdmin"));
        } else {
          setError(t("login.error"));
        }
        setStep("email");
      }
    } catch (err) {
      if (err instanceof ApiError) {
        setError(t("login.invalidOtp"));
      } else {
        setError(t("login.error"));
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-admin-900 px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-600 rounded-2xl mb-4">
            <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-white">{t("app.title")}</h1>
          <p className="text-admin-400 mt-2">
            {step === "email" ? t("login.subtitle") : t("login.otpTitle")}
          </p>
        </div>

        <div className="bg-admin-800 rounded-2xl p-8 border border-admin-700 shadow-xl">
          {error && (
            <div className="mb-4 p-3 bg-red-900/50 border border-red-700 rounded-lg text-red-300 text-sm">
              {error}
            </div>
          )}
          {info && !error && (
            <div className="mb-4 p-3 bg-blue-900/50 border border-blue-700 rounded-lg text-blue-300 text-sm">
              {info}
            </div>
          )}

          {step === "email" ? (
            <form onSubmit={handleRequestOtp}>
              <label className="block text-sm font-medium text-admin-300 mb-2">
                {t("login.emailLabel")}
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t("login.emailPlaceholder")}
                required
                className="w-full px-4 py-3 bg-admin-700 border border-admin-600 rounded-lg text-white placeholder-admin-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-colors"
              />
              <button
                type="submit"
                disabled={loading || !email}
                className="w-full mt-4 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-admin-600 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors"
              >
                {loading ? t("login.sending") : t("login.sendOtp")}
              </button>
            </form>
          ) : (
            <div>
              <p className="text-sm text-admin-400 text-center mb-6">
                {t("login.otpSubtitle", { email })}
              </p>
              <OtpInput onComplete={handleVerifyOtp} disabled={loading} />
              {loading && (
                <p className="text-center text-admin-400 text-sm mt-4">{t("login.verifying")}</p>
              )}
              <button
                onClick={() => { setStep("email"); setError(""); setInfo(""); }}
                className="w-full mt-6 py-2 text-admin-400 hover:text-white text-sm transition-colors"
              >
                {t("login.backToEmail")}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
