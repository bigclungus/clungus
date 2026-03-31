// @ts-check
import tseslint from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";
import importPlugin from "eslint-plugin-import";

/** @type {import("eslint").Linter.Config[]} */
const config = [
  // ── Global ignores ─────────────────────────────────────────────────────────
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "omni/**",
      "gemini-cli/**",
      "graphiti/**",
      "labs/**",
      "docker/**",
      "backups/**",
      "data/**",
      "secrets/**",
      "static/**",
      "kokoro-env/**",
      "lost+found/**",
      "swapfile2",
      "**/*.js",
      "**/*.mjs",
      "**/*.cjs",
    ],
  },

  // ── All TypeScript files ────────────────────────────────────────────────────
  {
    files: ["**/*.ts", "**/*.tsx"],

    plugins: {
      "@typescript-eslint": tseslint,
      import: importPlugin,
    },

    languageOptions: {
      parser: tsParser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },

    // Spread in strict + stylistic + strict-type-checked recommended rules
    rules: {
      // ── @typescript-eslint/strict preset ──────────────────────────────────
      ...tseslint.configs["strict"].rules,
      // ── @typescript-eslint/stylistic preset ───────────────────────────────
      ...tseslint.configs["stylistic"].rules,
      // ── @typescript-eslint/strict-type-checked preset ─────────────────────
      ...tseslint.configs["strict-type-checked"].rules,

      // ── Explicit overrides / additions ────────────────────────────────────

      // No any — ever
      "@typescript-eslint/no-explicit-any": "error",

      // Unhandled promises are silent failures
      "@typescript-eslint/no-floating-promises": "error",

      // Dead variables are bugs
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],

      // All functions must declare their return type
      "@typescript-eslint/explicit-function-return-type": [
        "error",
        {
          allowExpressions: true,
          allowTypedFunctionExpressions: true,
          allowHigherOrderFunctions: true,
        },
      ],

      // Non-null assertions hide bugs
      "@typescript-eslint/no-non-null-assertion": "error",

      // Prefer ?? over || for nullish checks
      "@typescript-eslint/prefer-nullish-coalescing": "error",

      // Prefer a?.b over a && a.b
      "@typescript-eslint/prefer-optional-chain": "error",

      // Redundant type assertions are noise
      "@typescript-eslint/no-unnecessary-type-assertion": "error",

      // No console.log — use a real logger
      "no-console": "warn",

      // Always strict equality
      eqeqeq: ["error", "always"],

      // Never throw raw strings or literals
      "no-throw-literal": "error",

      // Prefer const over let when never reassigned
      "prefer-const": "error",

      // Limit cyclomatic complexity
      complexity: ["error", 8],

      // ── import plugin ─────────────────────────────────────────────────────
      "import/no-duplicates": "error",
      "import/no-cycle": "warn",
    },
  },
];

export default config;
