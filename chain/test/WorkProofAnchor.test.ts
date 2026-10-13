import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { network } from "hardhat";
import { keccak256, toHex, zeroAddress, type Hex } from "viem";
import { ANCHOR_GAS_LIMIT, workProofAnchorAbi } from "../../lib/anchoring/abi.ts";

const ZERO = `0x${"0".repeat(64)}` as Hex;
const commitment = keccak256(toHex("commitment-1"));
const contentHash = keccak256(toHex("content-1"));

/** Runs a write expected to revert and returns the error text for matching. */
async function revertText(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    return String((error as Error).message);
  }
  assert.fail("expected the call to revert");
}

describe("WorkProofAnchor", async () => {
  const { viem } = await network.create();
  const publicClient = await viem.getPublicClient();
  const [owner, stranger] = await viem.getWalletClients();

  async function deploy() {
    return viem.deployContract("WorkProofAnchor", [owner.account.address]);
  }

  it("anchors a commitment, stores it, and emits RecordAnchored", async () => {
    const contract = await deploy();
    const txHash = await contract.write.anchor([commitment, contentHash]);
    const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
    assert.equal(receipt.status, "success");

    const [storedHash, anchoredAt] = await contract.read.getAnchor([commitment]);
    assert.equal(storedHash, contentHash);
    assert.ok(anchoredAt > 0n);

    const events = await contract.getEvents.RecordAnchored({}, { fromBlock: receipt.blockNumber });
    assert.equal(events.length, 1);
    assert.equal(events[0].args.commitment, commitment);
    assert.equal(events[0].args.contentHash, contentHash);
    assert.equal(events[0].args.anchoredAt, anchoredAt);
  });

  it("returns zero values for an unknown commitment", async () => {
    const contract = await deploy();
    const [storedHash, anchoredAt] = await contract.read.getAnchor([keccak256(toHex("unknown"))]);
    assert.equal(storedHash, ZERO);
    assert.equal(anchoredAt, 0n);
  });

  it("rejects a duplicate commitment, even with a different content hash", async () => {
    const contract = await deploy();
    await contract.write.anchor([commitment, contentHash]);
    const message = await revertText(contract.write.anchor([commitment, keccak256(toHex("content-2"))]));
    assert.match(message, /AlreadyAnchored/);
    const [storedHash] = await contract.read.getAnchor([commitment]);
    assert.equal(storedHash, contentHash, "the original anchor is unchanged");
  });

  it("rejects callers other than the anchorer", async () => {
    const contract = await deploy();
    const asStranger = await viem.getContractAt("WorkProofAnchor", contract.address, { client: { wallet: stranger } });
    assert.match(await revertText(asStranger.write.anchor([commitment, contentHash])), /NotAnchorer/);
    const [, anchoredAt] = await contract.read.getAnchor([commitment]);
    assert.equal(anchoredAt, 0n);
  });

  it("supports a separate application signer: only it can anchor, not the deployer", async () => {
    // Deployed by `owner` (the deployer wallet) with `stranger` as the app signer.
    const contract = await viem.deployContract("WorkProofAnchor", [stranger.account.address]);
    assert.equal((await contract.read.anchorer()).toLowerCase(), stranger.account.address.toLowerCase());

    assert.match(await revertText(contract.write.anchor([commitment, contentHash])), /NotAnchorer/, "deployer refused");

    const asSigner = await viem.getContractAt("WorkProofAnchor", contract.address, { client: { wallet: stranger } });
    const txHash = await asSigner.write.anchor([commitment, contentHash]);
    assert.equal((await publicClient.waitForTransactionReceipt({ hash: txHash })).status, "success");
    const [storedHash] = await contract.read.getAnchor([commitment]);
    assert.equal(storedHash, contentHash);
  });

  it("rejects zero commitment or zero content hash", async () => {
    const contract = await deploy();
    assert.match(await revertText(contract.write.anchor([ZERO, contentHash])), /ZeroValue/);
    assert.match(await revertText(contract.write.anchor([commitment, ZERO])), /ZeroValue/);
  });

  it("cannot be deployed without an anchorer", async () => {
    assert.match(await revertText(viem.deployContract("WorkProofAnchor", [zeroAddress])), /ZeroAnchorer/);
  });

  it("stays well below the app's fixed gas limit", async () => {
    const contract = await deploy();
    const txHash = await contract.write.anchor([keccak256(toHex("gas")), contentHash]);
    const { gasUsed } = await publicClient.waitForTransactionReceipt({ hash: txHash });
    assert.ok((gasUsed * 12n) / 10n < ANCHOR_GAS_LIMIT, `gasUsed ${gasUsed} needs 20% headroom under ${ANCHOR_GAS_LIMIT}`);
  });

  it("matches the ABI the app uses", async () => {
    const contract = await deploy();
    const signature = (item: { type: string; name?: string; inputs?: readonly { type: string }[] }) =>
      `${item.type}:${item.name}(${(item.inputs ?? []).map((i) => i.type).join(",")})`;
    const compiled = new Set(contract.abi.map(signature));
    for (const item of workProofAnchorAbi) {
      assert.ok(compiled.has(signature(item)), `missing in contract: ${signature(item)}`);
    }
  });
});
