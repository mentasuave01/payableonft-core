# PayableONFT — Lazy Bridge Architecture

## Contract Overview
`PayableONFT` is an Omnichain NFT (ONFT) contract built on LayerZero V2. It implements a **Lazy Bridge** minting architecture where all NFTs are minted on a single **Origin Chain**, and users can bridge them to any connected chain on-demand via the standard ONFT `send()`.

### Key Features
- **Centralized Minting**: All tokens are minted on the configured **Origin Chain** (e.g., Arbitrum).
- **Cross-Chain Minting**: Users on remote chains pay USDC locally, and a lightweight 20-byte LZ message triggers minting on Origin. The NFT stays on Origin until the user bridges it.
- **Lazy Bridging**: NFTs live on Origin after minting. Users bridge to their preferred chain whenever they want via standard ONFT `send()`.
- **Gas Optimized**: Only 1 LZ message per cross-chain mint (no round-trip), minimal message size (20 bytes vs 64+), no NativeDrop overhead.
- **USDC Payment**: Users pay 10 USDC (default) to mint.
- **Pausable**: Admin can pause minting globally.

### Cross-Chain Mint Flow

```
Remote Chain                         Origin Chain
┌──────────────────┐                 ┌──────────────────┐
│ User calls mint()│                 │                  │
│ Pays 10 USDC     │  ── 20 bytes ──>│ Receives message │
│ Pays LZ fee      │   (1 LZ msg)   │ Mints NFT to user│
└──────────────────┘                 │ ✅ Done!          │
                                     └──────────────────┘
                                              │
                                     User bridges later
                                     via send() (optional)
```

## Prerequisites

1.  **Node.js**: v18+ recommended (v22+ required for Hardhat 3).
2.  **Bun**: Used as the package manager.
3.  **Wallet**: Private key with native gas (ETH) and USDC on deployment chains.
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
    ARBITRUM_RPC_URL=https://arb1.arbitrum.io/rpc
    OPTIMISM_RPC_URL=https://mainnet.optimism.io
    BASE_RPC_URL=https://mainnet.base.org
    ```

3.  **Configure Origin Chain**:
    Open `scripts/constants.ts` and set `ORIGIN_NETWORK` to your desired Origin Chain:
    ```typescript
    export const ORIGIN_NETWORK: NetworkName = "arbitrumMainnet";
    ```

## Deployment Steps

Deploy the contract to **each network** you want to support.

### 1. Deploy to Each Network
```bash
# Deploy to Origin (e.g., Arbitrum)
bunx hardhat run scripts/deploy.ts --network arbitrumMainnet --profile production

# Deploy to Remote chains
bunx hardhat run scripts/deploy.ts --network optimismMainnet --profile production
bunx hardhat run scripts/deploy.ts --network baseMainnet --profile production
```
Each deployment auto-saves the contract address to `deployments.json`.

### 2. Connect All Networks (Set Peers)
After deploying to all desired chains, run `setPeer` on **each chain**:
```bash
bunx hardhat run scripts/setPeer.ts --network arbitrumMainnet
bunx hardhat run scripts/setPeer.ts --network optimismMainnet
bunx hardhat run scripts/setPeer.ts --network baseMainnet
```

### 3. Set USDC Address (if needed)
If the USDC address wasn't set at deploy time:
```bash
bunx hardhat run scripts/setUSDC.ts --network arbitrumMainnet
```

> **Note**: Unlike the previous architecture, the Origin contract does **not** need to be funded with ETH. There is no return-trip gas cost — NFTs mint directly to the user on Origin.

## Usage

### Minting on Origin Chain
Minting on Origin is instant and local (no LZ fees):
```bash
bunx hardhat run scripts/mint.ts --network arbitrumMainnet
```

### Minting from a Remote Chain
Minting from a remote chain sends a lightweight message to Origin. The NFT is minted to your address **on Origin**:
```bash
bunx hardhat run scripts/mint.ts --network optimismMainnet
```
After minting, the NFT lives on Origin. You can bridge it to your chain using the standard ONFT `send()` function whenever you want.

### Bridging an NFT
To move an NFT from Origin to another chain, use the standard ONFT721 `send()` function. Use `quoteBridge()` to estimate the fee:
```bash
bunx hardhat run scripts/mintAndBridge.ts --network arbitrumMainnet
```

## Adding a New Network

To add support for a new chain (e.g., Base):

1.  **`scripts/constants.ts`** — Add entries to `LZ_ENDPOINTS`, `LZ_EIDS`, `USDC_ADDRESSES`, `CHAIN_IDS`.
2.  **`hardhat.config.ts`** — Add a new network entry.
3.  **`.env`** — Add the RPC URL.
4.  **`deployments.json`** — Add `"baseMainnet": ""`.
5.  **Deploy & Peer**:
    ```bash
    bunx hardhat run scripts/deploy.ts --network baseMainnet --profile production
    # Then re-run setPeer on ALL chains:
    bunx hardhat run scripts/setPeer.ts --network baseMainnet
    bunx hardhat run scripts/setPeer.ts --network arbitrumMainnet
    # ... etc
    ```

## Architecture Notes

### Why Lazy Bridge?
The previous architecture used a **2-message round-trip** for cross-chain mints:
1. Remote → Origin: mint request (with NativeDrop to fund return gas)
2. Origin → Remote: bridge NFT back to user

This cost ~$0.75–$2.70 per mint. The Lazy Bridge eliminates the return trip entirely:
- **1 message** (Remote → Origin): 20-byte mint request
- NFT mints to user on Origin — **done**
- User bridges later if needed (their choice, their gas)

### Gas Savings
| Factor | Before | After |
|--------|--------|-------|
| LZ messages per mint | 2 | **1** |
| Message size | 64+ bytes | **20 bytes** |
| NativeDrop | Required | **None** |
| Origin gas limit | 300k | **100k** |
| Origin contract funding | Required | **Not needed** |
