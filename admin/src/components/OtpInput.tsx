import { useRef, KeyboardEvent, ClipboardEvent } from "react";

interface OtpInputProps {
  onComplete: (code: string) => void;
  disabled?: boolean;
}

export default function OtpInput({ onComplete, disabled }: OtpInputProps) {
  const inputs = useRef<(HTMLInputElement | null)[]>([]);

  const handleInput = (index: number, value: string) => {
    const digit = value.replace(/\D/g, "").slice(-1);
    if (inputs.current[index]) inputs.current[index]!.value = digit;

    if (digit && index < 5) {
      inputs.current[index + 1]?.focus();
    }

    const code = inputs.current.map((i) => i?.value || "").join("");
    if (code.length === 6 && /^\d{6}$/.test(code)) {
      onComplete(code);
    }
  };

  const handleKeyDown = (index: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !inputs.current[index]?.value && index > 0) {
      inputs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e: ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    pasted.split("").forEach((digit, i) => {
      if (inputs.current[i]) inputs.current[i]!.value = digit;
    });
    if (pasted.length === 6) {
      onComplete(pasted);
    } else {
      inputs.current[Math.min(pasted.length, 5)]?.focus();
    }
  };

  return (
    <div className="flex gap-3 justify-center">
      {Array.from({ length: 6 }).map((_, i) => (
        <input
          key={i}
          ref={(el) => { inputs.current[i] = el; }}
          type="text"
          inputMode="numeric"
          maxLength={1}
          disabled={disabled}
          className="w-12 h-14 text-center text-2xl font-mono bg-admin-800 border border-admin-600 rounded-lg text-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none disabled:opacity-50 transition-colors"
          onInput={(e) => handleInput(i, (e.target as HTMLInputElement).value)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          onPaste={i === 0 ? handlePaste : undefined}
        />
      ))}
    </div>
  );
}
