import hardhatIgnition from "@nomicfoundation/hardhat-ignition";
import hardhatIgnitionViem from "@nomicfoundation/hardhat-ignition-viem";
import hardhatKeystore from "@nomicfoundation/hardhat-keystore";
import hardhatNodeTestRunner from "@nomicfoundation/hardhat-node-test-runner";
import hardhatViem from "@nomicfoundation/hardhat-viem";
import { configVariable, defineConfig } from "hardhat/config";

export default defineConfig({
  plugins: [hardhatViem, hardhatNodeTestRunner, hardhatIgnition, hardhatIgnitionViem, hardhatKeystore],
  solidity: {
    version: "0.8.34",
    settings: {
      // Monad's deployment guide: set evmVersion "osaka".
      evmVersion: "osaka",
      optimizer: { enabled: true, runs: 200 },
    },
  },
  networks: {
    // Official values: https://docs.monad.xyz/developer-essentials/testnet
    // Secrets come from the encrypted Hardhat keystore or environment variables:
    //   npx hardhat keystore set MONAD_DEPLOYER_PRIVATE_KEY
    //   npx hardhat keystore set MONAD_RPC_URL   (e.g. https://testnet-rpc.monad.xyz)
    monadTestnet: {
      type: "http",
      chainType: "l1",
      chainId: 10143,
      url: configVariable("MONAD_RPC_URL"),
      accounts: [configVariable("MONAD_DEPLOYER_PRIVATE_KEY")],
    },
  },
});
