import { network } from "hardhat";
import { LZ_EIDS, type NetworkName, getDeployments, saveDeployment } from "./constants.js";
import { resolve } from "node:path";
import { readFileSync, writeFileSync } from "node:fs";

// Mock deployments file path (separate from main deployments to avoid clutter/confusion in prod)
const MOCK_DEPLOYMENTS_PATH = resolve(import.meta.dirname!, "..", "mock-deployments.json");

function getMockDeployments(): Record<string, string> {
    try {
        const raw = readFileSync(MOCK_DEPLOYMENTS_PATH, "utf-8");
        return JSON.parse(raw);
    } catch (e) {
        return {};
    }
}

function saveMockDeployment(network: string, address: string): void {
    const deployments = getMockDeployments();
    deployments[network] = address;
    // We also save to the main constants.ts? No, we should update constants.ts manually or just log it. 
    // Actually, hardhatMainnet endpoint address is hardcoded in constants.ts. 
    // I should print instructions to update it.
    writeFileSync(MOCK_DEPLOYMENTS_PATH, JSON.stringify(deployments, null, 2) + "\n");
}

async function main() {
    const { viem, networkName } = await network.connect();

    if (!(networkName in LZ_EIDS)) {
        throw new Error(`Network ${networkName} not configured in LZ_EIDS in constants.ts.`);
    }

    const eid = LZ_EIDS[networkName as NetworkName];

    console.log("Deploying MockLzEndpoint...");
    console.log("Network:", networkName);
    console.log("EID:", eid);

    const [deployer] = await viem.getWalletClients();
    console.log("Deployer:", deployer.account.address);

    const mockEndpoint = await viem.deployContract("MockLzEndpoint", [eid]);

    console.log("\n✅ MockLzEndpoint deployed successfully!");
    console.log("Contract Address:", mockEndpoint.address);

    saveMockDeployment(`${networkName}_EndpointV2`, mockEndpoint.address);
    console.log(`\nIMPORTANT: Update constants.ts 'hardhatMainnet' endpoint address with: ${mockEndpoint.address}`);
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
