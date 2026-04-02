import { useCallback, useState, useRef } from "react";
import { useTranslation } from "react-i18next";

interface Props {
  onFiles: (files: File[]) => void;
  disabled?: boolean;
}

export default function FileDropzone({ onFiles, disabled }: Props) {
  const { t } = useTranslation();
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      if (disabled) return;

      const items = e.dataTransfer.items;
      const files: File[] = [];

      for (let i = 0; i < items.length; i++) {
        const file = items[i].getAsFile();
        if (file) files.push(file);
      }

      if (files.length > 0) onFiles(files);
    },
    [onFiles, disabled],
  );

  const handleSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const fileList = e.target.files;
      if (!fileList || disabled) return;
      onFiles(Array.from(fileList));
      e.target.value = "";
    },
    [onFiles, disabled],
  );

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
      className={`
        border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-all
        ${dragOver ? "border-brand-500 bg-brand-50" : "border-gray-300 hover:border-brand-400 hover:bg-gray-50"}
        ${disabled ? "opacity-50 cursor-not-allowed" : ""}
      `}
    >
      <input
        ref={inputRef}
        type="file"
        multiple
        className="hidden"
        onChange={handleSelect}
        disabled={disabled}
      />
      <div className="flex flex-col items-center gap-3">
        <svg
          className="w-12 h-12 text-gray-400"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M12 16V4m0 0L8 8m4-4l4 4M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2"
          />
        </svg>
        <p className="text-gray-600 font-medium">
          {t("dropzone.dragOrClick")}
        </p>
        <p className="text-sm text-gray-400">
          {t("dropzone.allTypes")}
        </p>
      </div>
    </div>
  );
}
