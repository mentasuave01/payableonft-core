# PayableONFT Deployment Guide — Lazy Bridge Architecture

This guide walks through deploying, configuring, and verifying the `PayableONFT` system.
With the Lazy Bridge architecture, cross-chain mints use a single lightweight LZ message (20 bytes). NFTs are minted on Origin and users bridge them later on-demand.

## Prerequisites

- **Node.js** (v20+ recommended)
- **Bun** (for package management and running scripts)
- **Environment Variables**: Create a `.env` file with the following:
    ```env
    PRIVATE_KEY=your_private_key
    SEPOLIA_RPC_URL=...
    ARBITRUM_SEPOLIA_RPC_URL=...
    OPTIMISM_SEPOLIA_RPC_URL=...
    ETHERSCAN_API_KEY=...
    ```

## 1. Local Testing

Before deploying to testnets, verify the contracts locally using Hardhat and the provided test suite.

```bash
# Run unit tests
bunx hardhat test
```

This runs the test suites, which cover:
- Local minting on Origin (with USDC payment)
- Cross-chain mint requests (lightweight 20-byte LZ message)
- E2E cross-chain simulation (message delivery → NFT minted on Origin)
- Bridge quoting
- Metadata (Base URI)
- Admin functions (withdraw, pause)


## 2. Testnet Deployment

### Step 0: Setup USDC

You need USDC to pay for minting fees. For testnets, you can use the official Circle Testnet USDC (if available and you have a faucet) OR deploy a **MockUSDC** token.

**Option A: Deploy & Mint MockUSDC (Recommended for Testing)**
If you don't have testnet USDC, deploy a mock version:

1. **Deploy MockUSDC:**
   ```bash
   bunx hardhat run scripts/deployMockUSDC.ts --network arbitrumSepolia
   ```
   *This saves the address to `mock-deployments.json`.*

2. **Mint MockUSDC:**
   ```bash
   bunx hardhat run scripts/mintMockUSDC.ts --network arbitrumSepolia
   ```
   *This mints 1,000 MockUSDC to your wallet.*

**Option B: Use Official Testnet USDC**
If you already have official Circle USDC on the testnet, ensure it is in your wallet. The `deploy.ts` script defaults to official addresses in `constants.ts` if no mock is found.

### Step 1: Deploy PayableONFT

Deploy the contract to your desired networks. The script will automatically detect if you have deployed MockUSDC and use that address.

**Deploy to Origin Chain (e.g., Arbitrum Sepolia)**
```bash
bunx hardhat run scripts/deploy.ts --network arbitrumMainnet
```

**Deploy to Remote Chain (e.g., Optimism Sepolia)**
```bash
bunx hardhat run scripts/deploy.ts --network optimismMainnet
```

> [!NOTE]
> The `deploy.ts` script automatically saves the deployed addresses to `deployments.json`.

## 3. Wiring (LayerZero Peers)

After deploying to both chains, you must connect them by setting each other as peers.

**Step 1: Set Peer on Origin Chain**
```bash
bunx hardhat run scripts/setPeer.ts --network arbitrumSepolia
```

**Step 2: Set Peer on Remote Chain**
```bash
bunx hardhat run scripts/setPeer.ts --network optimismSepolia
```

## 4. Verification & Demo

You can use the `demo_flow.ts` script to verify the core functionality on a live network.

**For Localhost Verification:**
1. Start a local node:
   ```bash
   bunx hardhat node
   ```
2. Deploy to localhost:
   ```bash
   bunx hardhat run scripts/deploy.ts --network localhost
   ```
3. Run Demo Flow:
   ```bash
   bunx hardhat run scripts/demo_flow.ts --network localhost
   ```

**For Testnet/Mainnet Verification:**
Run the demo flow on the deployed network:
```bash
bunx hardhat run scripts/demo_flow.ts --network arbitrumMainnet
```

This script will:
1. Approve USDC for the contract.
2. Mint a new NFT (paying the USDC fee).
3. Set the Base URI for metadata.
4. Log the Token URI of the minted NFT.

> **Note**: No need to fund the Origin contract with ETH. The Lazy Bridge architecture eliminates the return-trip gas cost entirely.

## 5. Metadata Visibility

To ensure your NFTs are visible on platforms like OpenSea (Testnet):
1. Run the `demo_flow.ts` or manually call `setBaseURI` on the contract.
2. Ensure your Base URI points to a valid metadata server or IPFS gateway.
   - Example: `https://api.myproject.com/metadata/`
   - Token URI will be: `https://api.myproject.com/metadata/1`

## Troubleshooting

- **USDC Approval Failed**: Ensure you have USDC and enough ETH for gas.
- **LayerZero Error**: Check that you have set peers correctly on BOTH chains using `setPeer.ts`.
- **Invalid Token URI**: Verify the Base URI ends with a slash (`/`) if your filenames are just IDs.
- **NFT not on my chain**: With Lazy Bridge, NFTs mint on Origin. Use the ONFT `send()` function to bridge to your preferred chain.
