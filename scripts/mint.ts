import { network } from "hardhat";
import { erc20Abi, parseUnits } from "viem";
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

const MINT_PRICE = parseUnits("10", 6); // 10 USDC

async function main() {
    const { viem, networkName } = await network.connect();

    const onftAddress = getDeployedAddress(networkName);

    const publicClient = await viem.getPublicClient();
    const [wallet] = await viem.getWalletClients();

    console.log("Minting NFT on", networkName);
    console.log("Contract:", onftAddress);
    console.log("Wallet:", wallet.account.address);

    const onft = await viem.getContractAt("PayableONFT", onftAddress);
    const usdcAddress = await onft.read.usdc();

    console.log("USDC address:", usdcAddress);
    console.log("Mint price:", MINT_PRICE.toString(), "(10 USDC)");

    // Step 1: Check USDC balance
    const balance = await publicClient.readContract({
        address: usdcAddress,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [wallet.account.address],
    });
    console.log("USDC balance:", balance.toString());

    if (balance < MINT_PRICE) {
        throw new Error(`Insufficient USDC balance. Need ${MINT_PRICE}, have ${balance}`);
    }

    // Step 2: Approve USDC spending
    console.log("\n1. Approving USDC...");
    const approveHash = await wallet.writeContract({
        address: usdcAddress,
        abi: erc20Abi,
        functionName: "approve",
        args: [onftAddress, MINT_PRICE],
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

    // Step 4: Mint
    console.log("\n3. Minting NFT...");
    const mintHash = await onft.write.mint([extraOptions], { value: fee.nativeFee });
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
