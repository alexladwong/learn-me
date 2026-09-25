import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LessonPlayer } from "./lesson-player";
import { loadLanguageContext } from "@/lib/db/context";
import { getLesson } from "@/lib/db/lessons";
import { getServerClient } from "@/lib/insforge/server-client";
import { requireProfile } from "@/lib/auth/session";

export async function generateMetadata({
  params,
}: PageProps<"/[lang]/lesson/[missionId]">): Promise<Metadata> {
  const { lang } = await params;
  return { title: `Lesson · ${lang.toUpperCase()}` };
}

/**
 * A guided lesson.
 *
 * The mission id is validated against the learner's language and its published
 * flag inside `getLesson`, so an unpublished or foreign mission is a 404 rather
 * than a page that renders nothing.
 */
export default async function LessonPage({
  params,
}: PageProps<"/[lang]/lesson/[missionId]">) {
  const { lang, missionId } = await params;
  await requireProfile();
  const { language } = await loadLanguageContext(lang);
  const client = await getServerClient();

  const lesson = await getLesson(client, language.code, missionId);
  if (!lesson || lesson.steps.length === 0) notFound();

  return (
    <LessonPlayer
      lesson={lesson}
      languageCode={language.code}
      languageName={language.name_en}
    />
  );
}
