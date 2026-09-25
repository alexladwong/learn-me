import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { AuthFooterLink, GoogleButton, OrDivider } from "@/components/auth/auth-widgets";
import { CredentialForm } from "@/components/auth/credential-form";
import { signUpAction } from "@/app/(auth)/actions";
import { getSession } from "@/lib/auth/session";
import { APP_NAME } from "@/lib/constants";

export const metadata: Metadata = { title: "Create your account" };

export default async function SignUpPage({ searchParams }: PageProps<"/sign-up">) {
  const session = await getSession();
  if (session) redirect("/languages");

  const params = await searchParams;
  const error = typeof params.error === "string" ? params.error : null;

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
        <h1 className="text-xl font-semibold text-primary">Create your account</h1>
        <p className="mt-1 text-sm text-secondary">
          Two minutes of setup, then we build your learning plan.
        </p>

        <div className="mt-5 flex flex-col gap-4">
          {error ? (
            <p
              role="status"
              className="rounded-[var(--radius)] border border-danger/30 bg-danger-soft px-3.5 py-2.5 text-sm font-medium text-danger"
            >
              {error}
            </p>
          ) : null}
          <GoogleButton label="Sign up with Google" />
          <OrDivider label="or use email" />
          <CredentialForm action={signUpAction} mode="sign-up" />
        </div>
      </Card>

      <div className="mt-5">
        <AuthFooterLink text="Already have an account?" href="/sign-in" cta="Sign in" />
      </div>
    </main>
  );
}
