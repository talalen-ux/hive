import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";

const PRIVATE_KEY = process.env.PRIVATE_KEY ?? "0x" + "11".repeat(32);
const RPC_URL = process.env.RPC_URL ?? "";

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: { enabled: true, runs: 200 },
      viaIR: true,
    },
  },
  networks: {
    hardhat: {},
    sepolia: {
      url: RPC_URL,
      accounts: [PRIVATE_KEY],
    },
    mainnet: {
      url: RPC_URL,
      accounts: [PRIVATE_KEY],
    },
  },
};

export default config;
