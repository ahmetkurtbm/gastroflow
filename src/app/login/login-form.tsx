"use client";

import { useActionState } from "react";

import { signIn, type LoginState } from "@/lib/auth/actions";
import type { Dictionary } from "@/lib/i18n/dictionaries";

const initialState: LoginState = {};

export function LoginForm({ dict }: { dict: Dictionary["login"] }) {
  const [state, formAction, pending] = useActionState(signIn, initialState);

  return (
    <form action={formAction} className="space-y-5">
      <div className="space-y-2">
        <label
          htmlFor="email"
          className="block text-sm font-medium text-ink-muted"
        >
          {dict.email}
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          required
          autoFocus
          className="w-full rounded-lg border border-line bg-surface-raised px-3 py-2.5 text-base text-ink placeholder:text-ink-muted/60"
          placeholder="ad@restoran.com"
        />
      </div>

      <div className="space-y-2">
        <label
          htmlFor="password"
          className="block text-sm font-medium text-ink-muted"
        >
          {dict.password}
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="w-full rounded-lg border border-line bg-surface-raised px-3 py-2.5 text-base text-ink"
        />
      </div>

      {state.error ? (
        // role="alert" → ekran okuyucu hatayı anında seslendirir.
        <p
          role="alert"
          className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2.5 text-sm text-danger"
        >
          {state.error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-brand-600 px-4 py-3 text-base font-semibold text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? dict.submitting : dict.submit}
      </button>
    </form>
  );
}
