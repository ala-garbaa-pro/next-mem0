/**
 * Runs the Playwright e2e suite with a real Node.js runtime.
 *
 * Playwright's test runner and browser launcher rely on Node features Bun doesn't emulate on
 * Windows (extra stdio pipes for --remote-debugging-pipe, `ws`), so we cannot run it under Bun.
 * If `node` is not on PATH, a portable Node LTS is downloaded once into ./.tools/node.
 *
 * Usage: bun run test:e2e [playwright args...]
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const TOOLS = path.join(process.cwd(), ".tools");
const NODE_DIR = path.join(TOOLS, "node");
const NODE_EXE = path.join(NODE_DIR, "node.exe");

function nodeOnPath(): string | null {
  const probe = spawnSync("node", ["--version"], { encoding: "utf8", shell: true });
  // Bun installs a shim called node.exe; make sure it is the real thing.
  if (probe.status === 0 && /^v\d+/.test(probe.stdout.trim())) {
    const which = spawnSync("where", ["node"], { encoding: "utf8", shell: true }).stdout.split(/\r?\n/)[0];
    if (which && !which.includes("bun-node")) return which.trim();
  }
  return null;
}

async function ensurePortableNode(): Promise<string> {
  if (fs.existsSync(NODE_EXE)) return NODE_EXE;
  console.log("No Node.js found — downloading a portable Node LTS into .tools/node (one-time)…");
  const index = (await (await fetch("https://nodejs.org/dist/index.json")).json()) as {
    version: string;
    lts: string | false;
    files: string[];
  }[];
  const lts = index.find((r) => r.lts && r.files.includes("win-x64-zip"));
  if (!lts) throw new Error("Could not find a Node LTS build for win-x64");
  const name = `node-${lts.version}-win-x64`;
  const zip = path.join(TOOLS, `${name}.zip`);
  fs.mkdirSync(TOOLS, { recursive: true });
  const res = await fetch(`https://nodejs.org/dist/${lts.version}/${name}.zip`);
  if (!res.ok) throw new Error(`Download failed: ${res.status}`);
  fs.writeFileSync(zip, Buffer.from(await res.arrayBuffer()));
  const unzip = spawnSync(
    "powershell",
    ["-NoProfile", "-Command", `Expand-Archive -LiteralPath '${zip}' -DestinationPath '${TOOLS}' -Force`],
    { stdio: "inherit" },
  );
  if (unzip.status !== 0) throw new Error("Failed to extract Node zip");
  fs.rmSync(NODE_DIR, { recursive: true, force: true });
  fs.renameSync(path.join(TOOLS, name), NODE_DIR);
  fs.rmSync(zip);
  console.log(`Installed ${lts.version} at ${NODE_DIR}`);
  return NODE_EXE;
}

const node = nodeOnPath() ?? (await ensurePortableNode());
const cli = path.join(process.cwd(), "node_modules", "@playwright", "test", "cli.js");
const args = process.argv.slice(2);
const result = spawnSync(node, [cli, "test", ...args], {
  stdio: "inherit",
  env: { ...process.env, PATH: `${path.dirname(node)}${path.delimiter}${process.env.PATH ?? ""}` },
});
process.exit(result.status ?? 1);
