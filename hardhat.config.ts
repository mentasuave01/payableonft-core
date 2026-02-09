import "dotenv/config";
import hardhatToolboxViemPlugin from "@nomicfoundation/hardhat-toolbox-viem";
import { configVariable, defineConfig } from "hardhat/config";

export default defineConfig({
  plugins: [hardhatToolboxViemPlugin],
  solidity: {
    profiles: {
      default: {
        version: "0.8.28",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
          remappings: [
            "@layerzerolabs/oapp-evm/contracts/=contracts/layerzero/oapp-evm/",
            "@layerzerolabs/lz-evm-protocol-v2/contracts/=contracts/layerzero/lz-evm-protocol-v2/",
            "@openzeppelin/contracts/=node_modules/@openzeppelin/contracts/",
          ],
        },
      },
      production: {
        version: "0.8.28",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
          remappings: [
            "@layerzerolabs/oapp-evm/contracts/=contracts/layerzero/oapp-evm/",
            "@layerzerolabs/lz-evm-protocol-v2/contracts/=contracts/layerzero/lz-evm-protocol-v2/",
            "@openzeppelin/contracts/=node_modules/@openzeppelin/contracts/",
          ],
        },
      },
    },
  },
  networks: {
    hardhatMainnet: {
      type: "edr-simulated",
      chainType: "l1",
    },
    hardhatOp: {
      type: "edr-simulated",
      chainType: "op",
    },
    sepolia: {
      type: "http",
      chainType: "l1",
      url: configVariable("SEPOLIA_RPC_URL"),
      accounts: [configVariable("PRIVATE_KEY")],
    },
    arbitrumSepolia: {
      type: "http",
      chainType: "l1",
      chainId: 421614,
      url: configVariable("ARBITRUM_SEPOLIA_RPC_URL"),
      accounts: [configVariable("PRIVATE_KEY")],
    },
    optimismSepolia: {
      type: "http",
      chainType: "op",
      chainId: 11155420,
      url: configVariable("OPTIMISM_SEPOLIA_RPC_URL"),
      accounts: [configVariable("PRIVATE_KEY")],
    },
  },
});
