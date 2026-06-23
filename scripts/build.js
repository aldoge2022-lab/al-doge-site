const fs = require("fs/promises");
const path = require("path");

const ROOT_DIR = path.resolve(__dirname, "..");
const OUTPUT_DIR = path.join(ROOT_DIR, "public");

const EXCLUDED_NAMES = new Set([
  ".git",
  ".netlify",
  "node_modules",
  "netlify",
  "public",
  "package.json",
  "package-lock.json",
  "README.md",
  "SETUP_GUIDE.md",
  "MIGRATION_INSTRUCTIONS.md",
  "DELIVERABLES.md",
]);

async function copyRootAssets() {
  await fs.rm(OUTPUT_DIR, { recursive: true, force: true });
  await fs.mkdir(OUTPUT_DIR, { recursive: true });

  const entries = await fs.readdir(ROOT_DIR, { withFileTypes: true });
  await Promise.all(
    entries.map(async (entry) => {
      if (EXCLUDED_NAMES.has(entry.name)) {
        return;
      }

      const source = path.join(ROOT_DIR, entry.name);
      const destination = path.join(OUTPUT_DIR, entry.name);
      await fs.cp(source, destination, { recursive: true });
    })
  );
}

copyRootAssets().catch((error) => {
  console.error("Build failed:", error);
  process.exit(1);
});
