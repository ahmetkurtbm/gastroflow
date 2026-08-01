"use client";

import { useState, useTransition } from "react";

import { processNotificationQueue } from "@/lib/notifications/actions";

export function QueuePanel() {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  function run() {
    setMessage(null);
    startTransition(async () => {
      const result = await processNotificationQueue();
      if (result.error) {
        setMessage(`Hata: ${result.error}`);
      } else {
        setMessage(`${result.processed ?? 0} olay işlendi.`);
      }
    });
  }

  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={run}
        disabled={pending}
        className="rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending ? "İşleniyor…" : "Kuyruğu şimdi işle"}
      </button>
      {message ? <span className="text-sm text-ink-muted">{message}</span> : null}
    </div>
  );
}
