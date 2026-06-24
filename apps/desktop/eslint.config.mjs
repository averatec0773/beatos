import { defineConfig } from "eslint/config";
import tseslint from "@electron-toolkit/eslint-config-ts";
import eslintConfigPrettier from "@electron-toolkit/eslint-config-prettier";
import eslintPluginReact from "eslint-plugin-react";
import eslintPluginReactHooks from "eslint-plugin-react-hooks";
import eslintPluginReactRefresh from "eslint-plugin-react-refresh";

export default defineConfig(
  // The vendored Unicorn Studio WebGL runtime is third-party minified code, not
  // our source — don't lint it.
  { ignores: ["**/node_modules", "**/dist", "**/out", "**/release", "**/unicornStudio.umd.js"] },
  tseslint.configs.recommended,
  eslintPluginReact.configs.flat.recommended,
  eslintPluginReact.configs.flat["jsx-runtime"],
  {
    settings: {
      react: {
        version: "detect",
      },
    },
  },
  {
    files: ["**/*.{ts,tsx}"],
    plugins: {
      "react-hooks": eslintPluginReactHooks,
      "react-refresh": eslintPluginReactRefresh,
    },
    rules: {
      ...eslintPluginReactHooks.configs.recommended.rules,
      ...eslintPluginReactRefresh.configs.vite.rules,
    },
  },
  eslintConfigPrettier,
  // Project rule posture: keep bug-catchers (no-unused-vars, no-empty,
  // rules-of-hooks) as errors, but downgrade purely stylistic / advisory rules
  // to warnings. The codebase predates these strict rules and never conformed;
  // making them errors would block CI on style, not correctness.
  {
    files: ["**/*.{ts,tsx}"],
    rules: {
      "@typescript-eslint/explicit-function-return-type": "warn",
      "@typescript-eslint/no-explicit-any": "warn",
      "react-hooks/set-state-in-effect": "warn",
      "react-refresh/only-export-components": "warn",
      "react/no-unescaped-entities": "warn",
    },
  },
  // Tests + dev scripts: relax strict typing/style entirely — explicit return
  // types and `any` are noise in test doubles and one-off harness scripts.
  {
    files: ["**/*.test.{ts,tsx}", "**/__tests__/**", "**/test/**", "scripts/**"],
    rules: {
      "@typescript-eslint/explicit-function-return-type": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-empty-function": "off",
      "@typescript-eslint/no-unused-vars": "off",
      "no-empty": "off",
    },
  },
);
