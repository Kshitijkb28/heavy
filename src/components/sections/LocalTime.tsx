"use client";

import { useLocalTime } from "@/hooks/useLocalTime";

/** Live wall-clock time in a zone ("14:32 IST"); renders nothing on the server and until the first client paint. */
export function LocalTime({ timeZone, className }: { timeZone: string; className?: string }) {
  const text = useLocalTime(timeZone);
  if (!text) return null;
  return (
    <time className={className} dateTime={text.slice(0, 5)}>
      {text}
    </time>
  );
}
