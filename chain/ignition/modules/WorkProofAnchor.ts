import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

// Deploys WorkProofAnchor. The `anchorer` (the only address allowed to anchor)
// must be given explicitly. It is the application signer, not the deployer:
//   --parameters ignition/parameters/monad-testnet.json
// There is deliberately no default, so a forgotten parameter fails before any
// transaction is sent instead of making the deployer the anchorer.
export default buildModule("WorkProofAnchorModule", (m) => {
  const anchorer = m.getParameter<string>("anchorer");
  const workProofAnchor = m.contract("WorkProofAnchor", [anchorer]);
  return { workProofAnchor };
});
