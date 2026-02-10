import { network } from "hardhat";
import { erc20Abi, parseUnits } from "viem";
import { getDeployedAddress } from "./constants.js";

/**
 * Mint an NFT on the current chain (no bridging).
 * User pays USDC and receives NFT on the same chain.
 *
 * Usage:
 *   bunx hardhat run scripts/mint.ts --network arbitrumSepolia
 */

const MINT_PRICE = parseUnits("10", 6); // 10 USDC

async function main() {
    const { viem } = await network.connect();
    const networkName = network.name;

    // Read contract address from deployments.json
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

    // Step 3: Quote Fee (if remote)
    console.log("\n2. Quoting Mint Fee...");
    // We use a default explicit options for quoting to match what we might send, 
    // or just send empty bytes if the contract handles defaults (which it does via mint()).
    // However, mint() takes `_extraOptions`. We should pass "0x" if we don't want specific settings.
    const extraOptions = "0x";

    const fee = await onft.read.quoteMint([extraOptions]);
    console.log("Native fee:", fee.nativeFee.toString(), "wei");

    // Step 4: Mint
    console.log("\n3. Minting NFT...");
    // mint(bytes calldata _extraOptions)
    const mintHash = await onft.write.mint([extraOptions], { value: fee.nativeFee });
    console.log("Mint tx:", mintHash);
    await publicClient.waitForTransactionReceipt({ hash: mintHash });

    console.log("\n✅ NFT mint transaction confirmed!");
    if (fee.nativeFee > 0n) {
        console.log("Since this was a cross-chain request, it may take a few minutes for the NFT to appear on this chain.");
        console.log("Track at https://layerzeroscan.com/");
    } else {
        console.log("Local mint completed.");
    }
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
