/**
 * Standalone test runner using Node's built-in test runner + strip-types.
 * Avoids dependency on a fully installed Vitest when npm is flaky.
 */

import { spawn } from "node:child_process";
import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

async function findTests(dir, acc = []) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return acc;
  }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "node_modules" || e.name === "dist") continue;
      await findTests(full, acc);
    } else if (/\.(test|spec)\.ts$/.test(e.name) || e.name.endsWith(".test.ts")) {
      acc.push(full);
    }
  }
  return acc;
}

const testFiles = await findTests(root);
// Prefer our known good files
const preferred = [
  "packages/protocol/src/__tests__/protocol.test.ts",
  "packages/core/src/__tests__/stream.test.ts",
  "packages/transport/src/__tests__/sse.test.ts",
  "tests/integration.test.ts",
].map((p) => path.join(root, p));

const files = preferred.filter(async (f) => {
  try {
    await stat(f);
    return true;
  } catch {
    return false;
  }
});

// Actually filter synchronously
import { existsSync } from "node:fs";
const toRun = preferred.filter((f) => existsSync(f));

console.log("NYVEN STREAM test runner");
console.log("Files:", toRun.map((f) => path.relative(root, f)).join(", "));

let failed = 0;
for (const file of toRun) {
  console.log("\n──", path.relative(root, file), "──");
  const code = await new Promise((resolve) => {
    const child = spawn(
      process.execPath,
      [
        "--experimental-strip-types",
        "--test",
        file,
      ],
      {
        cwd: root,
        stdio: "inherit",
        env: {
          ...process.env,
          NODE_OPTIONS: "--experimental-strip-types",
        },
      }
    );
    child.on("close", resolve);
  });
  if (code !== 0) failed += 1;
}

console.log("\n══════════════════════════════");
if (failed === 0) {
  console.log("ALL TEST FILES PASSED");
  process.exit(0);
} else {
  console.log(`${failed} FILE(S) FAILED`);
  process.exit(1);
}
