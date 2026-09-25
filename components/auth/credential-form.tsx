"use client";

import { useActionState } from "react";
import { Field, FormError, TextInput } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import type { AuthFormState } from "@/app/(auth)/actions";

type AuthAction = (
  state: AuthFormState,
  formData: FormData,
) => Promise<AuthFormState>;

const initialState: AuthFormState = { error: null };

/**
 * Email + password form for both sign-in and sign-up.
 *
 * A single component because the fields differ by one input and the pending /
 * error handling must behave identically. The server action does the real
 * validation; the browser's own `type`/`required` attributes are a convenience,
 * never the guard.
 */
export function CredentialForm({
  action,
  mode,
  next,
}: {
  action: AuthAction;
  mode: "sign-in" | "sign-up";
  next?: string;
}) {
  const [state, formAction] = useActionState(action, initialState);
  const isSignUp = mode === "sign-up";

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {next ? <input type="hidden" name="next" value={next} /> : null}

      <FormError message={state.error} />

      {isSignUp ? (
        <Field label="Your name" htmlFor="name" hint="Used for your greeting. Optional.">
          <TextInput
            id="name"
            name="name"
            type="text"
            autoComplete="name"
            placeholder="Alex"
          />
        </Field>
      ) : null}

      <Field label="Email" htmlFor="email" required>
        <TextInput
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          inputMode="email"
          placeholder="you@example.com"
        />
      </Field>

      <Field
        label="Password"
        htmlFor="password"
        required
        hint={isSignUp ? "At least 8 characters." : undefined}
      >
        <TextInput
          id="password"
          name="password"
          type="password"
          required
          minLength={isSignUp ? 8 : undefined}
          autoComplete={isSignUp ? "new-password" : "current-password"}
          placeholder="••••••••"
        />
      </Field>

      <SubmitButton fullWidth pendingLabel={isSignUp ? "Creating your account…" : "Signing in…"}>
        {isSignUp ? "Create account" : "Sign in"}
      </SubmitButton>
    </form>
  );
}
