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
  entryPoints: [
    path.join(root, "src", "handler.ts"),
    path.join(root, "src", "enqueue.ts"),
  ],
  bundle: true,
  platform: "node",
  target: "node20",
  format: "cjs",
  outdir: dist,
  external: [
    "@prisma/client",
    ".prisma/client",
    "@aws-sdk/client-secrets-manager",
    "@aws-sdk/client-sqs",
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
    "@aws-sdk/client-sqs": "^3.740.0",
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

console.log("[build] Pruning unneeded files to fit Lambda 250MB limit…");
const toRemove = [
  "node_modules/prisma",
  "node_modules/.cache",
  "node_modules/@prisma/engines",
  "node_modules/@prisma/fetch-engine",
  "node_modules/@prisma/get-platform",
  "node_modules/.prisma/client/query_engine-windows.dll.node",
  "node_modules/.prisma/client/query_engine_bg.wasm",
  "node_modules/.prisma/client/query_engine_bg.js",
  "node_modules/.prisma/client/wasm.js",
  "node_modules/.prisma/client/wasm.d.ts",
  "node_modules/.prisma/client/wasm-edge-light-loader.mjs",
  "node_modules/.prisma/client/wasm-worker-loader.mjs",
  "node_modules/.prisma/client/edge.js",
  "node_modules/.prisma/client/edge.d.ts",
  "node_modules/.prisma/client/index-browser.js",
  "node_modules/@prisma/client/runtime/edge.js",
  "node_modules/@prisma/client/runtime/edge-esm.js",
  "node_modules/@prisma/client/runtime/wasm.js",
  "node_modules/@prisma/client/runtime/react-native.js",
];
for (const rel of toRemove) {
  const p = path.join(dist, rel);
  if (existsSync(p)) {
    await rm(p, { recursive: true, force: true });
    console.log("  removed", rel);
  }
}

console.log("[build] Done. dist/ contents:");
const files = await readdir(dist);
for (const f of files) console.log("  -", f);

if (!existsSync(path.join(dist, "handler.js"))) {
  throw new Error("handler.js not found in dist");
}
if (!existsSync(path.join(dist, "enqueue.js"))) {
  throw new Error("enqueue.js not found in dist");
}
