import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "../hooks/useAuth";

export default function HomePage() {
  const navigate = useNavigate();
  const { token } = useAuth();
  const { t } = useTranslation();

  const handleUpload = () => {
    navigate(token ? "/upload" : "/auth");
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-8">
      <div className="text-center space-y-4">
        <h1 className="text-5xl font-bold text-gray-900">{import.meta.env.VITE_COMPANY_NAME || "FileDrop"}</h1>
        <p className="text-xl text-gray-500 max-w-lg">
          {t("home.subtitle")}
        </p>
      </div>

      <button
        onClick={handleUpload}
        className="bg-brand-600 hover:bg-brand-700 text-white font-semibold px-8 py-4 rounded-xl
          text-lg shadow-lg shadow-brand-600/25 hover:shadow-brand-600/40
          transition-all duration-200 active:scale-95"
      >
        {t("home.uploadBtn")}
      </button>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-8 max-w-3xl">
        <FeatureCard
          title={t("home.featureEncryption")}
          description={t("home.featureEncryptionDesc")}
        />
        <FeatureCard
          title={t("home.featureLinks")}
          description={t("home.featureLinksDesc")}
        />
        <FeatureCard
          title={t("home.featureBidirectional")}
          description={t("home.featureBidirectionalDesc")}
        />
      </div>
    </div>
  );
}

function FeatureCard({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
      <h3 className="font-semibold text-gray-900 mb-2">{title}</h3>
      <p className="text-sm text-gray-500">{description}</p>
    </div>
  );
}
