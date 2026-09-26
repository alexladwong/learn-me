"use client";

import { Icon } from "@/components/ui/icon";
import { useSignOut } from "@/lib/auth/sign-out-client";

/**
 * Sign-out control for the settings Account pane.
 *
 * A button rather than a `<form action={…}>`: the shared `useSignOut` hook owns
 * the flow so a stalled request cannot leave this stuck on "Signing out…". See
 * that module for why.
 */
export function SignOutForm() {
  const { signOut, pending, error } = useSignOut();

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={() => void signOut()}
        disabled={false}
        aria-busy={pending}
        className="press flex min-h-[44px] w-full items-center justify-center gap-3 rounded-[var(--radius)] px-3 text-sm font-medium text-secondary hover:bg-surface-hover hover:text-primary"
      >
        <Icon name="logout" size={18} />
        {/* Hidden at rail width, where an icon plus a label does not fit. */}
        <span className="rail-only-expanded">
          {pending ? "Signing out…" : "Sign out"}
        </span>
      </button>

      {error ? (
        <p role="alert" className="text-xs font-medium text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
