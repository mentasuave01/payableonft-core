import { network } from "hardhat";
import { erc20Abi, formatUnits } from "viem";
import { getDeployedAddress } from "./constants.js";

/**
 * Mint an NFT on the current chain.
 *
 * - On Origin chain: mints locally (no LZ fee).
 * - On Remote chain: sends a lightweight LZ message to Origin.
 *   The NFT will be minted to your address ON ORIGIN.
 *   Bridge it to your chain later using the standard ONFT send().
 *
 * Usage:
 *   bunx hardhat run scripts/mint.ts --network arbitrumMainnet
 *   bunx hardhat run scripts/mint.ts --network optimismMainnet
 */

async function main() {
    const { viem, networkName } = await network.connect();

    const onftAddress = getDeployedAddress(networkName);

    const publicClient = await viem.getPublicClient();
    const [wallet] = await viem.getWalletClients();

    console.log("Minting NFT on", networkName);
    console.log("Contract:", onftAddress);
    console.log("Wallet:", wallet.account.address);

    const onft = await viem.getContractAt("PayableONFT", onftAddress);
    const tokenAddress = await onft.read.paymentToken();
    const mintPrice = await onft.read.mintPrice();

    console.log("Payment token:", tokenAddress);
    console.log("Mint price:", mintPrice.toString());

    // Step 1: Check payment token balance
    const balance = await publicClient.readContract({
        address: tokenAddress,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [wallet.account.address],
    });
    console.log("Token balance:", balance.toString());

    if (balance < mintPrice) {
        throw new Error(`Insufficient balance. Need ${mintPrice}, have ${balance}`);
    }

    // Step 2: Approve payment token spending
    console.log("\n1. Approving payment token...");
    const approveHash = await wallet.writeContract({
        address: tokenAddress,
        abi: erc20Abi,
        functionName: "approve",
        args: [onftAddress, mintPrice],
    });
    console.log("Approval tx:", approveHash);
    await publicClient.waitForTransactionReceipt({ hash: approveHash });
    console.log("Approval confirmed!");

    // Step 3: Quote Fee
    console.log("\n2. Quoting Mint Fee...");
    const extraOptions = "0x";
    const fee = await onft.read.quoteMint([extraOptions]);
    console.log("Native fee:", fee.nativeFee.toString(), "wei");

    if (fee.nativeFee === 0n) {
        console.log("   (Origin chain — local mint, no LZ fee)");
    } else {
        console.log("   (Remote chain — 1 LZ message to Origin, no round trip)");
    }

    // Step 3.5: Verify allowance before minting
    const allowance = await publicClient.readContract({
        address: tokenAddress,
        abi: erc20Abi,
        functionName: "allowance",
        args: [wallet.account.address, onftAddress],
    });
    console.log("\nAllowance check:", allowance.toString(), ">=", mintPrice.toString(), "?", allowance >= mintPrice);
    if (allowance < mintPrice) {
        throw new Error(`Allowance too low. Need ${mintPrice}, have ${allowance}. Approval may have failed.`);
    }

    // Step 4: Mint
    const isCrossChain = fee.nativeFee > 0n;
    console.log("\n3. Minting NFT...", isCrossChain ? "(cross-chain → LZ message)" : "(local mint)");

    const mintOptions: Record<string, unknown> = { value: fee.nativeFee };
    // Local mints: use explicit 300k gas to avoid inflated estimation
    // Cross-chain mints: need ~500k+ for LZ DVN infrastructure, let estimator calculate
    if (!isCrossChain) {
        mintOptions.gas = 300_000n;
    }

    const mintHash = await onft.write.mint([extraOptions], mintOptions);
    console.log("Mint tx:", mintHash);
    await publicClient.waitForTransactionReceipt({ hash: mintHash });

    console.log("\n✅ NFT mint transaction confirmed!");
    if (fee.nativeFee > 0n) {
        console.log("Cross-chain mint request sent to Origin.");
        console.log("Your NFT will be minted on Origin in 1-5 minutes.");
        console.log("Track at https://layerzeroscan.com/");
        console.log("\nTo bridge the NFT to this chain later, use the standard ONFT send() function.");
    } else {
        console.log("Local mint completed — NFT is in your wallet.");
    }
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
