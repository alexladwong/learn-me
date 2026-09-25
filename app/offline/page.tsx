import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardHeader } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { APP_NAME } from "@/lib/constants";

export const metadata: Metadata = { title: "Offline" };

/**
 * What a learner sees when they navigate with no connection.
 *
 * This page is cached by the service worker at install time, so it must not read
 * from the database or require a session — it has to render from the cache alone.
 * That is why it takes no params and fetches nothing.
 *
 * It says something specific and true: reviews answered offline are held on the
 * device, which is the whole reason a learner can keep working on a train. A
 * generic browser error would leave them wondering whether their answers survived.
 */
export default function OfflinePage() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-xl flex-col justify-center gap-5 px-5 py-10">
      <Card>
        <CardHeader
          title="You are offline"
          description={`${APP_NAME} needs a connection to load new lessons, but nothing you have already done is lost.`}
        />
        <div className="mt-4 flex flex-col gap-3 text-sm text-secondary">
          <p className="flex items-start gap-2">
            <span aria-hidden="true" className="mt-0.5 text-muted">
              <Icon name="cloudOff" size={16} />
            </span>
            Reviews you answer without a connection are saved on this device and sent
            the moment you are back online. Each one is sent with a key that stops it
            being counted twice, so reconnecting cannot schedule a card you already
            answered.
          </p>
          <p>
            Any page you have already opened will still work from the cache. Once the
            connection returns, this page will let you carry on where you left off.
          </p>
        </div>
        <div className="mt-5">
          <Link
            href="/"
            className="inline-flex min-h-[44px] items-center gap-1.5 text-sm font-medium text-accent hover:underline"
          >
            Try again
            <Icon name="arrowRight" size={15} />
          </Link>
        </div>
      </Card>
    </main>
  );
}
