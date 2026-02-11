# PayableONFT Deployment Guide

This guide walks through the process of deploying, configuring, and verifying the `PayableONFT` system.

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

This runs the `test/PayableONFT.ts` suite, which covers:
- Deployment
- Minting (with USDC payment)
- Cross-chain bridging (mocked)
- Metadata (Base URI)
- Admin functions (withdraw, pause)

## 2. Testnet Deployment

Deploy the contract to your desired networks. Ensure you have funded your wallet with both **Native ETH** (for gas) and **Testnet USDC** (for minting).

**Step 1: Deploy to Origin Chain (e.g., Arbitrum Sepolia)**
```bash
bunx hardhat run scripts/deploy.ts --network arbitrumSepolia
```

**Step 2: Deploy to Remote Chain (e.g., Optimism Sepolia)**
```bash
bunx hardhat run scripts/deploy.ts --network optimismSepolia
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

**For Testnet Verification:**
Run the demo flow on the deployed network (e.g., Arbitrum Sepolia):
```bash
bunx hardhat run scripts/demo_flow.ts --network arbitrumSepolia
```

This script will:
1. Approve USDC for the contract.
2. Mint a new NFT (paying the USDC fee).
3. Set the Base URI for metadata.
4. Log the Token URI of the minted NFT.

## 5. Metadata Visibility

To ensure your NFTs are visible on platforms like OpenSea (Testnet):
1. Run the `demo_flow.ts` or manually call `setBaseURI` on the contract.
2. Ensure your Base URI points to a valid metadata server or IPFS gateway.
   - Example: `https://api.myproject.com/metadata/`
   - Token URI will be: `https://api.myproject.com/metadata/1`

## Troubleshooting

- **USDC Approval Failed**: Ensure you have Testnet USDC and enough ETH for gas.
- **LayerZero Error**: Check that you have set peers correctly on BOTH chains using `setPeer.ts`.
- **Invalid Token URI**: Verify the Base URI ends with a slash (`/`) if your filenames are just IDs.
