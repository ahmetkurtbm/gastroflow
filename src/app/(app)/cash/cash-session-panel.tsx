"use client";

import { useActionState, useState } from "react";

import { Field, FormError, SubmitButton, Textarea, TextInput } from "@/components/ui/form";
import { closeCashSession, openCashSession, type ActionState } from "@/lib/cash/actions";
import type { CashSessionView } from "@/lib/cash/queries";

const initial: ActionState = {};

const METHOD_LABEL: Record<string, string> = {
  cash: "Nakit",
  card: "Kart",
  meal_card: "Yemek kartı",
  on_account: "Açık hesap",
};

function formatLira(value: number): string {
  return value.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " ₺";
}

function OpenSessionForm() {
  const [state, action] = useActionState(openCashSession, initial);

  return (
    <div className="rounded-xl border border-line bg-surface-raised p-5">
      <h2 className="text-sm font-semibold text-ink">Kasa oturumu aç</h2>
      <p className="mt-1 text-xs text-ink-muted">
        Vardiya başında kasadaki nakit bozukluğu gir. Kasa oturumu açılmadan ödeme alınamaz.
      </p>
      <form action={action} className="mt-3 flex items-end gap-3">
        <div className="flex-1">
          <Field label="Başlangıç bozukluğu (₺)" htmlFor="openingFloat">
            <TextInput
              id="openingFloat"
              name="openingFloat"
              type="number"
              step="0.01"
              min="0"
              defaultValue="0"
              required
            />
          </Field>
        </div>
        <SubmitButton>Oturumu aç</SubmitButton>
      </form>
      <FormError message={state.error} />
    </div>
  );
}

function TotalsBreakdown({ session }: { session: CashSessionView }) {
  if (session.totalsByMethod.length === 0) {
    return <p className="text-sm text-ink-muted">Bu oturumda henüz ödeme alınmadı.</p>;
  }
  return (
    <ul className="space-y-1">
      {session.totalsByMethod.map((t) => (
        <li key={t.method} className="flex items-center justify-between text-sm">
          <span className="text-ink-muted">{METHOD_LABEL[t.method] ?? t.method}</span>
          <span className="tabular-nums text-ink">{formatLira(t.amount)}</span>
        </li>
      ))}
      <li className="flex items-center justify-between border-t border-line pt-1 text-sm font-semibold">
        <span className="text-ink">Toplam</span>
        <span className="tabular-nums text-ink">{formatLira(session.totalPayments)}</span>
      </li>
    </ul>
  );
}

function OpenSessionView({ session }: { session: CashSessionView }) {
  const [closing, setClosing] = useState(false);
  const [state, action] = useActionState(closeCashSession, initial);
  const [countedCash, setCountedCash] = useState(session.expectedCash.toFixed(2));

  const diff = Number(countedCash || 0) - session.expectedCash;

  return (
    <div className="rounded-xl border border-line bg-surface-raised p-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-ink">Açık kasa oturumu</h2>
          <p className="mt-0.5 text-xs text-ink-muted">
            {session.openedByName} · {new Date(session.openedAt).toLocaleString("tr-TR")}
          </p>
        </div>
        {!closing ? (
          <button
            type="button"
            onClick={() => setClosing(true)}
            className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700"
          >
            Günü kapat
          </button>
        ) : null}
      </div>

      <div className="mt-3 flex items-center justify-between text-sm">
        <span className="text-ink-muted">Başlangıç bozukluğu</span>
        <span className="tabular-nums text-ink">{formatLira(session.openingFloat)}</span>
      </div>

      <div className="mt-3 border-t border-line pt-3">
        <TotalsBreakdown session={session} />
      </div>

      {closing ? (
        <form action={action} className="mt-4 space-y-3 border-t border-line pt-4">
          <input type="hidden" name="sessionId" value={session.id} />
          <p className="text-xs text-ink-muted">
            Beklenen nakit (başlangıç + nakit ödemeler): {formatLira(session.expectedCash)}
          </p>
          <Field label="Sayılan nakit (₺)" htmlFor="countedCash">
            <TextInput
              id="countedCash"
              name="countedCash"
              type="number"
              step="0.01"
              min="0"
              value={countedCash}
              onChange={(e) => setCountedCash(e.target.value)}
              required
            />
          </Field>
          {countedCash !== "" ? (
            <p
              className={`text-sm font-medium ${
                Math.abs(diff) < 0.005 ? "text-ok" : diff > 0 ? "text-warn" : "text-danger"
              }`}
            >
              Fark: {diff > 0 ? "+" : ""}
              {formatLira(diff)}
            </p>
          ) : null}
          <Field label="Not (opsiyonel)" htmlFor="note">
            <Textarea id="note" name="note" rows={2} maxLength={300} />
          </Field>
          <FormError message={state.error} />
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setClosing(false)}
              className="flex-1 rounded-lg border border-line px-4 py-2.5 text-sm font-medium text-ink hover:bg-surface-sunken"
            >
              Vazgeç
            </button>
            <div className="flex-1">
              <SubmitButton variant="danger">Kapanışı onayla</SubmitButton>
            </div>
          </div>
        </form>
      ) : null}
    </div>
  );
}

function ClosedSessionSummary({ session }: { session: CashSessionView }) {
  const diff = (session.countedCash ?? 0) - session.expectedCash;

  return (
    <div className="rounded-xl border border-line bg-surface-raised p-5">
      <h2 className="text-sm font-semibold text-ink">Son gün sonu özeti</h2>
      <p className="mt-0.5 text-xs text-ink-muted">
        {session.openedByName} · {new Date(session.openedAt).toLocaleString("tr-TR")} →{" "}
        {session.closedByName}
        {session.closedAt ? ` · ${new Date(session.closedAt).toLocaleString("tr-TR")}` : ""}
      </p>

      <div className="mt-3 border-t border-line pt-3">
        <TotalsBreakdown session={session} />
      </div>

      <div className="mt-3 space-y-1 border-t border-line pt-3 text-sm">
        <div className="flex items-center justify-between">
          <span className="text-ink-muted">Beklenen nakit</span>
          <span className="tabular-nums text-ink">{formatLira(session.expectedCash)}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-ink-muted">Sayılan nakit</span>
          <span className="tabular-nums text-ink">{formatLira(session.countedCash ?? 0)}</span>
        </div>
        <div className="flex items-center justify-between font-semibold">
          <span className="text-ink">Fark</span>
          <span
            className={`tabular-nums ${Math.abs(diff) < 0.005 ? "text-ok" : diff > 0 ? "text-warn" : "text-danger"}`}
          >
            {diff > 0 ? "+" : ""}
            {formatLira(diff)}
          </span>
        </div>
      </div>

      {session.note ? <p className="mt-3 text-sm text-ink-muted">Not: {session.note}</p> : null}
    </div>
  );
}

export function CashSessionPanel({ session }: { session: CashSessionView | null }) {
  return (
    <div className="mb-6 space-y-3">
      {session?.status === "open" ? <OpenSessionView session={session} /> : null}
      {session?.status === "closed" ? <ClosedSessionSummary session={session} /> : null}
      {session?.status !== "open" ? <OpenSessionForm /> : null}
    </div>
  );
}
