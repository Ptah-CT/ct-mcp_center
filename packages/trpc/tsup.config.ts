import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/trpc.ts", "src/router.ts", "src/routers/frontend/*.ts"],
  format: ["esm"],
  target: "node18",
  outDir: "dist",
  sourcemap: true,
  clean: true,
  splitting: false,
  bundle: false,
  keepNames: true,
  minify: false,
  dts: true, // Generate TypeScript declaration files
  outExtension() {
    return {
      js: `.js`, // Ensure .js output instead of .mjs
    };
  },
  external: ["@trpc/server", "zod"],
});
