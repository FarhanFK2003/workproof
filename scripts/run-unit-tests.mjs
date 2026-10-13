// Compiles the unit tests (and the modules they import) with the project's
// TypeScript, then runs them with Node's built-in test runner. No extra deps.
import { spawnSync } from "node:child_process";
import { rmSync } from "node:fs";

const run = (args) => spawnSync(process.execPath, args, { stdio: "inherit" }).status ?? 1;

rmSync(".test-build", { recursive: true, force: true });
if (run(["node_modules/typescript/bin/tsc", "-p", "tsconfig.test.json"]) !== 0) process.exit(1);
process.exit(
  run(["--require", "./tests/setup/server-only-stub.cjs", "--test", ".test-build/tests/unit/**/*.test.js"]),
);
