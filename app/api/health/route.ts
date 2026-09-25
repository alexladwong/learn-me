import { NextResponse } from "next/server";

/**
 * Liveness and dependency check.
 *
 * Deliberately reports *which* dependency failed rather than a flat "ok": when
 * this fails in a deployed environment, the response should say whether the
 * problem is the app, its InsForge configuration, or the database — without
 * requiring access to server logs.
 *
 * It exposes no secrets: only booleans and the database's own status.
 */
export async function GET() {
  const config = {
    insforge_url: Boolean(process.env.NEXT_PUBLIC_INSFORGE_URL),
    insforge_anon_key: Boolean(process.env.NEXT_PUBLIC_INSFORGE_ANON_KEY),
    insforge_admin_key: Boolean(process.env.INSFORGE_API_KEY),
    ai_provider: Boolean(process.env.OPENROUTER_API_KEY),
    app_url: process.env.NEXT_PUBLIC_APP_URL ?? null,
  };

  const missing = Object.entries(config)
    .filter(([key, value]) => key !== "app_url" && value !== true)
    .map(([key]) => key);

  let database: "ok" | "unreachable" | "skipped" = "skipped";
  if (config.insforge_url && config.insforge_anon_key) {
    try {
      const { getServerClient } = await import("@/lib/insforge/server-client");
      const client = await getServerClient();
      const { error } = await client.database
        .from("languages")
        .select("code", { count: "exact", head: true });
      database = error ? "unreachable" : "ok";
    } catch {
      database = "unreachable";
    }
  }

  const healthy = missing.length === 0 && database !== "unreachable";

  return NextResponse.json(
    {
      status: healthy ? "ok" : "degraded",
      database,
      config,
      missing,
      timestamp: new Date().toISOString(),
    },
    { status: healthy ? 200 : 503 },
  );
}
