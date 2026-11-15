import { defineConfig } from "vite";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

export default defineConfig({
  base: "./",
  plugins: [{
    name: "version-offline-shell",
    writeBundle(options, bundle) {
      // Every changed build gets a separate, complete offline shell.
      const hash = createHash("sha256");
      for (const key of Object.keys(bundle).sort()) {
        const item = bundle[key];
        hash.update(item.type === "chunk" ? item.code : item.source);
      }
      // Include public data, fonts and the worker itself in release identity.
      for (const entry of readdirSync("public", { recursive: true, withFileTypes: true })
        .filter((entry) => entry.isFile())
        .sort((a, b) => resolve(a.parentPath, a.name).localeCompare(resolve(b.parentPath, b.name)))) {
        hash.update(entry.name);
        hash.update(readFileSync(resolve(entry.parentPath, entry.name)));
      }
      const worker = resolve(options.dir ?? "dist", "offline-worker.js");
      writeFileSync(worker, readFileSync(worker, "utf8").replace("__APP_VERSION__", hash.digest("hex").slice(0, 16)));
    },
  }],
});
