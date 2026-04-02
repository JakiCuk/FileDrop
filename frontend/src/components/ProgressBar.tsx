interface Props {
  percent: number;
  label?: string;
}

export default function ProgressBar({ percent, label }: Props) {
  const clamped = Math.min(100, Math.max(0, percent));

  return (
    <div className="w-full">
      {label && (
        <div className="flex justify-between items-center mb-1">
          <span className="text-sm text-gray-600 truncate">{label}</span>
          <span className="text-sm text-gray-500 font-mono">
            {Math.round(clamped)}%
          </span>
        </div>
      )}
      <div className="w-full bg-gray-200 rounded-full h-2.5 overflow-hidden">
        <div
          className="bg-brand-600 h-full rounded-full transition-all duration-300 ease-out"
          style={{ width: `${clamped}%` }}
        />
      </div>
    </div>
  );
}
