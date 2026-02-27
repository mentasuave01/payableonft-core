import { network } from "hardhat";
import { LZ_ENDPOINTS, LZ_EIDS, USDC_ADDRESSES, ORIGIN_NETWORK, saveDeployment, getDeployedNetworks } from "./constants.js";
import { Address } from "viem";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

async function main() {
    const { viem, networkName } = await network.connect();

    if (!(networkName in LZ_ENDPOINTS)) {
        throw new Error(`Network ${networkName} not configured. Add it to constants.ts first.`);
    }

    const publicClient = await viem.getPublicClient();
    const chainId = await publicClient.getChainId();

    console.log("Deploying PayableONFT...");
    console.log("Network:", networkName);
    console.log("Chain ID:", chainId);

    let lzEndpoint = LZ_ENDPOINTS[networkName] as Address
    let usdcAddress = USDC_ADDRESSES[networkName] as Address;

    // Check for mock deployment override
    try {
        const mockDeploymentsPath = resolve(import.meta.dirname!, "..", "mock-deployments.json");
        const mockDeploymentsRaw = readFileSync(mockDeploymentsPath, "utf-8");
        const mockDeployments = JSON.parse(mockDeploymentsRaw);
        if (mockDeployments[networkName]) {
            console.log(`\nℹ️  Using MockUSDC from mock-deployments.json: ${mockDeployments[networkName]}`);
            usdcAddress = mockDeployments[networkName] as Address;
        }
    } catch (e) {
        // Ignore if file doesn't exist or other errors
    }

    if (!usdcAddress && networkName !== "hardhatMainnet") {
        throw new Error(`USDC Address not found for ${networkName}. Configure in constants.ts or deploy MockUSDC first.`);
    }

    // Origin EID - all deployments must agree on this
    let originEid = LZ_EIDS[ORIGIN_NETWORK];

    // If on hardhatMainnet or localhost, deploy mocks first
    if (networkName === "hardhatMainnet" || networkName === "localhost") {
        console.log(`\n⚠️  Network is ${networkName}. Deploying mocks...`);

        const mockEndpoint = await viem.deployContract("MockLzEndpoint", [LZ_EIDS[networkName]]);
        lzEndpoint = mockEndpoint.address;
        console.log("Mock Endpoint deployed at:", lzEndpoint);

        // Only deploy MockUSDC if we didn't find one already (e.g. from mock-deployments.json)
        // But for consistency/simplicity in local dev, maybe we should just use the one we found?
        // The previous logic for hardhatMainnet ALWAYS deployed a new MockUSDC.
        // Let's check if we already have a usdcAddress (from mock-deployments or constants)
        if (!usdcAddress) {
            const mockUsdc = await viem.deployContract("MockUSDC");
            usdcAddress = mockUsdc.address;
            console.log("Mock USDC deployed at:", usdcAddress);
        } else {
            console.log("Using existing USDC at:", usdcAddress);
        }

        // For local testing, we assume this IS the origin chain
        originEid = LZ_EIDS[networkName];
        console.log("Set Origin EID to Local:", originEid);
        console.log("------------------------------------------------------------\n");
    }

    console.log("LayerZero Endpoint:", lzEndpoint);
    console.log("USDC Address:", usdcAddress);
    console.log("Origin EID:", originEid);

    const [deployer] = await viem.getWalletClients();
    console.log("Deployer:", deployer.account.address);

    const onft = await viem.deployContract("PayableONFT", [
        "ONFT TEST 2",           // name
        "ONFTv2",                    // symbol
        lzEndpoint,                // LayerZero Endpoint V2
        deployer.account.address,  // delegate (owner)
        usdcAddress,               // USDC address
        originEid,               // Origin Chain EID
    ]);

    console.log("\n✅ PayableONFT deployed successfully!");
    console.log("Contract Address:", onft.address);

    // Auto-save to deployments.json
    saveDeployment(networkName, onft.address);
    console.log(`\n📁 Saved to deployments.json`);

    // Show next steps based on current deployment state
    const deployed = getDeployedNetworks();
    const otherDeployed = deployed.filter(d => d.network !== networkName);

    if (otherDeployed.length === 0) {
        console.log("\nNext steps:");
        console.log("1. Deploy on other chains (run this script with --network <name>)");
        console.log("2. After deploying on all chains, run setPeer.ts on each chain");
    } else {
        console.log("\nNext steps:");
        console.log(`Already deployed on ${otherDeployed.length} other chain(s): ${otherDeployed.map(d => d.network).join(", ")}`);
        console.log("Run setPeer.ts on EACH deployed chain to connect them all:");
        for (const d of deployed) {
            console.log(`  bunx hardhat run scripts/setPeer.ts --network ${d.network}`);
        }
    }
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
