# PayableONFT Deployment Guide — Lazy Bridge Architecture

This guide walks through deploying, configuring, and verifying the `PayableONFT` system.

With the **Lazy Bridge** architecture, cross-chain mints use a single lightweight LZ message (20 bytes). NFTs are minted on Origin and users bridge them to other chains on-demand.

> **Key difference from previous architecture**: No need to fund the Origin contract with ETH. There is no return-trip — NFTs mint directly to the user on Origin.

## Prerequisites

- **Node.js** (v20+ recommended)
- **Bun** (for package management and running scripts)
- **Environment Variables**: Create a `.env` file:
    ```env
    PRIVATE_KEY=your_private_key
    ARBITRUM_RPC_URL=https://arb1.arbitrum.io/rpc
    OPTIMISM_RPC_URL=https://mainnet.optimism.io
    BASE_RPC_URL=https://mainnet.base.org
    ETHERSCAN_API_KEY=your_etherscan_api_key
    ```

## 1. Local Testing

Before deploying, verify the contracts locally:

```bash
bunx hardhat test
```

This runs 33 tests covering:
- Local minting on Origin (USDC payment, zero LZ fee)
- Cross-chain mint requests (20-byte LZ message, no NativeDrop)
- E2E cross-chain simulation (message delivery → NFT minted on Origin)
- Bridge fee quoting
- Metadata (Base URI)
- Admin functions (withdraw, pause, setUSDC)
- Redeem contract (approve + redeem, safeTransferFrom, admin withdraw/burn)

## 2. Deployment

### Step 0: Setup USDC

You need USDC for minting fees. Two options:

**Option A: Deploy MockUSDC (testing)**
```bash
# Deploy mock to each chain
bunx hardhat run scripts/deployMockUSDC.ts --network arbitrumMainnet

# Mint 1,000 MockUSDC to your wallet
bunx hardhat run scripts/mintMockUSDC.ts --network arbitrumMainnet
```
*Addresses saved to `mock-deployments.json`.*

**Option B: Use real USDC**
Ensure USDC addresses are set in `scripts/constants.ts` under `USDC_ADDRESSES`.

### Step 1: Deploy PayableONFT

Deploy to each network. The script auto-detects MockUSDC if available.

```bash
# Origin Chain
bunx hardhat run scripts/deploy.ts --network baseMainnet --profile production

# Remote Chains
bunx hardhat run scripts/deploy.ts --network arbitrumMainnet --profile production
bunx hardhat run scripts/deploy.ts --network optimismMainnet --profile production
```

> Addresses auto-saved to `deployments.json`.

### Step 2: Wire LayerZero Peers

After deploying to all chains, connect them by running `setPeer` on **each chain**:

```bash
bunx hardhat run scripts/setPeer.ts --network baseMainnet
bunx hardhat run scripts/setPeer.ts --network arbitrumMainnet
bunx hardhat run scripts/setPeer.ts --network optimismMainnet
```

Verify peers are set correctly:
```bash
bunx hardhat run scripts/checkPeers.ts --network baseMainnet
```

### Step 3: Set USDC (if needed)

If the USDC address wasn't set at deploy time or you want to update it:
```bash
bunx hardhat run scripts/setUSDC.ts --network arbitrumMainnet
```

### Step 4: Set Metadata Base URI

```bash
BASE_URI="https://api.myproject.com/metadata/" bunx hardhat run scripts/setBaseURI.ts --network baseMainnet
```

Token URIs will resolve to `https://api.myproject.com/metadata/1`, `…/2`, etc.

## 3. Usage

### Minting on Origin
Local mint — instant, no LZ fees:
```bash
bunx hardhat run scripts/mint.ts --network baseMainnet
```

### Minting from a Remote Chain
Sends a lightweight LZ message to Origin. NFT is minted to your address **on Origin**:
```bash
bunx hardhat run scripts/mint.ts --network arbitrumMainnet
```

### Bridging an NFT
To move an NFT from Origin to another chain, use the standard ONFT721 `send()` function. Use `quoteBridge()` to estimate fees.

### Deploy Redeem Contract (optional)
```bash
bunx hardhat run scripts/deployRedeem.ts --network arbitrumMainnet --profile production
```

## 4. Verification

### Demo Flow
```bash
bunx hardhat run scripts/demo_flow.ts --network arbitrumMainnet
```
Approves USDC → mints NFT → sets Base URI → logs Token URI.

### Verify on Etherscan
```bash
bunx hardhat run scripts/verify-payable-onft.ts --network arbitrumMainnet
```

## 5. Available Scripts

| Script | Purpose |
|--------|---------|
| `deploy.ts` | Deploy PayableONFT (auto-deploys mocks on localhost) |
| `setPeer.ts` | Wire LZ peers between deployed chains |
| `checkPeers.ts` | Verify peer configuration is correct |
| `mint.ts` | Mint an NFT (local or cross-chain) |
| `setBaseURI.ts` | Set metadata base URI |
| `setUSDC.ts` | Update USDC token address |
| `deployMockUSDC.ts` | Deploy MockUSDC for testing |
| `mintMockUSDC.ts` | Mint test USDC to your wallet |
| `deployAllUSDCMocks.ts` | Deploy MockUSDC to all configured networks |
| `deployRedeem.ts` | Deploy the Redeem contract |
| `demo_flow.ts` | End-to-end demo (approve → mint → metadata) |
| `verify-payable-onft.ts` | Verify contract on Etherscan |
| `constants.ts` | Network config (endpoints, EIDs, USDC addresses) |

## Troubleshooting

- **USDC Approval Failed**: Ensure you have USDC and enough ETH for gas.
- **LayerZero Error**: Check peers are set correctly on BOTH chains with `checkPeers.ts`.
- **Invalid Token URI**: Verify the Base URI ends with `/`.
- **NFT not on my chain**: With Lazy Bridge, NFTs mint on Origin. Use the ONFT `send()` to bridge to your preferred chain.
- **High cross-chain mint fee**: Fee should be small (1 LZ message, no NativeDrop). If unusually high, check LZ endpoint configuration.
