// Start `next dev` with Reticle verification instrumentation enabled (cross-platform).
import { spawn } from "node:child_process";
const child = spawn("npx", ["next", "dev", ...process.argv.slice(2)], { stdio: "inherit", shell: true, env: { ...process.env, RETICLE: "1" } });
child.on("exit", (code) => process.exit(code ?? 0));
