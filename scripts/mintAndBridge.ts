import { network } from "hardhat";
import { erc20Abi, parseUnits } from "viem";
import { Options } from "@layerzerolabs/lz-v2-utilities";
import { LZ_EIDS, type NetworkName, getDeployedAddress, getDeployedNetworks } from "./constants.js";

/**
 * Mint an NFT and bridge it to another chain in one transaction.
 * User pays USDC on current chain and receives NFT on destination chain.
 *
 * Usage:
 *   DESTINATION=optimismSepolia bunx hardhat run scripts/mintAndBridge.ts --network arbitrumSepolia
 *   DESTINATION=sepolia bunx hardhat run scripts/mintAndBridge.ts --network arbitrumSepolia
 *
 * Environment variables:
 *   DESTINATION - The target network name to bridge the NFT to (required)
 */

const MINT_PRICE = parseUnits("10", 6); // 10 USDC

async function main() {
    const { viem } = await network.connect();
    const networkName = network.name as NetworkName;

    // Read contract address from deployments.json
    const onftAddress = getDeployedAddress(networkName);

    // Get destination from env
    const dstNetwork = process.env.DESTINATION as NetworkName | undefined;

    if (!dstNetwork) {
        const deployed = getDeployedNetworks().filter(d => d.network !== networkName);
        console.log("❌ Missing DESTINATION env var. Available destinations:");
        for (const d of deployed) {
            console.log(`  DESTINATION=${d.network} bunx hardhat run scripts/mintAndBridge.ts --network ${networkName}`);
        }
        if (deployed.length === 0) {
            console.log("  (no other networks deployed yet)");
        }
        process.exitCode = 1;
        return;
    }

    if (!(dstNetwork in LZ_EIDS)) {
        throw new Error(`Destination "${dstNetwork}" not found in LZ_EIDS. Check constants.ts`);
    }

    // Verify destination is deployed
    const dstAddress = getDeployedAddress(dstNetwork);
    const dstEid = LZ_EIDS[dstNetwork];

    const publicClient = await viem.getPublicClient();
    const [wallet] = await viem.getWalletClients();

    console.log("=== Mint and Bridge ===");
    console.log("Source chain:", networkName);
    console.log("Source contract:", onftAddress);
    console.log("Destination chain:", dstNetwork);
    console.log("Destination contract:", dstAddress);
    console.log("Destination EID:", dstEid);
    console.log("Wallet:", wallet.account.address);

    const onft = await viem.getContractAt("PayableONFT", onftAddress);
    const usdcAddress = await onft.read.usdc();

    // Step 1: Build LayerZero options
    // Gas limit for receiving NFT on destination (minting takes gas)
    console.log("\n1. Building LayerZero options...");
    const options = Options.newOptions()
        .addExecutorLzReceiveOption(200000, 0)
        .toHex();
    console.log("Options:", options);

    // Step 2: Quote the native gas fee for bridging
    console.log("\n2. Quoting bridge fee...");
    const fee = await onft.read.quoteBridge([dstEid, options as `0x${string}`]);
    console.log("Native fee:", fee.nativeFee.toString(), "wei");
    console.log("LZ token fee:", fee.lzTokenFee.toString());

    // Step 3: Check USDC balance
    console.log("\n3. Checking USDC balance...");
    const balance = await publicClient.readContract({
        address: usdcAddress,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [wallet.account.address],
    });
    console.log("USDC balance:", balance.toString());

    if (balance < MINT_PRICE) {
        throw new Error(`Insufficient USDC. Need ${MINT_PRICE}, have ${balance}`);
    }

    // Step 4: Approve USDC spending
    console.log("\n4. Approving USDC...");
    const approveHash = await wallet.writeContract({
        address: usdcAddress,
        abi: erc20Abi,
        functionName: "approve",
        args: [onftAddress, MINT_PRICE],
    });
    console.log("Approval tx:", approveHash);
    await publicClient.waitForTransactionReceipt({ hash: approveHash });
    console.log("Approval confirmed!");

    // Step 5: Mint and Bridge
    console.log("\n5. Minting and bridging...");
    const mintHash = await onft.write.mintAndBridge(
        [dstEid, options as `0x${string}`],
        { value: fee.nativeFee }
    );
    console.log("Mint & Bridge tx:", mintHash);
    await publicClient.waitForTransactionReceipt({ hash: mintHash });

    console.log("\n✅ Transaction submitted successfully!");
    console.log("Your NFT will arrive on", dstNetwork, "in 1-5 minutes.");
    console.log("\nTrack your message at: https://layerzeroscan.com/");
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
