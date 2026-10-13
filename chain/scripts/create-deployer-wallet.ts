/**
 * Creates a NEW, test-only Monad deployer wallet and stores its private key in
 * Hardhat's encrypted keystore as MONAD_DEPLOYER_PRIVATE_KEY.
 *
 * Run it yourself, in your own terminal (it asks for a password):
 *   cd chain
 *   npx hardhat run scripts/create-deployer-wallet.ts
 *
 * - The key is generated in memory with viem and handed straight to Hardhat's
 *   own `keystore set` task. It is never printed, logged, or written in
 *   plaintext anywhere.
 * - You type the keystore password (hidden input). The script answers only the
 *   "Enter secret" prompt itself.
 * - It refuses to overwrite an existing MONAD_DEPLOYER_PRIVATE_KEY.
 * - It prints only the public address, which is safe to share.
 */
import hre from "hardhat";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

const KEY_NAME = "MONAD_DEPLOYER_PRIVATE_KEY";
// Prompt text used by @nomicfoundation/hardhat-keystore for the secret value.
const SECRET_PROMPT_PREFIX = "Enter secret to store";

type SecretInput = (interruptor: string, description: string) => Promise<string>;

async function main() {
  if (process.env[KEY_NAME] !== undefined) {
    console.error(
      `${KEY_NAME} is set as an environment variable. Hardhat would use it instead of the keystore. ` +
        "Close this terminal (or remove the variable) and run the script again.",
    );
    process.exitCode = 1;
    return;
  }

  let privateKey: string | null = generatePrivateKey();
  const address = privateKeyToAccount(privateKey as `0x${string}`).address;

  const interruptions = hre.interruptions as unknown as { requestSecretInput: SecretInput };
  const askUser = interruptions.requestSecretInput.bind(hre.interruptions);
  let secretProvided = false;
  interruptions.requestSecretInput = async (interruptor, description) => {
    if (description.startsWith(SECRET_PROMPT_PREFIX) && privateKey) {
      secretProvided = true;
      return privateKey;
    }
    return askUser(interruptor, description); // password prompts: you type them
  };

  console.log(`Storing a new test-only key in the Hardhat keystore as ${KEY_NAME}.`);
  console.log("Choose a keystore password (at least 8 characters) when asked. It is not shown as you type.\n");

  try {
    await hre.tasks.getTask(["keystore", "set"]).run({ key: KEY_NAME, force: false, dev: false });
  } finally {
    privateKey = null; // drop the only in-memory reference
    interruptions.requestSecretInput = askUser;
  }

  if (!secretProvided || process.exitCode) {
    console.log("\nNo new key was stored, so nothing changed. (If the key already exists, it was left untouched.)");
    process.exitCode = 1;
    return;
  }

  console.log("\nDone. Public address of your new Monad testnet deployer wallet:");
  console.log(`  ${address}`);
  console.log("\nThis address is safe to share. Fund it at https://faucet.monad.xyz/ (testnet MON only).");
  console.log("Never use this wallet for real funds.");
}

await main();
