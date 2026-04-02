interface FileEntry {
  name: string;
  size: number;
}

interface Props {
  files: FileEntry[];
  onRemove?: (index: number) => void;
  removable?: boolean;
}

function formatSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

export default function FileList({ files, onRemove, removable }: Props) {
  if (files.length === 0) return null;

  return (
    <div className="border border-gray-200 rounded-lg divide-y divide-gray-100">
      {files.map((file, i) => (
        <div
          key={i}
          className="flex items-center justify-between px-4 py-3 hover:bg-gray-50"
        >
          <div className="flex items-center gap-3 min-w-0">
            <svg
              className="w-5 h-5 text-gray-400 flex-shrink-0"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
            <span className="truncate text-sm text-gray-700">{file.name}</span>
          </div>
          <div className="flex items-center gap-3 flex-shrink-0 ml-4">
            <span className="text-xs text-gray-400">
              {formatSize(file.size)}
            </span>
            {removable && onRemove && (
              <button
                onClick={() => onRemove(i)}
                className="text-gray-400 hover:text-red-500 transition"
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
