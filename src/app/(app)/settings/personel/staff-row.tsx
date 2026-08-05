"use client";

import { useTransition } from "react";

import { APP_ROLES, ROLE_LABEL, type AppRole } from "@/lib/auth/access";
import {
  changeStaffRole,
  deactivateStaffMember,
  reactivateStaffMember,
} from "@/lib/staff/actions";
import type { StaffMember } from "@/lib/staff/queries";

export function StaffRow({ member, isSelf }: { member: StaffMember; isSelf: boolean }) {
  const [pending, startTransition] = useTransition();

  return (
    <li className={`flex flex-wrap items-center justify-between gap-3 px-4 py-3 ${!member.isActive ? "opacity-50" : ""}`}>
      <div className="min-w-0">
        <p className="text-sm font-medium text-ink">
          {member.fullName}
          {isSelf ? <span className="ml-1.5 text-xs text-ink-muted">(sen)</span> : null}
          {!member.isActive ? <span className="ml-1.5 text-xs text-danger">Pasif</span> : null}
        </p>
        <p className="truncate text-xs text-ink-muted">
          {member.email}
          {member.branchName ? ` · ${member.branchName}` : ""}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <form
          action={(fd) => startTransition(() => changeStaffRole(fd))}
          className="contents"
        >
          <input type="hidden" name="id" value={member.id} />
          <select
            name="role"
            defaultValue={member.role}
            disabled={isSelf || pending}
            onChange={(e) => e.currentTarget.form?.requestSubmit()}
            className="rounded-lg border border-line bg-surface px-2 py-1.5 text-xs text-ink disabled:opacity-60"
          >
            {APP_ROLES.map((role: AppRole) => (
              <option key={role} value={role}>
                {ROLE_LABEL[role]}
              </option>
            ))}
          </select>
        </form>

        {!isSelf ? (
          <form
            action={(fd) =>
              startTransition(() =>
                member.isActive ? deactivateStaffMember(fd) : reactivateStaffMember(fd),
              )
            }
          >
            <input type="hidden" name="id" value={member.id} />
            <button
              type="submit"
              disabled={pending}
              className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium disabled:opacity-60 ${
                member.isActive
                  ? "border-danger/40 text-danger hover:bg-danger/10"
                  : "border-line text-ink hover:bg-surface-sunken"
              }`}
            >
              {member.isActive ? "Pasif et" : "Aktive et"}
            </button>
          </form>
        ) : null}
      </div>
    </li>
  );
}
