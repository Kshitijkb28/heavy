"use client";

import { useState } from "react";
import { useUI } from "@/store/ui";

/** Polite status at the bottom centre ("Email copied"): always mounted for aria-live; keeps the last text while it fades out. */
export function Toast() {
  const toast = useUI((s) => s.toast);
  const [last, setLast] = useState<string | null>(null);
  if (toast !== null && toast !== last) setLast(toast);
  return (
    <div role="status" aria-live="polite" aria-atomic="true" className="toast" data-visible={toast ? "true" : undefined}>
      {toast ?? last}
    </div>
  );
}
