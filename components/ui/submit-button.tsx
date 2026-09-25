"use client";

import { useFormStatus } from "react-dom";
import { Button, type ButtonSize, type ButtonVariant } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";

/**
 * Submit button that reflects the enclosing `<form>`'s pending state.
 *
 * Must be a client component: `useFormStatus` only reports the status of the
 * nearest parent form, so it has to render inside that form on the client.
 */
export function SubmitButton({
  children,
  pendingLabel,
  variant = "primary",
  size = "md",
  fullWidth = false,
  className,
  formAction,
}: {
  children: React.ReactNode;
  pendingLabel?: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  className?: string;
  /**
   * Override the enclosing form's action for this button only.
   *
   * Needed for the onboarding wizard, where "Continue" and "Create my plan"
   * submit the same form to different actions.
   */
  formAction?: (formData: FormData) => void | Promise<void>;
}) {
  const { pending } = useFormStatus();

  return (
    <Button
      type="submit"
      variant={variant}
      size={size}
      fullWidth={fullWidth}
      disabled={pending}
      aria-busy={pending}
      className={className}
      formAction={formAction}
    >
      {pending ? (
        <>
          <span
            aria-hidden="true"
            className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent"
          />
          {pendingLabel ?? "Working…"}
        </>
      ) : (
        <>
          {children}
          <Icon name="arrowRight" size={16} />
        </>
      )}
    </Button>
  );
}
