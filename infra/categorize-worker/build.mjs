// Bundles the worker handler with esbuild, including categorize logic from ../../src
import { build } from "esbuild";
import { rm, mkdir, copyFile, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = __dirname;
const repoRoot = path.resolve(root, "..", "..");
const dist = path.join(root, "dist");

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });

await build({
  entryPoints: [path.join(root, "src", "handler.ts")],
  bundle: true,
  platform: "node",
  target: "node20",
  format: "cjs",
  outfile: path.join(dist, "handler.js"),
  external: [
    "@prisma/client",
    ".prisma/client",
    "@aws-sdk/client-secrets-manager",
  ],
  sourcemap: true,
  alias: {
    "@": path.join(repoRoot, "src"),
  },
  loader: { ".node": "file" },
  logLevel: "info",
});

// Copy node_modules (production only) into dist for Lambda packaging
// Use Lambda-friendly approach: install in dist
const { execSync } = await import("node:child_process");

// Write a minimal package.json for runtime deps
const pkgRuntime = {
  name: "categorize-worker-runtime",
  version: "1.0.0",
  dependencies: {
    "@prisma/client": "^6.17.1",
    "@aws-sdk/client-secrets-manager": "^3.740.0",
    prisma: "^6.17.1",
  },
};
const { writeFile } = await import("node:fs/promises");
await writeFile(
  path.join(dist, "package.json"),
  JSON.stringify(pkgRuntime, null, 2),
);

// Copy the prisma schema so we can generate client into dist
await mkdir(path.join(dist, "prisma"), { recursive: true });
await copyFile(
  path.join(repoRoot, "prisma", "schema.prisma"),
  path.join(dist, "prisma", "schema.prisma"),
);

console.log("[build] Installing runtime deps in dist…");
execSync("npm install --omit=dev --no-audit --no-fund", {
  cwd: dist,
  stdio: "inherit",
});

console.log("[build] Generating Prisma client in dist…");
execSync("npx prisma generate", {
  cwd: dist,
  stdio: "inherit",
});

console.log("[build] Done. dist/ contents:");
const files = await readdir(dist);
for (const f of files) console.log("  -", f);

if (!existsSync(path.join(dist, "handler.js"))) {
  throw new Error("handler.js not found in dist");
}
