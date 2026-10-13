/**
 * ABI subset of chain/contracts/WorkProofAnchor.sol used by the app.
 * chain/test/WorkProofAnchor.test.ts checks it against the compiled artifact.
 */
export const workProofAnchorAbi = [
  {
    type: "function",
    name: "anchor",
    stateMutability: "nonpayable",
    inputs: [
      { name: "commitment", type: "bytes32" },
      { name: "contentHash", type: "bytes32" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "getAnchor",
    stateMutability: "view",
    inputs: [{ name: "commitment", type: "bytes32" }],
    outputs: [
      { name: "contentHash", type: "bytes32" },
      { name: "anchoredAt", type: "uint64" },
    ],
  },
  {
    type: "function",
    name: "anchorer",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
  {
    type: "event",
    name: "RecordAnchored",
    anonymous: false,
    inputs: [
      { name: "commitment", type: "bytes32", indexed: true },
      { name: "contentHash", type: "bytes32", indexed: false },
      { name: "anchoredAt", type: "uint64", indexed: false },
    ],
  },
  { type: "error", name: "NotAnchorer", inputs: [] },
  { type: "error", name: "ZeroValue", inputs: [] },
  { type: "error", name: "AlreadyAnchored", inputs: [{ name: "commitment", type: "bytes32" }] },
] as const;

/**
 * Explicit gas limit for anchor(). Monad charges for the gas *limit*, not gas
 * used, so this is kept tight. Measured usage is ~68,750 gas (two new storage
 * slots plus the event); chain/test/WorkProofAnchor.test.ts asserts that real
 * usage stays at least 20% below this limit.
 */
export const ANCHOR_GAS_LIMIT = BigInt(100_000);
