import { createRequire } from "node:module";
import { rm, mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const require = createRequire(import.meta.url);
const execFileAsync = promisify(execFile);
const rootDir = path.resolve(new URL("..", import.meta.url).pathname);
const entryFile = path.join(rootDir, "lambda", "translate-stream", "src", "handler.ts");
const outDir = path.join(rootDir, "dist-lambda", "translate-stream");
const outFile = path.join(outDir, "index.js");
const zipFile = path.join(rootDir, "dist-lambda", "translate-stream.zip");

async function loadEsbuild() {
  try {
    return require("esbuild");
  } catch {
    throw new Error(
      'Missing dependency "esbuild". Install it with `npm install --save-dev esbuild`, then rerun this build.'
    );
  }
}

async function ensureCleanDir(dir) {
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });
}

async function buildBundle() {
  const esbuild = await loadEsbuild();

  await esbuild.build({
    entryPoints: [entryFile],
    outfile: outFile,
    bundle: true,
    format: "cjs",
    platform: "node",
    target: "node20",
    tsconfig: path.join(rootDir, "tsconfig.json"),
    sourcemap: false,
    minify: false,
    logLevel: "info",
    legalComments: "none"
  });
}

async function writeDeploymentManifest() {
  const manifest = {
    runtime: "nodejs20.x",
    handler: "index.handler",
    architecture: "x86_64",
    artifact: path.relative(rootDir, zipFile),
    entry: path.relative(rootDir, outFile),
    notes: [
      "Create a Lambda Function URL for this function.",
      "Set Function URL invoke mode to RESPONSE_STREAM.",
      "Set CORS_ALLOW_ORIGIN to your Amplify app domain if you want a fixed allowed origin."
    ]
  };

  await writeFile(path.join(outDir, "deploy-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
}

async function createZipArchive() {
  if (!existsSync(outFile)) {
    throw new Error(`Bundle output not found at ${outFile}`);
  }

  await rm(zipFile, { force: true });
  await execFileAsync(
    "zip",
    ["-j", zipFile, path.join(outDir, "index.js"), path.join(outDir, "deploy-manifest.json")],
    { cwd: outDir }
  );
}

async function main() {
  await ensureCleanDir(outDir);
  await buildBundle();
  await writeDeploymentManifest();
  await createZipArchive();

  process.stdout.write(`Built Lambda artifact: ${path.relative(rootDir, zipFile)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
