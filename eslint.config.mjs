import js from "@eslint/js";
import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // The plain-JS files — the sync program and the extension — are not covered by the TypeScript
  // rules above, and nothing type-checks them either. ESLint's own recommended set is what catches
  // the mistakes a compiler would otherwise have caught (assigning to a const, an undeclared name).
  {
    files: ["public/*.mjs", "extension/**/*.js"],
    ...js.configs.recommended,
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: { chrome: "readonly", console: "readonly", document: "readonly", fetch: "readonly", globalThis: "readonly", location: "readonly", process: "readonly" },
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
