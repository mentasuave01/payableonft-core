import { network } from "hardhat";
import { getDeployedAddress } from "./constants.js";
import * as fs from "fs";
import * as path from "path";

async function main() {
    const { viem, networkName } = await network.connect();

    // 1. Get the PayableONFT contract address
    let onftAddress: `0x${string}`;
    try {
        onftAddress = getDeployedAddress(networkName);
    } catch (e) {
        console.error(`Error: PayableONFT not deployed on ${networkName}.`);
        process.exit(1);
    }

    // 2. Read mock-deployments.json to get the USDC address
    const mockDeploymentsPath = path.resolve(import.meta.dirname!, "..", "mock-deployments.json");

    if (!fs.existsSync(mockDeploymentsPath)) {
        console.error(`Error: mock-deployments.json not found at ${mockDeploymentsPath}`);
        process.exit(1);
    }

    const mockDeployments = JSON.parse(fs.readFileSync(mockDeploymentsPath, "utf-8"));
    const usdcAddress = mockDeployments[networkName];

    if (!usdcAddress || usdcAddress === "") {
        console.error(`Error: No USDC address configured for ${networkName} in mock-deployments.json`);
        process.exit(1);
    }

    console.log(`Setting USDC address on ${networkName}`);
    console.log(`PayableONFT: ${onftAddress}`);
    console.log(`New USDC:    ${usdcAddress}`);

    const [wallet] = await viem.getWalletClients();
    const publicClient = await viem.getPublicClient();

    // 3. Get contract instance
    const onft = await viem.getContractAt("PayableONFT", onftAddress);

    // 4. Check current USDC address
    const currentUSDC = await onft.read.usdc();
    if (currentUSDC.toLowerCase() === usdcAddress.toLowerCase()) {
        console.log("✅ USDC address is already set correctly.");
        return;
    }

    console.log(`Current USDC: ${currentUSDC}`);
    console.log("Sending transaction...");

    // 5. Set new USDC address
    const hash = await onft.write.setUSDC([usdcAddress]);
    console.log("Tx hash:", hash);

    await publicClient.waitForTransactionReceipt({ hash });
    console.log("✅ USDC address set successfully!");
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
