# Redeem Contract

## Overview
The `Redeem` contract accepts PayableONFT NFTs for redemption. Once an NFT is redeemed, only the admin (contract owner) can withdraw or burn it.

### Features
- **Redeem via approve + call**: User approves the contract, then calls `redeem(tokenId)`
- **Redeem via direct transfer**: User calls `safeTransferFrom` directly to the Redeem contract
- **Admin Withdraw**: Owner can transfer any held NFT to any address
- **Admin Burn**: Owner can burn any held NFT (sends to `0x...dEaD`)
- **Tracking**: Records the original redeemer for each token ID

## Deployment

Requires that PayableONFT is already deployed on the network (address in `deployments.json`).

```bash
bunx hardhat run scripts/deployRedeem.ts --network arbitrumSepolia --profile production
bunx hardhat run scripts/deployRedeem.ts --network optimismSepolia --profile production
```

## Usage

### For Users — Redeeming an NFT

**Option A: Approve + Redeem**
1. Approve the Redeem contract to transfer your NFT
2. Call `redeem(tokenId)` on the Redeem contract

**Option B: Direct Transfer**
1. Call `safeTransferFrom(yourAddress, redeemContractAddress, tokenId)` on the PayableONFT contract

Both methods record the original redeemer and emit a `Redeemed` event.

### For Admin — Managing Redeemed NFTs

**Withdraw an NFT** (transfer to any address):
```solidity
redeem.withdraw(tokenId, recipientAddress)
```

**Burn an NFT** (send to dead address permanently):
```solidity
redeem.burn(tokenId)
```

**View redeemed info**:
```solidity
redeem.redeemer(tokenId)    // Original redeemer address
redeem.redeemedCount()      // Total redeemed NFTs
redeem.redeemedTokenIds(i)  // Token ID at index i
```

## Running Tests

```bash
bunx hardhat test
```

Tests cover: redeem via approve, redeem via safeTransferFrom, admin withdraw, admin burn, and access control for all admin functions.
