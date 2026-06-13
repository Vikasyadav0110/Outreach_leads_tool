"use client";

import { useState } from "react";

export default function CopyButton({ text, label = "Copy", className = "" }) {
  const [copied, setCopied] = useState(false);

  async function onCopy() {
    try {
      await navigator.clipboard.writeText(text || "");
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard can fail on insecure origins; fall back to a temp textarea.
      const ta = document.createElement("textarea");
      ta.value = text || "";
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      } catch {
        /* give up silently */
      }
      document.body.removeChild(ta);
    }
  }

  return (
    <button
      type="button"
      onClick={onCopy}
      className={`btn-ghost px-2.5 py-1 text-xs ${className}`}
    >
      {copied ? "Copied" : label}
    </button>
  );
}
