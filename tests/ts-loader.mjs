/**
 * ESM resolve loader for Node --experimental-strip-types tests.
 * Windows-safe. Does not set format so Node can strip types from .ts.
 */
import { pathToFileURL, fileURLToPath } from "node:url";
import { existsSync, statSync } from "node:fs";
import path from "node:path";

function toFsPath(urlOrPath) {
  if (!urlOrPath) return process.cwd();
  if (typeof urlOrPath === "string" && urlOrPath.startsWith("file:")) {
    return fileURLToPath(urlOrPath);
  }
  return urlOrPath;
}

function toFileUrl(absPath) {
  return pathToFileURL(path.resolve(absPath)).href;
}

function isFile(p) {
  try {
    return existsSync(p) && statSync(p).isFile();
  } catch {
    return false;
  }
}

const LOADER_DIR = path.dirname(fileURLToPath(import.meta.url));

const ALIASES = {
  "@nyven-stream/protocol": path.join(
    LOADER_DIR,
    "../packages/protocol/src/index.ts"
  ),
  "@nyven-stream/core": path.join(LOADER_DIR, "../packages/core/src/index.ts"),
  "@nyven-stream/transport": path.join(
    LOADER_DIR,
    "../packages/transport/src/index.ts"
  ),
  "@nyven-stream/adapters": path.join(
    LOADER_DIR,
    "../packages/adapters/src/index.ts"
  ),
  "@nyven-stream/renderer": path.join(
    LOADER_DIR,
    "../packages/renderer/src/index.ts"
  ),
};

function resolveExtensionless(baseAbs) {
  for (const c of [
    baseAbs + ".ts",
    baseAbs + ".tsx",
    baseAbs + ".js",
    path.join(baseAbs, "index.ts"),
    path.join(baseAbs, "index.tsx"),
    path.join(baseAbs, "index.js"),
  ]) {
    if (isFile(c)) return c;
  }
  return null;
}

function asTsModule(absPath) {
  // Do NOT set format: "module" — that forces JS parse and breaks strip-types.
  return { shortCircuit: true, url: toFileUrl(absPath) };
}

export async function resolve(specifier, context, nextResolve) {
  if (Object.prototype.hasOwnProperty.call(ALIASES, specifier)) {
    return asTsModule(ALIASES[specifier]);
  }

  const isRelative =
    specifier.startsWith("./") ||
    specifier.startsWith("../") ||
    path.isAbsolute(specifier);

  if (isRelative && !specifier.startsWith("node:")) {
    const dir = path.dirname(toFsPath(context.parentURL));
    const abs = path.resolve(dir, specifier);

    if (/\.js$/i.test(specifier) && !isFile(abs)) {
      const ts = abs.replace(/\.js$/i, ".ts");
      const tsx = abs.replace(/\.js$/i, ".tsx");
      if (isFile(ts)) return asTsModule(ts);
      if (isFile(tsx)) return asTsModule(tsx);
    }

    if (!/\.(ts|tsx|js|mjs|cjs|json)$/i.test(specifier)) {
      const resolved = resolveExtensionless(abs);
      if (resolved) return asTsModule(resolved);
    }
  }

  return nextResolve(specifier, context);
}
