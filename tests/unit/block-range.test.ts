import assert from "node:assert/strict";
import { test } from "node:test";
import { MAX_LOG_RANGE_BLOCKS, splitBlockRange } from "../../lib/server/chain";

const b = (n: number) => BigInt(n);

/** Asserts chunks are newest-first, contiguous, within the limit, and cover [from, to] exactly once. */
function assertExactCover(from: bigint, to: bigint, chunks: { fromBlock: bigint; toBlock: bigint }[], max = MAX_LOG_RANGE_BLOCKS) {
  if (from > to) {
    assert.deepEqual(chunks, []);
    return;
  }
  assert.equal(chunks[0].toBlock, to, "first chunk ends at the newest block");
  assert.equal(chunks.at(-1)!.fromBlock, from, "last chunk starts at the oldest block");
  for (const [i, chunk] of chunks.entries()) {
    assert.ok(chunk.fromBlock <= chunk.toBlock, `chunk ${i} is not empty`);
    assert.ok(chunk.toBlock - chunk.fromBlock + b(1) <= max, `chunk ${i} spans at most ${max} blocks`);
    if (i > 0) assert.equal(chunks[i - 1].fromBlock, chunk.toBlock + b(1), `no gap or overlap before chunk ${i}`);
  }
  const covered = chunks.reduce((sum, c) => sum + (c.toBlock - c.fromBlock + b(1)), b(0));
  assert.equal(covered, to - from + b(1), "every block covered exactly once");
}

test("the per-query limit is 100 blocks", () => {
  assert.equal(MAX_LOG_RANGE_BLOCKS, b(100));
});

test("a range smaller than 100 blocks is one query", () => {
  const chunks = splitBlockRange(b(0), b(49));
  assert.deepEqual(chunks, [{ fromBlock: b(0), toBlock: b(49) }]);
  assertExactCover(b(0), b(49), chunks);
});

test("an exact 100-block range is one query", () => {
  const chunks = splitBlockRange(b(1), b(100));
  assert.deepEqual(chunks, [{ fromBlock: b(1), toBlock: b(100) }]);
  assertExactCover(b(1), b(100), chunks);
});

test("101 blocks need two queries, newest first", () => {
  const chunks = splitBlockRange(b(0), b(100));
  assert.deepEqual(chunks, [
    { fromBlock: b(1), toBlock: b(100) },
    { fromBlock: b(0), toBlock: b(0) },
  ]);
  assertExactCover(b(0), b(100), chunks);
});

test("the real recovery window (latest-1000 .. latest) is 11 compliant queries", () => {
  const latest = b(70_681_210);
  const from = latest - b(1000);
  const chunks = splitBlockRange(from, latest);
  assert.equal(chunks.length, 11);
  assertExactCover(from, latest, chunks);
});

test("a single block and an empty range", () => {
  assert.deepEqual(splitBlockRange(b(7), b(7)), [{ fromBlock: b(7), toBlock: b(7) }]);
  assert.deepEqual(splitBlockRange(b(8), b(7)), []);
});

test("exact cover holds for many sizes and offsets", () => {
  for (const start of [0, 1, 99, 100, 12_345]) {
    for (const size of [1, 2, 99, 100, 101, 199, 200, 201, 999, 1000, 1001]) {
      const from = b(start);
      const to = from + b(size - 1);
      assertExactCover(from, to, splitBlockRange(from, to));
    }
  }
});

test("a non-positive chunk size is rejected", () => {
  assert.throws(() => splitBlockRange(b(0), b(10), b(0)), RangeError);
});
