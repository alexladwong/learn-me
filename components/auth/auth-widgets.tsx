"use client";

import { useActionState, useEffect, useState } from "react";
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
   * Whether we are inside the Capacitor shell.
   *
   * Resolved in an effect, never during render: the server has no bridge, so a
   * render-time check would produce different markup on the server and the first
   * client render. Starting at `false` keeps the first paint identical and lets
   * hydration complete before anything changes.
   */
  const [isNative, setIsNative] = useState(false);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { isNativeShell } = await import("@/lib/auth/native-client");
      const native = await isNativeShell();
      if (!cancelled) setIsNative(native);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * The native flow.
   *
   * This used to be wired to the submit button's `onClick`, which was async and
   * called `preventDefault()` only after awaiting the platform check. By then the
   * event had already finished dispatching and the form had submitted, so the
   * WebView navigated to Google instead — and Google refuses OAuth inside an
   * embedded WebView. The native path was effectively never taken.
   *
   * Rendering a real `type="button"` removes the race entirely: there is no form
   * submission to prevent.
   */
  async function startNative() {
    setNativeError(null);
    setStarting(true);
    try {
      const { beginNativeSignIn } = await import("@/lib/auth/native-client");
      const result = await beginNativeSignIn();
      if ("error" in result) setNativeError(result.error);
      // On success the system browser owns the screen; `learnme://auth/callback`
      // brings the learner back and `NativeShell` finishes the exchange.
    } catch {
      setNativeError("Could not open the sign-in page.");
    } finally {
      setStarting(false);
    }
  }

  if (isNative) {
    return (
      <div className="flex flex-col gap-3">
        <FormError message={nativeError} />
        <button
          type="button"
          onClick={() => void startNative()}
          disabled={starting}
          className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-[var(--radius)] border border-line-strong bg-surface-raised px-4 text-sm font-medium text-primary transition-colors hover:bg-surface-hover disabled:opacity-60"
        >
          <GoogleMark />
          {starting ? "Opening Google…" : label}
        </button>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <FormError message={state.error} />
      <SubmitButton variant="secondary" fullWidth pendingLabel="Redirecting…">
        <GoogleMark />
        {label}
      </SubmitButton>
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
