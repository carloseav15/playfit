import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(here, "..");
const repoRoot = path.resolve(appRoot, "../..");
const targetPublic = path.join(appRoot, "public");

async function copyIfExists(source, destination) {
  try {
    await fs.cp(source, destination, { recursive: true });
  } catch (error) {
    if (error?.code !== "ENOENT") {
      throw error;
    }
  }
}

await fs.rm(targetPublic, { recursive: true, force: true });
await fs.mkdir(path.join(targetPublic, "data"), { recursive: true });

await copyIfExists(path.join(repoRoot, "public"), targetPublic);
await copyIfExists(path.join(repoRoot, "data/public"), path.join(targetPublic, "data/public"));
