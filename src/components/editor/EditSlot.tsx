"use client";

import type { ReactNode } from "react";
import { useEditor } from "@/store/editor";
import { getPreview, type SlotId } from "./slots";

/**
 * One section of the page. Renders the server section untouched (no extra DOM) until the editor is open; then the same
 * section rendered from the draft, so every keystroke shows in place. Only `id` crosses the server → client boundary.
 */
export function EditSlot({ id, children }: { id: SlotId; children: ReactNode }) {
  const view = useEditor((s) => (s.active ? s.view : null));
  const render = getPreview();
  if (!view || !render) return children;
  return render(id, view);
}
