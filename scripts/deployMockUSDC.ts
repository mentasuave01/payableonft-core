import { network } from "hardhat";
import { LZ_ENDPOINTS, type NetworkName } from "./constants.js";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const DEPLOYMENTS_PATH = resolve(import.meta.dirname!, "..", "mock-deployments.json");

function getMockDeployments(): Record<string, string> {
    try {
        const raw = readFileSync(DEPLOYMENTS_PATH, "utf-8");
        return JSON.parse(raw);
    } catch (e) {
        return {};
    }
}

function saveMockDeployment(network: string, address: string): void {
    const deployments = getMockDeployments();
    deployments[network] = address;
    writeFileSync(DEPLOYMENTS_PATH, JSON.stringify(deployments, null, 2) + "\n");
}

async function main() {
    const { viem, networkName } = await network.connect();

    if (!(networkName in LZ_ENDPOINTS)) {
        throw new Error(`Network ${networkName} not configured in constants.ts.`);
    }

    const publicClient = await viem.getPublicClient();
    const chainId = await publicClient.getChainId();

    console.log("Deploying MockUSDC...");
    console.log("Network:", networkName);
    console.log("Chain ID:", chainId);

    const [deployer] = await viem.getWalletClients();
    console.log("Deployer:", deployer.account.address);

    const mockUsdc = await viem.deployContract("MockUSDC");

    console.log("\n✅ MockUSDC deployed successfully!");
    console.log("Contract Address:", mockUsdc.address);

    // Auto-save to mock-deployments.json
    saveMockDeployment(networkName, mockUsdc.address);
    console.log(`\n📁 Saved to mock-deployments.json`);
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
