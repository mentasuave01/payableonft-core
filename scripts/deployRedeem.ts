import { network } from "hardhat";
import { type NetworkName, getDeployedAddress } from "./constants.js";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Deploys the Redeem contract for the PayableONFT on the current network.
 * Requires that PayableONFT is already deployed (address in deployments.json).
 *
 * Usage:
 *   bunx hardhat run scripts/deployRedeem.ts --network arbitrumSepolia --profile production
 */

async function main() {
    const { viem, networkName } = await network.connect();

    // Get the PayableONFT address for this network
    const onftAddress = getDeployedAddress(networkName);

    const [deployer] = await viem.getWalletClients();
    const publicClient = await viem.getPublicClient();
    const chainId = await publicClient.getChainId();

    console.log("Deploying Redeem contract...");
    console.log("Network:", networkName);
    console.log("Chain ID:", chainId);
    console.log("PayableONFT:", onftAddress);
    console.log("Deployer:", deployer.account.address);

    const redeem = await viem.deployContract("Redeem", [
        onftAddress,               // NFT contract to accept
        deployer.account.address,  // admin (owner)
    ]);

    console.log("\n✅ Redeem contract deployed successfully!");
    console.log("Contract Address:", redeem.address);

    // Auto-save to redeem_deployements.json
    const redeemDeploymentsPath = resolve(import.meta.dirname!, "..", "redeem_deployements.json");
    let redeemDeployments: Record<string, string> = {};
    try {
        const raw = readFileSync(redeemDeploymentsPath, "utf-8");
        redeemDeployments = JSON.parse(raw);
    } catch (e) {
        // File doesn't exist yet, we will create it
    }
    redeemDeployments[networkName] = redeem.address;
    writeFileSync(redeemDeploymentsPath, JSON.stringify(redeemDeployments, null, 2) + "\n");
    console.log(`\n📁 Saved to redeem_deployements.json`);

    console.log("\nUsers can now:");
    console.log("  1. Approve the Redeem contract to transfer their NFT");
    console.log("  2. Call redeem(tokenId) to redeem their NFT");
    console.log("  3. Or use safeTransferFrom to send directly to the Redeem contract");
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
