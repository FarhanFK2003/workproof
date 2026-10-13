/**
 * Read-only pre-deployment check. Sends NO transactions.
 *
 *   cd chain
 *   $env:MONAD_RPC_URL = "https://testnet-rpc.monad.xyz"
 *   npm run check:deployer
 *
 * Hardhat asks for your keystore password (hidden input) to unlock
 * MONAD_DEPLOYER_PRIVATE_KEY. The script then prints only public facts:
 * the chain, the deployer address Hardhat will use, its balance, and the
 * anchorer address from the parameters file, and checks they are as expected.
 */
import { readFileSync } from "node:fs";
import { network } from "hardhat";
import { formatEther, getAddress } from "viem";

const EXPECTED_CHAIN_ID = 10143;
const EXPECTED_DEPLOYER = getAddress("0x500Bc3da0f499485673129494ABf65C5ab9d8591"); // Wallet A (public)
const params = JSON.parse(readFileSync("ignition/parameters/monad-testnet.json", "utf8")) as {
  WorkProofAnchorModule: { anchorer: string };
};
const anchorer = getAddress(params.WorkProofAnchorModule.anchorer);

const { viem } = await network.getOrCreate();
const publicClient = await viem.getPublicClient();
const [wallet] = await viem.getWalletClients();
const chainId = await publicClient.getChainId();
const deployer = getAddress(wallet.account.address);
const balance = await publicClient.getBalance({ address: deployer });

const checks: [string, boolean][] = [
  [`chain is Monad testnet (${chainId})`, chainId === EXPECTED_CHAIN_ID],
  [`deployer is Wallet A (${deployer})`, deployer === EXPECTED_DEPLOYER],
  [`anchorer is a different wallet (${anchorer})`, anchorer !== deployer],
  [`deployer balance ${formatEther(balance)} MON covers deployment (>= 0.05)`, balance >= 50_000_000_000_000_000n],
];
for (const [label, ok] of checks) console.log(`${ok ? "OK  " : "FAIL"}  ${label}`);
if (checks.some(([, ok]) => !ok)) {
  console.log("\nDo not deploy until every check is OK.");
  process.exitCode = 1;
} else {
  console.log("\nAll checks passed. No transaction was sent.");
}
