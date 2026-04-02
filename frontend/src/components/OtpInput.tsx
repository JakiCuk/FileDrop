import { useState, useRef, useCallback } from "react";

interface Props {
  length?: number;
  onComplete: (code: string) => void;
  disabled?: boolean;
}

export default function OtpInput({ length = 6, onComplete, disabled }: Props) {
  const [values, setValues] = useState<string[]>(Array(length).fill(""));
  const refs = useRef<(HTMLInputElement | null)[]>([]);

  const handleChange = useCallback(
    (index: number, value: string) => {
      if (!/^\d*$/.test(value)) return;

      const newValues = [...values];
      newValues[index] = value.slice(-1);
      setValues(newValues);

      if (value && index < length - 1) {
        refs.current[index + 1]?.focus();
      }

      const code = newValues.join("");
      if (code.length === length) {
        onComplete(code);
      }
    },
    [values, length, onComplete],
  );

  const handleKeyDown = useCallback(
    (index: number, e: React.KeyboardEvent) => {
      if (e.key === "Backspace" && !values[index] && index > 0) {
        refs.current[index - 1]?.focus();
      }
    },
    [values],
  );

  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => {
      e.preventDefault();
      const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, length);
      if (!pasted) return;

      const newValues = [...values];
      for (let i = 0; i < pasted.length; i++) {
        newValues[i] = pasted[i];
      }
      setValues(newValues);

      const nextEmpty = pasted.length < length ? pasted.length : length - 1;
      refs.current[nextEmpty]?.focus();

      if (pasted.length === length) {
        onComplete(pasted);
      }
    },
    [values, length, onComplete],
  );

  return (
    <div className="flex gap-2 justify-center" onPaste={handlePaste}>
      {values.map((val, i) => (
        <input
          key={i}
          ref={(el) => { refs.current[i] = el; }}
          type="text"
          inputMode="numeric"
          maxLength={1}
          value={val}
          onChange={(e) => handleChange(i, e.target.value)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          disabled={disabled}
          className="w-12 h-14 text-center text-2xl font-mono border border-gray-300 rounded-lg
            focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500
            disabled:bg-gray-100 disabled:cursor-not-allowed transition"
        />
      ))}
    </div>
  );
}
