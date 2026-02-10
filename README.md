# PayableONFT Deployment Guide

## Contract Overview
`PayableONFT` is an Omnichain NFT (ONFT) contract built on LayerZero V2 that allows users to mint NFTs by paying with USDC. It supports cross-chain functionality, enabling users to mint on one chain and bridge to **any connected chain** in a single transaction.

### Key Features
- **USDC Payment**: Users pay 10 USDC(default) to mint an NFT.
- **Multi-Chain**: Deploy to as many networks as needed. Add new networks at any time.
- **Cross-Chain Minting**: `mintAndBridge` function mints locally and transfers to any destination chain.
- **Pausable**: Admin can pause minting in case of emergencies.
- **Collision Prevention**: Uses a chain-specific prefix for token IDs to ensure uniqueness across chains.
- **Owner Controls**: Admin can withdraw collected USDC and update the USDC token address.

## Prerequisites

1.  **Node.js**: v18+ recommended (v22+ required for Hardhat 3).
2.  **Bun**: Used as the package manager.
3.  **Wallet**: Private key with native gas (ETH/SepoliaETH) and testnet USDC on deployment chains.
4.  **RPC URLs**: Endpoints for each network you plan to deploy to.

## Setup

1.  **Install Dependencies**:
    ```bash
    bun install
    ```

2.  **Environment Variables**:
    Create a `.env` file in the root directory:
    ```ini
    PRIVATE_KEY=your_private_key_here
    ARBITRUM_SEPOLIA_RPC_URL=https://sepolia-rollup.arbitrum.io/rpc
    OPTIMISM_SEPOLIA_RPC_URL=https://sepolia.optimism.io
    SEPOLIA_RPC_URL=https://rpc.ankr.com/eth_sepolia
    ```

## Deployment Steps

Deploy the contract to **each network** you want to support. You can start with 2 and add more later.

### 1. Deploy to Each Network
```bash
# Deploy to as many networks as needed:
bunx hardhat run scripts/deploy.ts --network arbitrumSepolia --profile production
bunx hardhat run scripts/deploy.ts --network optimismSepolia --profile production
bunx hardhat run scripts/deploy.ts --network sepolia --profile production
```
Each deployment auto-saves the contract address to `deployments.json`.

### 2. Connect All Networks (Set Peers)
After deploying to all desired chains, run `setPeer` on **each chain**. The script automatically connects to all other deployed chains:
```bash
bunx hardhat run scripts/setPeer.ts --network arbitrumSepolia
bunx hardhat run scripts/setPeer.ts --network optimismSepolia
bunx hardhat run scripts/setPeer.ts --network sepolia
```

> **Note:** Each chain needs to know about all its peers. Run `setPeer` once per deployed chain.

## Usage

### Minting (Local Chain)
Mint an NFT on the current chain:
```bash
bunx hardhat run scripts/mint.ts --network arbitrumSepolia
```

### Minting & Bridging (Cross-Chain)
Mint and bridge to any connected chain using the `DESTINATION` env var:
```bash
# Mint on Arbitrum, bridge to Optimism:
DESTINATION=optimismSepolia bunx hardhat run scripts/mintAndBridge.ts --network arbitrumSepolia

# Mint on Arbitrum, bridge to Sepolia:
DESTINATION=sepolia bunx hardhat run scripts/mintAndBridge.ts --network arbitrumSepolia

# Mint on Optimism, bridge to Arbitrum:
DESTINATION=arbitrumSepolia bunx hardhat run scripts/mintAndBridge.ts --network optimismSepolia
```

## Adding a New Network

To add support for a new chain (e.g., Base Sepolia):

1.  **`scripts/constants.ts`** — Add entries to `LZ_ENDPOINTS`, `LZ_EIDS`, `USDC_ADDRESSES`, `CHAIN_IDS`
2.  **`hardhat.config.ts`** — Add a new network entry
3.  **`.env`** — Add the RPC URL (e.g., `BASE_SEPOLIA_RPC_URL=...`)
4.  **`deployments.json`** — Add `"baseSepolia": ""`
5.  **Deploy & Peer**:
    ```bash
    bunx hardhat run scripts/deploy.ts --network baseSepolia --profile production
    # Then re-run setPeer on ALL chains (including the new one):
    bunx hardhat run scripts/setPeer.ts --network baseSepolia
    bunx hardhat run scripts/setPeer.ts --network arbitrumSepolia
    bunx hardhat run scripts/setPeer.ts --network optimismSepolia
    ```

## Troubleshooting

-   **Contract too large**: Ensure you use `--profile production` to enable the optimizer.
-   **NotEnoughNative**: Ensure you send enough ETH in `value` for the cross-chain fee (the script handles this).
-   **NoPeer**: Ensure you ran `setPeer.ts` on ALL chains, not just one.
-   **No deployment found**: Run `deploy.ts` on that network first. Addresses are stored in `deployments.json`.
