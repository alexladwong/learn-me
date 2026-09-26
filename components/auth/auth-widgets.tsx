"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { startOAuthAction, type AuthFormState } from "@/app/(auth)/actions";
import { FormError } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";

const initialState: AuthFormState = { error: null };

/**
 * Google sign-in.
 *
 * Rendered as its own form so the OAuth start action gets its own pending state
 * and the learner can see which button is working.
 */
export function GoogleButton({ label }: { label: string }) {
  const [state, formAction] = useActionState(async () => startOAuthAction(), initialState);
  const [nativeError, setNativeError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  /*
   * Only the *start* of the flow differs between web and native; the button, its
   * label, its pending state and its error slot are shared. Google refuses OAuth
   * inside a WebView, so the shell hands off to the system browser and comes back
   * through `learnme://auth/callback` — everything after that is the same app.
   */
  async function onClick(event: React.MouseEvent<HTMLButtonElement>) {
    const { isNativeShell, beginNativeSignIn } = await import("@/lib/auth/native-client");
    if (!(await isNativeShell())) return; // fall through to the form action

    event.preventDefault();
    setNativeError(null);
    setStarting(true);
    try {
      const result = await beginNativeSignIn();
      if ("error" in result) setNativeError(result.error);
      // On success the system browser has taken over; the deep link resumes us.
    } catch {
      setNativeError("Could not open the sign-in page.");
    } finally {
      setStarting(false);
    }
  }

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <FormError message={nativeError ?? state.error} />
      <span onClick={onClick} className="contents">
        <SubmitButton
          variant="secondary"
          fullWidth
          pendingLabel={starting ? "Opening…" : "Redirecting…"}
        >
          <GoogleMark />
          {label}
        </SubmitButton>
      </span>
    </form>
  );
}

export function GoogleMark() {
  return (
    <svg width="16" height="16" viewBox="0 0 18 18" aria-hidden="true" focusable="false">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18Z"
      />
      <path
        fill="#FBBC05"
        d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33Z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.46 3.44 1.35l2.58-2.58C13.46.9 11.42 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58Z"
      />
    </svg>
  );
}

/** A divider with a centred label, used between OAuth and password sign-in. */
export function OrDivider({ label = "or" }: { label?: string }) {
  return (
    <div className="flex items-center gap-3" role="separator" aria-label={label}>
      <span className="h-px flex-1 bg-[var(--border)]" />
      <span className="text-xs font-medium uppercase tracking-wide text-muted">{label}</span>
      <span className="h-px flex-1 bg-[var(--border)]" />
    </div>
  );
}

/** Small helper so both auth pages render a consistent "back" affordance. */
export function AuthFooterLink({ text, href, cta }: { text: string; href: string; cta: string }) {
  return (
    <p className="text-center text-sm text-secondary">
      {text}{" "}
      <Link href={href} className="font-medium text-accent underline-offset-2 hover:underline">
        {cta}
      </Link>
    </p>
  );
}
