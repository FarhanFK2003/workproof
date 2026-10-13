// Preloaded by the unit-test runner. Next.js resolves `import "server-only"` at
// compile time; plain Node needs a stand-in so server modules can be unit-tested.
const Module = require("node:module");

const originalResolve = Module._resolveFilename;
Module._resolveFilename = function resolve(request, ...rest) {
  if (request === "server-only") return __filename; // resolves to this (empty) module
  return originalResolve.call(this, request, ...rest);
};
