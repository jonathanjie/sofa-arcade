import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import { BROWSER_FILES } from "./scripts/runtime-files.mjs";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    "dist/**",
    ".vinext/**",
    ".wrangler/**",
    ".sites-runtime/**",
    "outputs/**",
    "work/**",
    "desktop/src-tauri/target/**",
    "desktop/stage/**",
    "desktop/artifacts/**",
    "desktop/src-tauri/gen/**",
    "server/runtime/gravity-orchard-dependencies.mjs",
    "public/assets/qrcode.js",
    "ui/media/gravity-orchard/manifest-data.mjs",
    "app/route.ts",
    ...BROWSER_FILES.map(({ url }) => `public${url}`),
  ]),
  {
    files: ["public/assets/odd-laws-society/sources/buildings/{inspect,optimize}.cjs"],
    // These CommonJS authoring tools use require to resolve their nested sharp install.
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
]);

export default eslintConfig;
