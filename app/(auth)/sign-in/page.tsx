import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { FormError } from "@/components/ui/form";
import { AuthFooterLink, GoogleButton, OrDivider } from "@/components/auth/auth-widgets";
import { CredentialForm } from "@/components/auth/credential-form";
import { signInAction } from "@/app/(auth)/actions";
import { getSession, safeNextPath } from "@/lib/auth/session";
import { APP_NAME } from "@/lib/constants";

export const metadata: Metadata = { title: "Sign in" };

export default async function SignInPage({ searchParams }: PageProps<"/sign-in">) {
  const session = await getSession();
  if (session) redirect("/languages");

  const params = await searchParams;
  const next = safeNextPath(typeof params.next === "string" ? params.next : null);
  const error = typeof params.error === "string" ? params.error : null;
  const created = params.created === "1";

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-5 py-10">
      <Link
        href="/"
        className="mb-6 flex items-center gap-2 self-start text-sm font-semibold tracking-tight"
      >
        <span className="flex size-8 items-center justify-center rounded-[10px] bg-accent text-on-accent">
          <Icon name="globe" size={18} />
        </span>
        {APP_NAME}
      </Link>

      <Card tone="raised">
        <h1 className="text-xl font-semibold text-primary">Welcome back</h1>
        <p className="mt-1 text-sm text-secondary">
          Sign in to continue where you left off.
        </p>

        {created ? (
          <p
            role="status"
            className="mt-4 rounded-[var(--radius)] border border-success/30 bg-success-soft px-3.5 py-2.5 text-sm font-medium text-success"
          >
            Account created. Sign in to get started.
          </p>
        ) : null}

        <div className="mt-5 flex flex-col gap-4">
          <FormError message={error} />
          <GoogleButton label="Continue with Google" />
          <OrDivider label="or use email" />
          <CredentialForm action={signInAction} mode="sign-in" next={next ?? undefined} />
        </div>
      </Card>

      <div className="mt-5">
        <AuthFooterLink
          text="New here?"
          href="/sign-up"
          cta="Create an account"
        />
      </div>
    </main>
  );
}
