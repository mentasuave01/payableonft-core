# PayableONFT Deployment Guide

## Contract Overview
`PayableONFT` is an Omnichain NFT (ONFT) contract built on LayerZero V2 that allows users to mint NFTs by paying with USDC. It supports cross-chain functionality, enabling users to mint on one chain and bridge to another in a single transaction.

### Key Features
- **USDC Payment**: Users pay 10 USDC to mint an NFT.
- **Cross-Chain Minting**: `mintAndBridge` function mints locally and transfers to a destination chain.
- **Pausable**: Admin can pause minting in case of emergencies.
- **Collision Prevention**: Uses a chain-specific prefix for token IDs to ensure uniqueness across chains.
- **Owner Controls**: Admin can withdraw collected USDC and update the USDC token address.

## Prerequisites

1.  **Node.js**: v18+ recommended (v22+ required for Hardhat 3).
2.  **Bun**: Used as the package manager.
3.  **Wallet**: Private key with native gas (ETH/SepoliaETH) and testnet USDC on deployment chains.
4.  **RPC URLs**: endpoints for Arbitrum Sepolia and Optimism Sepolia.

## Setup

1.  **Install Dependencies**:
    ```bash
    bun install
    ```

2.  **Environment Variables**:
    Create a `.env` file in the root directory:
    ```ini
    PRIVATE_KEY=your_private_key_here
    SEPOLIA_RPC_URL=https://rpc.ankr.com/eth_sepolia
    ARBITRUM_SEPOLIA_RPC_URL=https://sepolia-rollup.arbitrum.io/rpc
    OPTIMISM_SEPOLIA_RPC_URL=https://sepolia.optimism.io
    ```

## Deployment Steps

Deploy the contract to **Arbitrum Sepolia** and **Optimism Sepolia**.

### 1. Deploy to Arbitrum Sepolia
```bash
bunx hardhat run scripts/deploy.ts --network arbitrumSepolia --profile production
```
*   Expected Output: `PayableONFT deployed to: 0x...`
*   **Save this address.**

### 2. Deploy to Optimism Sepolia
```bash
bunx hardhat run scripts/deploy.ts --network optimismSepolia --profile production
```
*   Expected Output: `PayableONFT deployed to: 0x...`
*   **Save this address.**

## Post-Deployment Configuration

After deploying to both chains, you must connect them by setting each other as peers.

### 1. Update Configuration Script
Open `scripts/setPeer.ts` and update the constants:

```typescript
// scripts/setPeer.ts
const ARB_SEP_CONTRACT = "0x..."; // Your Arbitrum Sepolia contract address
const OPT_SEP_CONTRACT = "0x..."; // Your Optimism Sepolia contract address
```

### 2. Set Peers
Run the script on both networks to establish the connection:

```bash
# Connect Arbitrum -> Optimism
bunx hardhat run scripts/setPeer.ts --network arbitrumSepolia

# Connect Optimism -> Arbitrum
bunx hardhat run scripts/setPeer.ts --network optimismSepolia
```

## Verification

### Minting (Local Chain)
To test minting on a single chain:
1.  Update `scripts/mint.ts` with your contract address.
2.  Run:
    ```bash
    bunx hardhat run scripts/mint.ts --network arbitrumSepolia
    ```

### Minting & Bridging (Cross-Chain)
To test minting and bridging in one go:
1.  Update `scripts/mintAndBridge.ts` with your contract addresses.
2.  Run:
    ```bash
    bunx hardhat run scripts/mintAndBridge.ts --network arbitrumSepolia
    ```

## Troubleshooting

-   **Contract too large**: Ensure you use `--profile production` to enable the optimizer.
-   **NotEnoughNative**: Ensure you send enough ETH in `value` for the cross-chain fee (the script handles this).
-   **NoPeer**: Ensure you ran `setPeer.ts` on BOTH chains.
