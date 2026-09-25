import type {
  ChangeEventHandler,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";
import { cx } from "@/lib/cx";
import { Icon } from "@/components/ui/icon";

const controlBase =
  "w-full rounded-[var(--radius)] border border-line-strong bg-surface-raised " +
  "px-3.5 text-primary placeholder:text-muted " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)] " +
  "disabled:opacity-60";

const controlHeight = "h-11";

export function Field({
  label,
  htmlFor,
  hint,
  error,
  required,
  children,
  className,
}: {
  label: string;
  htmlFor?: string;
  hint?: ReactNode;
  error?: string | null;
  required?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx("flex flex-col gap-1.5", className)}>
      <label htmlFor={htmlFor} className="text-sm font-medium text-primary">
        {label}
        {required ? (
          <span className="ml-0.5 text-danger" aria-hidden="true">
            *
          </span>
        ) : null}
      </label>
      {hint ? <p className="text-xs text-secondary">{hint}</p> : null}
      {children}
      {error ? (
        <p className="flex items-center gap-1.5 text-xs font-medium text-danger">
          <Icon name="inbox" size={14} />
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function TextInput({
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cx(controlBase, controlHeight, className)} {...props} />;
}

export function Select({
  className,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cx(controlBase, controlHeight, "appearance-none", className)} {...props}>
      {children}
    </select>
  );
}

export function TextArea({
  className,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cx(controlBase, "py-2.5", className)} {...props} />;
}

/**
 * A radio styled as a large card. Radios (not buttons) so the choice is
 * keyboard-navigable with arrow keys and announced as a group by default.
 * The whole card is the label, giving a full-width touch target.
 */
/**
 * A radio "card", controlled or uncontrolled.
 *
 * `checked`/`onChange` exist because the onboarding wizard needs controlled
 * inputs: React resets *uncontrolled* inputs to their defaults after a form
 * action completes, so with `defaultChecked` alone every answer a learner gave
 * was wiped as soon as they moved to the next step, and the final submit failed
 * validation. Passing `checked` keeps the answers in React state, which the
 * step navigation cannot reach.
 */
export function ChoiceCard({
  name,
  value,
  title,
  description,
  icon,
  defaultChecked,
  checked,
  onChange,
  badge,
}: {
  name: string;
  value: string;
  title: string;
  description?: string;
  icon?: ReactNode;
  defaultChecked?: boolean;
  checked?: boolean;
  onChange?: ChangeEventHandler<HTMLInputElement>;
  badge?: string;
}) {
  const id = `${name}-${value}`;
  const controlled = checked !== undefined;

  return (
    <div className="relative">
      <input
        type="radio"
        id={id}
        name={name}
        value={value}
        {...(controlled ? { checked } : { defaultChecked })}
        onChange={onChange}
        className="peer sr-only"
      />
      <label
        htmlFor={id}
        className={cx(
          "flex cursor-pointer items-start gap-3 rounded-[var(--radius)] border border-line-strong",
          "bg-surface-raised p-4 transition-colors hover:bg-surface-hover",
          "peer-checked:border-accent peer-checked:bg-accent-subtle",
          "peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[var(--ring)]",
          "min-h-[44px]",
        )}
      >
        {icon ? <span className="mt-0.5 shrink-0 text-secondary">{icon}</span> : null}
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="text-sm font-medium text-primary">{title}</span>
            {badge ? (
              <span className="rounded-full bg-surface-sunken px-1.5 py-0.5 text-[11px] font-medium text-muted">
                {badge}
              </span>
            ) : null}
          </span>
          {description ? (
            <span className="mt-0.5 block text-sm text-secondary">{description}</span>
          ) : null}
        </span>
        {/* Checked indicator: shape as well as colour, so it does not rely on
            colour alone. */}
        <span
          aria-hidden="true"
          className="mt-1 hidden size-4 shrink-0 items-center justify-center rounded-full border-2 border-accent peer-checked:flex"
        >
          <span className="size-1.5 rounded-full bg-accent" />
        </span>
      </label>
    </div>
  );
}

/**
 * A checkbox pill for multi-select questions (skill priorities, motivation).
 * Uses real checkboxes so the browser handles the "array of values" submission.
 */
export function ChipCheckbox({
  name,
  value,
  label,
  defaultChecked,
  checked,
  onChange,
}: {
  name: string;
  value: string;
  label: string;
  defaultChecked?: boolean;
  checked?: boolean;
  onChange?: ChangeEventHandler<HTMLInputElement>;
}) {
  const id = `${name}-${value}`;
  const controlled = checked !== undefined;

  return (
    <div>
      <input
        type="checkbox"
        id={id}
        name={name}
        value={value}
        {...(controlled ? { checked } : { defaultChecked })}
        onChange={onChange}
        className="peer sr-only"
      />
      <label
        htmlFor={id}
        className={cx(
          "inline-flex min-h-[44px] cursor-pointer items-center gap-2 rounded-full border border-line-strong",
          "bg-surface-raised px-4 text-sm font-medium text-secondary",
          "transition-colors hover:bg-surface-hover",
          "peer-checked:border-accent peer-checked:bg-accent-subtle peer-checked:text-accent",
          "peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[var(--ring)]",
        )}
      >
        <span
          aria-hidden="true"
          className="flex size-4 items-center justify-center rounded-[4px] border border-line-strong peer-checked:border-accent"
        >
          <Icon name="check" size={12} className="hidden peer-checked:block" />
        </span>
        {label}
      </label>
    </div>
  );
}

/** A form-level error, announced politely so it is not missed. */
export function FormError({ message }: { message?: string | null }) {
  if (!message) return null;

  return (
    <p
      role="status"
      aria-live="polite"
      className="rounded-[var(--radius)] border border-danger/30 bg-danger-soft px-3.5 py-2.5 text-sm font-medium text-danger"
    >
      {message}
    </p>
  );
}
