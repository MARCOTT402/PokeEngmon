/* ESLint：只開「真 bug／死碼」類規則，唔開 style（唔做大規模 reformat）。
   App 係 36+ 個 global script 靠載入次序共用名 → 跨檔 global 由 tools/audit/gen-eslint-globals.mjs
   生成 eslint.globals.json（prelint 自動跑）。 */
import globals from "globals";
import { readFileSync } from "node:fs";

const appGlobals = JSON.parse(readFileSync(new URL("./eslint.globals.json", import.meta.url), "utf8"));

const rules = {
  "no-undef": "error",
  "no-dupe-keys": "error",
  "no-unreachable": "error",
  "no-redeclare": ["error", { builtinGlobals: false }],   /* 頂層宣告本身就係 eslint.globals.json 嘅來源 */
  /* vars: "local" — 頂層宣告係俾其他 script 用，唔當 unused */
  "no-unused-vars": ["warn", { vars: "local", args: "none", caughtErrors: "none", ignoreRestSiblings: true }],   /* `const { _key, ...clean } = card` 係刻意剔走欄位 */
  "eqeqeq": ["warn", "smart"]
};

export default [
  { ignores: ["vendor/**", "node_modules/**", "js/gens-data.js", "js/mega-data.js"] },
  {
    files: ["js/**/*.js"],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "script",
      globals: { ...globals.browser, ...appGlobals, THREE: "readonly", gsap: "readonly", supabase: "readonly", module: "readonly"   /* 部分檔尾有 module.exports 俾 Node 測試用 */ }
    },
    rules
  },
  {
    files: ["js/capture.js"],
    languageOptions: { sourceType: "module" }
  },
  {
    files: ["tests/**/*.js"],
    languageOptions: { ecmaVersion: 2023, sourceType: "commonjs", globals: { ...globals.node } },
    rules
  }
];
