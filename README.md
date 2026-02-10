# PayableONFT Deployment Guide

## Contract Overview
`PayableONFT` is an Omnichain NFT (ONFT) contract built on LayerZero V2. It implements a **Centralized Minting** architecture where all NFTs are minted sequentially on a single **Origin Chain** to ensure unique ID generation, while allowing users to mint from **any connected chain**.

### Key Features
- **Centralized Minting**: All tokens are minted on the configured **Origin Chain** (e.g., Arbitrum Sepolia).
- **Cross-Chain Minting**: Users on remote chains pay in USDC, and the contract automatically sends a request to the Origin Chain to mint and bridge the NFT back to them.
- **USDC Payment**: Users pay 10 USDC (default) to mint.
- **Native Drop**: The Origin Chain contract can be funded to cover the gas costs of bridging newly minted NFTs back to remote users.
- **Pausable**: Admin can pause minting globally.

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

3.  **Configure Origin Chain**:
    Open `scripts/constants.ts` and set `ORIGIN_NETWORK` to your desired Origin Chain (default: `arbitrumSepolia`).
    ```typescript
    export const ORIGIN_NETWORK: NetworkName = "arbitrumSepolia";
    ```

## Deployment Steps

Deploy the contract to **each network** you want to support. You can start with 2 (Origin + 1 Remote) and add more later.

### 1. Deploy to Each Network
```bash
# Deploy to Origin (e.g., Arbitrum Sepolia)
bunx hardhat run scripts/deploy.ts --network arbitrumSepolia --profile production

# Deploy to Remote (e.g., Optimism Sepolia, Sepolia)
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

### 3. Fund Origin Contract
**Crucial**: The `PayableONFT` contract on the **Origin Chain** must have native tokens (ETH) to pay for the gas of bridging NFTs back to remote users.
-   Send some ETH (e.g., 0.1 ETH) to the deployed `PayableONFT` address on the **Origin Chain**.

## Usage

### Minting (on Origin Chain)
Minting on the Origin Chain is instant and local.
```bash
bunx hardhat run scripts/mint.ts --network arbitrumSepolia
```

### Minting (from Remote Chain)
Minting from a remote chain sends a request to Origin.
```bash
# Mint on Optimism (Remote), receive NFT on Optimism (bridged from Arbitrum)
bunx hardhat run scripts/mint.ts --network optimismSepolia
```
*Note: The `mintAndBridge` script is no longer the primary method for this architecture, as `mint()` handles cross-chain requests automatically on remote chains.*

## Adding a New Network

To add support for a new chain (e.g., Base Sepolia):

1.  **`scripts/constants.ts`** — Add entries to `LZ_ENDPOINTS`, `LZ_EIDS`, `USDC_ADDRESSES`, `CHAIN_IDS`.
2.  **`hardhat.config.ts`** — Add a new network entry.
3.  **`.env`** — Add the RPC URL.
4.  **`deployments.json`** — Add `"baseSepolia": ""`.
5.  **Deploy & Peer**:
    ```bash
    bunx hardhat run scripts/deploy.ts --network baseSepolia --profile production
    # Then re-run setPeer on ALL chains:
    bunx hardhat run scripts/setPeer.ts --network baseSepolia
    bunx hardhat run scripts/setPeer.ts --network arbitrumSepolia
    # ... etc
    ```
