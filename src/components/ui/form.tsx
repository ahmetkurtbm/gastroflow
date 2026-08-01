"use client";

import { useFormStatus } from "react-dom";

/**
 * Form yapı taşları.
 *
 * Ayrı bileşen olmalarının sebebi tutarlılık değil, erişilebilirlik: her
 * alanın etiketiyle bağlı olması ve her hatanın `role="alert"` taşıması
 * elle yazıldığında er ya da geç unutuluyor.
 */

const inputClass =
  "w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-muted/60 disabled:opacity-60";

export function Field({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-xs font-medium text-ink-muted">
        {label}
      </label>
      {children}
      {hint ? <p className="text-xs text-ink-muted">{hint}</p> : null}
    </div>
  );
}

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={inputClass} />;
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={inputClass} />;
}

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={inputClass} />;
}

export function FormError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p
      role="alert"
      className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger"
    >
      {message}
    </p>
  );
}

export function SubmitButton({
  children,
  variant = "primary",
}: {
  children: React.ReactNode;
  variant?: "primary" | "secondary" | "danger";
}) {
  // useFormStatus, çift gönderimi engellemek için formun kendi durumunu okur.
  const { pending } = useFormStatus();

  const styles = {
    primary: "bg-brand-600 text-white hover:bg-brand-700",
    secondary: "border border-line text-ink hover:bg-surface-sunken",
    danger: "border border-danger/40 text-danger hover:bg-danger/10",
  }[variant];

  return (
    <button
      type="submit"
      disabled={pending}
      className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${styles}`}
    >
      {pending ? "…" : children}
    </button>
  );
}
