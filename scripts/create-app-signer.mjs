// Creates the WorkProof APPLICATION SIGNER (test-only Monad wallet) and stores
// its key in the git-ignored .env.local as WORKPROOF_ANCHOR_PRIVATE_KEY.
//
//   node scripts/create-app-signer.mjs
//
// - The key is generated in memory (viem) and appended to .env.local; it is
//   never printed or logged. Existing lines are never modified.
// - Refuses if WORKPROOF_ANCHOR_PRIVATE_KEY already exists (file or environment).
// - Prints only the public address. Deploy the contract with this address as
//   the `anchorer` so only this wallet can anchor.
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

const FILE = ".env.local";
const NAME = "WORKPROOF_ANCHOR_PRIVATE_KEY";
const line = new RegExp(`^\\s*${NAME}\\s*=\\s*(\\S*)\\s*$`, "m");

if (!existsSync(FILE)) {
  console.error(`${FILE} not found. Run this from the project root.`);
  process.exit(1);
}
try {
  execFileSync("git", ["check-ignore", "-q", FILE]);
} catch {
  console.error(`${FILE} is not git-ignored. Refusing to write a key into it.`);
  process.exit(1);
}
if (process.env[NAME] !== undefined || line.test(readFileSync(FILE, "utf8"))) {
  console.error(`${NAME} already exists. Nothing was changed.`);
  process.exit(1);
}

let key = generatePrivateKey();
const address = privateKeyToAccount(key).address;
const current = readFileSync(FILE, "utf8");
appendFileSync(
  FILE,
  `${current.endsWith("\n") || current.length === 0 ? "" : "\n"}` +
    `\n# WorkProof application signer (Monad TESTNET only; never real funds). Address: ${address}\n` +
    `${NAME}=${key}\n`,
  { encoding: "utf8", flag: "a" },
);
key = null;

// Verify without printing: the stored key must derive the same address.
const stored = readFileSync(FILE, "utf8").match(line)?.[1] ?? "";
const ok = /^0x[0-9a-fA-F]{64}$/.test(stored) && privateKeyToAccount(stored).address === address;
if (!ok) {
  console.error("Verification failed: the stored value does not match. Check .env.local manually.");
  process.exit(1);
}
console.log("Application signer created and stored in .env.local (value not shown).");
console.log(`Public address: ${address}`);
