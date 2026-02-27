import hre from "hardhat";
import { LZ_ENDPOINTS, LZ_EIDS, USDC_ADDRESSES, ORIGIN_NETWORK, getDeployedAddress } from "./constants.js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Address } from "viem";
import { execSync } from "child_process";

async function main() {
    // 1. Connect to network
    // This is crucial for Hardhat 3 / EDR / whatever this setup is
    const { viem, networkName } = await hre.network.connect();
    console.log(`Verifying PayableONFT on ${networkName}...`);

    // 2. Get Contract Address
    const contractAddress = getDeployedAddress(networkName);
    console.log(`Contract Address: ${contractAddress}`);

    // 3. Fetch Owner (Delegate)
    const onft = await viem.getContractAt("PayableONFT", contractAddress);
    const owner = await onft.read.owner();
    console.log(`Owner (Delegate): ${owner}`);

    // 4. Determine Arguments
    const lzEndpoint = LZ_ENDPOINTS[networkName];
    let usdcAddress = USDC_ADDRESSES[networkName];

    try {
        const mockDeploymentsPath = resolve(import.meta.dirname!, "..", "mock-deployments.json");
        const mockDeploymentsRaw = readFileSync(mockDeploymentsPath, "utf-8");
        const mockDeployments = JSON.parse(mockDeploymentsRaw);
        if (mockDeployments[networkName]) {
            console.log(`Using MockUSDC from mock-deployments.json: ${mockDeployments[networkName]}`);
            usdcAddress = mockDeployments[networkName] as Address;
        }
    } catch (e) { }

    const originEid = LZ_EIDS[ORIGIN_NETWORK];

    const args = [
        "OmniUSDC NFT",
        "ONFT",
        lzEndpoint,
        owner,
        usdcAddress,
        originEid
    ];

    console.log("Constructor Arguments:", args);

    // 5. Verify via CLI
    // We assume running from project root
    const argsString = args.map(a => `"${a}"`).join(" ");

    // We use 'bunx hardhat' to ensure we use local installation
    const cmd = `bunx hardhat verify --network ${networkName} ${contractAddress} ${argsString}`;

    console.log("\nExecuting command:");
    console.log(cmd);

    try {
        execSync(cmd, { stdio: 'inherit' });
    } catch (e) {
        console.error("Verification failed via CLI execution.");
        process.exit(1);
    }
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
