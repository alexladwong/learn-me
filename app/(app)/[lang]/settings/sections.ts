/**
 * Settings section definitions and validation.
 *
 * A plain module with no directive, on purpose. **Every export of a `"use
 * client"` module is a client reference**, so a Server Component cannot call a
 * helper that lives in one — it fails at runtime with:
 *
 *   Attempted to call isSettingsSection() from the server but it is on the client.
 *
 * The settings page is a Server Component (it reads the profile and the learner's
 * plan) and needs to validate the `?section=` query parameter, while the workspace
 * is a Client Component (it owns the form's pending state). Both need this list,
 * so it lives here.
 *
 * This is the same boundary mistake that took the bank page down; keeping the
 * shared shape in a directive-free module is the fix in both cases.
 */

export const SETTINGS_SECTIONS = [
  { key: "profile", label: "Profile", icon: "profile" },
  { key: "plan", label: "Learning plan", icon: "compass" },
  { key: "languages", label: "Languages", icon: "globe" },
  { key: "audio", label: "Audio & pronunciation", icon: "volume" },
  { key: "appearance", label: "Appearance", icon: "sparkle" },
  { key: "notifications", label: "Notifications", icon: "inbox" },
  { key: "account", label: "Account", icon: "lock" },
] as const;

export type SettingsSection = (typeof SETTINGS_SECTIONS)[number]["key"];

/** Narrow an arbitrary query value to a real section. */
export function isSettingsSection(value: string | undefined): value is SettingsSection {
  return Boolean(value && SETTINGS_SECTIONS.some((section) => section.key === value));
}

/** The section shown when the URL does not name one. */
export const DEFAULT_SETTINGS_SECTION: SettingsSection = "profile";
