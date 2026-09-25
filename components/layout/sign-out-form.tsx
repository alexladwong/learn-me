"use client";

import { useFormStatus } from "react-dom";
import { Icon } from "@/components/ui/icon";
import { signOutAction } from "@/app/(auth)/actions";

function SignOutButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="flex min-h-[44px] w-full items-center gap-3 rounded-[var(--radius)] px-3 text-sm font-medium text-secondary transition-colors hover:bg-surface-hover hover:text-primary disabled:opacity-60"
    >
      <Icon name="logout" size={18} />
      {pending ? "Signing out…" : "Sign out"}
    </button>
  );
}

/**
 * Sign-out control.
 *
 * A form (not a link) because signing out mutates server state — it clears the
 * httpOnly session cookies, which only a Server Action can do.
 */
export function SignOutForm() {
  return (
    <form action={signOutAction}>
      <SignOutButton />
    </form>
  );
}
