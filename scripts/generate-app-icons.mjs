/**
 * Generate the app icons and splash screens for the native shell.
 *
 * Run:  npm run icons
 *
 * `npx cap add ios` and `npx cap add android` fill both projects with Capacitor's
 * own template artwork. Shipping that would put the Capacitor logo on a learner's
 * home screen, so this derives every store asset from the product's real icon —
 * `public/icon.svg`, the same open book the navigation rail uses.
 *
 * Rasterising is done with headless Chrome, which is already a dependency of the
 * verification scripts. No image library is added for a job that runs when the
 * artwork changes.
 *
 * What it produces, and why the shapes differ:
 *
 *   - `icon-only.png` — full bleed, NO rounded corners. iOS masks the icon
 *     itself; an icon that rounds its own corners produces rounded corners inside
 *     rounded corners, with the page showing through the gap.
 *   - `icon-foreground.png` / `icon-background.png` — Android adaptive icons are
 *     two layers the launcher composes and animates. The foreground must stay
 *     inside the inner 66% safe zone or a circular launcher mask clips the book.
 *   - `splash.png` / `splash-dark.png` — the icon centred on the app's own
 *     surface colour, taken from `app/globals.css` rather than eyeballed, so the
 *     hand-off from splash to first paint is not a flash of a different colour.
 *
 * Then `npx @capacitor/assets generate` distributes them into the Xcode asset
 * catalogue and the Android mipmaps.
 */

import { execFile } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);

const CHROME =
  process.env.CHROME_PATH ??
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const ASSETS = path.resolve("assets");
const BUILD = path.resolve("node_modules/.cache/app-icons");

/*
 * The product's own colours, read from the token definitions in
 * `app/globals.css` and converted from oklch. Kept as literals with the source
 * noted, because this script has no CSS parser and a wrong colour here would be
 * invisible until a splash screen flashed on a real device.
 */
const INK = "#1c1917"; // public/icon.svg background
const PAPER = "#faf8f5"; // --surface, light   (oklch 98.2% 0.006 92)
const PAPER_DARK = "#141820"; // --surface, dark (oklch 21% 0.022 245)

/** The open book, lifted verbatim from `public/icon.svg`. */
const BOOK = `<g fill="none" stroke="#faf8f5" stroke-width="26" stroke-linecap="round" stroke-linejoin="round">
    <path d="M96 140a32 32 0 0 1 32-32h96a44 44 0 0 1 44 44v264a38 38 0 0 0-38-38H96Z"/>
    <path d="M416 140a32 32 0 0 0-32-32h-96a44 44 0 0 0-44 44v264a38 38 0 0 1 38-38h128Z"/>
  </g>`;

const svg = (body, background) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  ${background ? `<rect width="512" height="512" fill="${background}"/>` : ""}
  ${body}
</svg>`;

/** The book scaled about the centre, for Android's adaptive safe zone. */
const scaledBook = (scale) =>
  `<g transform="translate(256 256) scale(${scale}) translate(-256 -256)">${BOOK}</g>`;

async function rasterize(name, markup, size) {
  const source = path.join(BUILD, `${name}.svg`);
  writeFileSync(source, markup.replace('width="512" height="512"', `width="${size}" height="${size}"`));
  await run(CHROME, [
    "--headless=new",
    "--disable-gpu",
    "--hide-scrollbars",
    // Transparent where the SVG does not paint, so the adaptive foreground layer
    // is genuinely transparent rather than white.
    "--default-background-color=00000000",
    `--window-size=${size},${size}`,
    `--screenshot=${path.join(ASSETS, `${name}.png`)}`,
    `file://${source}`,
  ]);
  console.log(`  ${name}.png (${size}x${size})`);
}

mkdirSync(ASSETS, { recursive: true });
mkdirSync(BUILD, { recursive: true });

console.log("generating app icons from public/icon.svg…");

// iOS and the web icon: full bleed, the OS applies the shape.
await rasterize("icon-only", svg(BOOK, INK), 1024);

// Android adaptive: background is a flat colour, foreground is the glyph alone.
await rasterize("icon-background", svg("", INK), 1024);
await rasterize("icon-foreground", svg(scaledBook(0.6), null), 1024);

// Splash: the glyph on the app's own surface, so there is no colour jump.
await rasterize(
  "splash",
  svg(`<g transform="translate(256 256) scale(0.42) translate(-256 -256)">
       <g fill="none" stroke="${INK}" stroke-width="26" stroke-linecap="round" stroke-linejoin="round">
         <path d="M96 140a32 32 0 0 1 32-32h96a44 44 0 0 1 44 44v264a38 38 0 0 0-38-38H96Z"/>
         <path d="M416 140a32 32 0 0 0-32-32h-96a44 44 0 0 0-44 44v264a38 38 0 0 1 38-38h128Z"/>
       </g>
     </g>`, PAPER),
  2732,
);
await rasterize(
  "splash-dark",
  svg(`<g transform="translate(256 256) scale(0.42) translate(-256 -256)">${BOOK}</g>`, PAPER_DARK),
  2732,
);

console.log(`
assets/ is ready. Apply it to both native projects with:

  npx @capacitor/assets generate --ios --android
`);
