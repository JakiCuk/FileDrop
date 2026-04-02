import { ReactNode } from "react";

interface StatsCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon?: ReactNode;
  trend?: "up" | "down" | "neutral";
}

export default function StatsCard({ title, value, subtitle, icon, trend }: StatsCardProps) {
  return (
    <div className="bg-admin-800 border border-admin-700 rounded-xl p-5 hover:border-admin-600 transition-colors">
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-admin-400">{title}</p>
          <p className="text-2xl font-bold text-white mt-1">{value}</p>
          {subtitle && (
            <p
              className={`text-sm mt-1 ${
                trend === "up"
                  ? "text-green-400"
                  : trend === "down"
                  ? "text-red-400"
                  : "text-admin-400"
              }`}
            >
              {subtitle}
            </p>
          )}
        </div>
        {icon && (
          <div className="flex-shrink-0 ml-3 p-2.5 bg-admin-700 rounded-lg text-admin-300">
            {icon}
          </div>
        )}
      </div>
    </div>
  );
}
