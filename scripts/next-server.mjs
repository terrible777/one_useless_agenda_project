import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const next = fileURLToPath(new URL("../node_modules/next/dist/bin/next", import.meta.url));
const result = spawnSync(process.execPath, [next, ...process.argv.slice(2)], {
  env: { ...process.env, AGENDA_BUILD_TARGET: "server" },
  stdio: "inherit",
});
if (result.error) console.error(result.error);
process.exit(result.status ?? 1);
