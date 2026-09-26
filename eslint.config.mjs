import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      /**
       * Destructuring is how this codebase drops a field it carried only for
       * sorting or ordering — `const { order, ...rest } = row`. Those bindings
       * are intentionally unused, and requiring an underscore prefix for them
       * would be pure noise.
       */
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          ignoreRestSiblings: true,
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    /*
     * The Capacitor native projects. `npx cap sync` writes the web bridge and
     * copies generated web assets into them, and Gradle writes build output —
     * none of it is source, and `android/app/build/…/native-bridge.js` alone was
     * producing fourteen lint warnings on every run.
     */
    "android/**",
    "ios/**",
    // Generated store artwork, produced by `scripts/generate-app-icons.mjs`.
    "assets/**",
    // Capacitor requires a `webDir`; the placeholder there is never served.
    "native/**",
  ]),
]);

export default eslintConfig;
