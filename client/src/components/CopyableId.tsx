/**
 * CopyableId — Click-to-copy ID component with visual feedback.
 * Shows a copy icon on hover, and a checkmark after copying.
 */

import { useState, useCallback } from "react";
import { Copy, Check } from "lucide-react";
import { toast } from "sonner";

interface CopyableIdProps {
  label?: string;
  value: string;
  className?: string;
  mono?: boolean;
}

export default function CopyableId({ label, value, className = "", mono = true }: CopyableIdProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      toast.success(`已複製: ${value}`, { duration: 1500 });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for older browsers
      const textarea = document.createElement("textarea");
      textarea.value = value;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      setCopied(true);
      toast.success(`已複製: ${value}`, { duration: 1500 });
      setTimeout(() => setCopied(false), 2000);
    }
  }, [value]);

  return (
    <button
      onClick={handleCopy}
      className={`
        inline-flex items-center gap-1.5 group
        px-1.5 py-0.5 -mx-1.5 rounded-md
        hover:bg-accent transition-colors duration-150
        text-left
        ${className}
      `}
      title={`點擊複製: ${value}`}
    >
      {label && (
        <span className="text-[10px] text-muted-foreground tracking-wider shrink-0">
          {label}:
        </span>
      )}
      <span className={`text-sm truncate ${mono ? "font-mono text-xs" : ""}`}>
        {value}
      </span>
      {copied ? (
        <Check className="w-3 h-3 text-emerald shrink-0" />
      ) : (
        <Copy className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
      )}
    </button>
  );
}
