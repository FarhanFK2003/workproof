import "server-only";

/*
 * Monad anchoring configuration (server-only; never NEXT_PUBLIC_).
 *
 *   MONAD_RPC_URL                      e.g. https://testnet-rpc.monad.xyz
 *   MONAD_CHAIN_ID                     10143 (Monad testnet). 31337 (local
 *                                      Hardhat) is allowed outside production.
 *                                      Mainnet (143) is always refused.
 *   WORKPROOF_ANCHOR_CONTRACT_ADDRESS  Deployed WorkProofAnchor address.
 *   WORKPROOF_ANCHOR_PRIVATE_KEY       Testnet-only signing key. Optional:
 *                                      without it, verification still works
 *                                      but anchoring is disabled.
 *   MONAD_EXPLORER_URL                 Optional. Defaults to Monadscan testnet.
 *   WORKPROOF_ALLOW_LOCAL_CHAIN        Testing only: "true" permits the local
 *                                      Hardhat chain (31337, http localhost)
 *                                      under `next start`. Reported at startup.
 *
 * Official network values: https://docs.monad.xyz/developer-essentials/testnet
 * With none of these set, anchoring is simply off and the rest of the app works.
 */

export const MONAD_TESTNET_CHAIN_ID = 10143;
const MONAD_MAINNET_CHAIN_ID = 143;
const LOCAL_HARDHAT_CHAIN_ID = 31337;
const DEFAULT_TESTNET_EXPLORER = "https://testnet.monadscan.com";

export class AnchorConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AnchorConfigError";
  }
}

export interface AnchorReadConfig {
  rpcUrl: string;
  chainId: number;
  contractAddress: `0x${string}`;
  /** Explorer origin, or null for a local chain. */
  explorerUrl: string | null;
}

export interface AnchorWriteConfig extends AnchorReadConfig {
  privateKey: `0x${string}`;
}

const READ_VARS = ["MONAD_RPC_URL", "MONAD_CHAIN_ID", "WORKPROOF_ANCHOR_CONTRACT_ADDRESS"] as const;

function isLocalHost(hostname: string) {
  return hostname === "localhost" || hostname === "127.0.0.1";
}

/** Null when anchoring is not configured at all. Throws AnchorConfigError when misconfigured. */
export function readAnchorReadConfig(): AnchorReadConfig | null {
  const set = READ_VARS.filter((name) => process.env[name]?.trim());
  if (set.length === 0 && !process.env.WORKPROOF_ANCHOR_PRIVATE_KEY?.trim()) return null;
  const missing = READ_VARS.filter((name) => !process.env[name]?.trim());
  if (missing.length > 0) {
    throw new AnchorConfigError(`Monad anchoring is partly configured; missing ${missing.join(", ")}.`);
  }

  const production = process.env.NODE_ENV === "production";
  const allowLocal = !production || process.env.WORKPROOF_ALLOW_LOCAL_CHAIN === "true";
  const chainId = Number(process.env.MONAD_CHAIN_ID);
  if (chainId === MONAD_MAINNET_CHAIN_ID) {
    throw new AnchorConfigError("MONAD_CHAIN_ID 143 is Monad mainnet; WorkProof only anchors on testnet.");
  }
  const allowed = allowLocal ? [MONAD_TESTNET_CHAIN_ID, LOCAL_HARDHAT_CHAIN_ID] : [MONAD_TESTNET_CHAIN_ID];
  if (!Number.isInteger(chainId) || !allowed.includes(chainId)) {
    throw new AnchorConfigError(`MONAD_CHAIN_ID must be ${allowed.join(" or ")}.`);
  }

  let rpc: URL;
  try {
    rpc = new URL(process.env.MONAD_RPC_URL!.trim());
  } catch {
    throw new AnchorConfigError("MONAD_RPC_URL must be an absolute URL.");
  }
  const localHttp = rpc.protocol === "http:" && isLocalHost(rpc.hostname) && allowLocal;
  if (rpc.protocol !== "https:" && !localHttp) {
    throw new AnchorConfigError("MONAD_RPC_URL must use https (http only for a local node in development).");
  }
  if (rpc.username || rpc.password) {
    throw new AnchorConfigError("MONAD_RPC_URL must not contain credentials.");
  }

  const contract = process.env.WORKPROOF_ANCHOR_CONTRACT_ADDRESS!.trim();
  if (!/^0x[0-9a-fA-F]{40}$/.test(contract)) {
    throw new AnchorConfigError("WORKPROOF_ANCHOR_CONTRACT_ADDRESS must be a 0x-prefixed 20-byte address.");
  }

  let explorerUrl: string | null = chainId === MONAD_TESTNET_CHAIN_ID ? DEFAULT_TESTNET_EXPLORER : null;
  const explorerRaw = process.env.MONAD_EXPLORER_URL?.trim();
  if (explorerRaw) {
    let explorer: URL;
    try {
      explorer = new URL(explorerRaw);
    } catch {
      throw new AnchorConfigError("MONAD_EXPLORER_URL must be an absolute https URL.");
    }
    if (explorer.protocol !== "https:" || explorer.pathname !== "/" || explorer.search || explorer.hash) {
      throw new AnchorConfigError("MONAD_EXPLORER_URL must be an https origin.");
    }
    explorerUrl = explorer.origin;
  }

  return {
    rpcUrl: rpc.toString().replace(/\/$/, ""),
    chainId,
    contractAddress: contract.toLowerCase() as `0x${string}`,
    explorerUrl,
  };
}

/** Null when signing is not configured. Throws AnchorConfigError when misconfigured. */
export function readAnchorWriteConfig(): AnchorWriteConfig | null {
  const read = readAnchorReadConfig();
  const key = process.env.WORKPROOF_ANCHOR_PRIVATE_KEY?.trim();
  if (!read || !key) return null;
  if (!/^0x[0-9a-fA-F]{64}$/.test(key)) {
    throw new AnchorConfigError("WORKPROOF_ANCHOR_PRIVATE_KEY must be a 0x-prefixed 32-byte hex key.");
  }
  return { ...read, privateKey: key as `0x${string}` };
}

export function explorerTxUrl(explorerUrl: string | null, txHash: string): string | null {
  return explorerUrl ? `${explorerUrl}/tx/${txHash}` : null;
}

export function explorerAddressUrl(explorerUrl: string | null, address: string): string | null {
  return explorerUrl ? `${explorerUrl}/address/${address}` : null;
}
