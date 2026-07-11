import js from "@eslint/js";
import globals from "globals";
import prettierConfig from "eslint-config-prettier";

export default [
  { ignores: ["node_modules/"] },
  js.configs.recommended,
  {
    // Vanilla browser skripte, učitane preko <script>.
    files: ["**/*.js"],
    languageOptions: {
      sourceType: "script",
      globals: {
        ...globals.browser,
        module: "readonly",
      },
    },
    rules: {
      "no-unused-vars": [
        "error",
        {
          caughtErrors: "none",
          argsIgnorePattern: "^_",
          // Solver/Sudoku su modularni globali izloženi drugim datotekama.
          varsIgnorePattern: "^(Solver|Sudoku)$",
        },
      ],
    },
  },
  {
    // Solver/Sudoku su definirani u svojim datotekama, a konzumirani drugdje.
    files: ["sudoku.js", "app.js"],
    languageOptions: { globals: { Solver: "readonly" } },
  },
  {
    files: ["app.js"],
    languageOptions: { globals: { Sudoku: "readonly" } },
  },
  {
    // Service worker ima vlastite globale (self, caches, clients, skipWaiting).
    files: ["sw.js"],
    languageOptions: { globals: { ...globals.serviceworker } },
  },
  prettierConfig,
];
