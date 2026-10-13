/**
 * Runs once when a server instance starts. Reports configuration problems early
 * instead of at first use. It does not stop the server: each affected feature
 * already fails closed on its own (sign-in disabled, database calls refused,
 * confirmation links not issued).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { findConfigProblems } = await import("./lib/server/config-check");
  const problems = findConfigProblems();
  if (problems.length > 0) {
    console.error(
      `[config] WorkProof configuration problems (affected features stay disabled until fixed):\n  - ${problems.join("\n  - ")}`,
    );
  }
}
