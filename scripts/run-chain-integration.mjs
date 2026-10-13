// Runs tests/integration against a throwaway local Hardhat node (chain 31337).
// No Supabase, no testnet, no real funds. Requires: cd chain && npm install && npx hardhat build
import { spawn, spawnSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import path from "node:path";

const port = 8545;
const rpc = `http://127.0.0.1:${port}`;
const artifact = path.join("chain", "artifacts", "contracts", "WorkProofAnchor.sol", "WorkProofAnchor.json");
if (!existsSync(artifact)) {
  console.error("Missing contract artifact. Run: cd chain && npm install && npx hardhat build");
  process.exit(2);
}

const run = (args) => spawnSync(process.execPath, args, { stdio: "inherit" }).status ?? 1;
rmSync(".test-build", { recursive: true, force: true });
if (run(["node_modules/typescript/bin/tsc", "-p", "tsconfig.test.json"]) !== 0) process.exit(1);

const node = spawn(process.execPath, ["node_modules/hardhat/dist/src/cli.js", "node", "--port", String(port)], {
  cwd: "chain",
  stdio: "ignore",
});
let ready = false;
for (let i = 0; i < 120 && !ready; i++) {
  try {
    const res = await fetch(rpc, { method: "POST", headers: { "content-type": "application/json" }, body: '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}' });
    ready = res.ok;
  } catch {
    await new Promise((r) => setTimeout(r, 250));
  }
}
if (!ready) {
  node.kill();
  console.error("Local Hardhat node did not start.");
  process.exit(1);
}

const status = spawnSync(
  process.execPath,
  ["--require", "./tests/setup/server-only-stub.cjs", "--test", ".test-build/tests/integration/**/*.test.js"],
  { stdio: "inherit", env: { ...process.env, CHAIN_IT_RPC_URL: rpc } },
).status;
node.kill();
process.exit(status ?? 1);
