"use client";

import { useActionState, useState } from "react";

import { Field, FormError, Select, SubmitButton, TextInput } from "@/components/ui/form";
import { APP_ROLES, ROLE_LABEL } from "@/lib/auth/access";
import { addStaffMember, type AddStaffState } from "@/lib/staff/actions";

const initial: AddStaffState = {};

export function AddStaffForm({ branches }: { branches: { id: string; name: string }[] }) {
  const [state, action] = useActionState(addStaffMember, initial);
  // Şifre yalnızca bir kez, oluşturma anında dönüyor (bkz. addStaffMember) —
  // sayfa yenilenince bir daha görünmez, bu yüzden ekranda tutup
  // "kaydettin mi?" diye açıkça uyarıyoruz.
  const [dismissedFor, setDismissedFor] = useState<string | null>(null);

  if (state.created && state.created.email !== dismissedFor) {
    return (
      <div className="space-y-3 rounded-lg border border-ok/30 bg-ok/10 p-4">
        <p className="text-sm font-medium text-ink">
          {state.created.email} için hesap oluşturuldu. Bu şifre YALNIZCA ŞİMDİ görünüyor —
          kaydet ve personele ilet:
        </p>
        <p className="rounded-lg bg-surface px-3 py-2 font-mono text-sm text-ink select-all">
          {state.created.password}
        </p>
        <button
          type="button"
          onClick={() => setDismissedFor(state.created!.email)}
          className="text-xs font-medium text-ink-muted underline-offset-2 hover:underline"
        >
          Kaydettim, kapat
        </button>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-3 p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Ad soyad" htmlFor="fullName">
          <TextInput id="fullName" name="fullName" required maxLength={120} />
        </Field>
        <Field label="E-posta" htmlFor="email">
          <TextInput id="email" name="email" type="email" required />
        </Field>
        <Field label="Rol" htmlFor="role">
          <Select id="role" name="role" defaultValue="waiter">
            {APP_ROLES.map((role) => (
              <option key={role} value={role}>
                {ROLE_LABEL[role]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Şube" htmlFor="branchId">
          <Select id="branchId" name="branchId" defaultValue={branches[0]?.id ?? ""}>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <FormError message={state.error} />
      <SubmitButton>Personel ekle</SubmitButton>
    </form>
  );
}
