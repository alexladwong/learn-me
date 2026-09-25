import Link from "next/link";
import { redirect } from "next/navigation";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { APP_NAME, APP_TAGLINE } from "@/lib/constants";
import { getSession } from "@/lib/auth/session";

const PILLARS = [
  {
    icon: "compass" as const,
    title: "Guided paths",
    body: "Structured tracks from first words to real conversation, so you always know what is next.",
  },
  {
    icon: "cards" as const,
    title: "Spaced repetition",
    body: "A real scheduling engine over words, phrases and whole sentences — computed by the server, not guessed.",
  },
  {
    icon: "speak" as const,
    title: "Speaking practice",
    body: "Practise producing language, not just recognising it, with your own recordings and conversations.",
  },
  {
    icon: "chart" as const,
    title: "Measurable progress",
    body: "Only real numbers from your own answers. Where there is not enough evidence yet, we say so.",
  },
];

/**
 * The language home / marketing page.
 *
 * A signed-in learner is sent straight to their languages rather than being
 * shown a pitch for a product they already use.
 */
export default async function HomePage() {
  const session = await getSession();
  if (session) redirect("/languages");

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col px-5 py-10 sm:px-8 sm:py-16">
      <header className="flex items-center justify-between gap-4">
        <span className="flex items-center gap-2 text-sm font-semibold tracking-tight">
          <span className="flex size-8 items-center justify-center rounded-[10px] bg-accent text-on-accent">
            <Icon name="globe" size={18} />
          </span>
          {APP_NAME}
        </span>
        <div className="flex items-center gap-2">
          <ButtonLink href="/sign-in" variant="ghost" size="sm">
            Sign in
          </ButtonLink>
          <ButtonLink href="/sign-up" size="sm">
            Get started
          </ButtonLink>
        </div>
      </header>

      <section className="mt-14 sm:mt-20">
        <p className="text-sm font-medium text-accent">Language learning, properly</p>
        <h1 className="mt-3 max-w-3xl text-3xl font-semibold leading-tight tracking-tight text-primary sm:text-5xl">
          Stop wondering what to study.
          <br />
          <span className="text-secondary">Always know the next step.</span>
        </h1>
        <p className="mt-5 max-w-2xl text-base text-secondary sm:text-lg">
          {APP_TAGLINE} It decides what you should learn today, remembers what you
          keep getting wrong, and shows you what you have actually learned.
        </p>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <ButtonLink href="/sign-up" size="lg">
            Start learning
            <Icon name="arrowRight" size={18} />
          </ButtonLink>
          <ButtonLink href="/sign-in" size="lg" variant="secondary">
            I already have an account
          </ButtonLink>
        </div>
      </section>

      <section className="mt-16 grid gap-4 sm:grid-cols-2">
        {PILLARS.map((pillar) => (
          <Card key={pillar.title} tone="default">
            <span className="flex size-10 items-center justify-center rounded-[10px] bg-accent-subtle text-accent">
              <Icon name={pillar.icon} size={20} />
            </span>
            <h2 className="mt-4 text-base font-semibold text-primary">{pillar.title}</h2>
            <p className="mt-1.5 text-sm text-secondary">{pillar.body}</p>
          </Card>
        ))}
      </section>

      <section className="mt-12 rounded-[var(--radius-lg)] border border-line bg-surface-sunken p-5 sm:p-6">
        <h2 className="text-sm font-semibold text-primary">Built to tell you the truth</h2>
        <p className="mt-1.5 max-w-3xl text-sm text-secondary">
          No invented statistics, no simulated pronunciation scores, no filler
          progress. If a capability is not connected yet, the app says so rather
          than showing a confident-looking number.
        </p>
      </section>

      <footer className="mt-14 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-6 text-sm text-muted">
        <span>
          {APP_NAME} · {new Date().getFullYear()}
        </span>
        <Link href="/sign-up" className="font-medium text-accent hover:underline">
          Create an account
        </Link>
      </footer>
    </main>
  );
}
