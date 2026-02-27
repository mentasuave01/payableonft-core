import { network } from "hardhat";
import { LZ_ENDPOINTS, type NetworkName } from "./constants.js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Address, parseUnits } from "viem";

const MOCK_DEPLOYMENTS_PATH = resolve(import.meta.dirname!, "..", "mock-deployments.json");

function getMockDeployments(): Record<string, string> {
    try {
        const raw = readFileSync(MOCK_DEPLOYMENTS_PATH, "utf-8");
        return JSON.parse(raw);
    } catch (e) {
        return {};
    }
}

async function main() {
    const { viem, networkName } = await network.connect();

    if (!(networkName in LZ_ENDPOINTS)) {
        throw new Error(`Network ${networkName} not configured in constants.ts.`);
    }

    const deployments = getMockDeployments();
    const mockUsdcAddress = deployments[networkName] as Address;

    if (!mockUsdcAddress) {
        throw new Error(`MockUSDC not found for network ${networkName} in mock-deployments.json. 
        Please run 'bunx hardhat run scripts/deployMockUSDC.ts --network ${networkName}' first.`);
    }

    console.log("Minting MockUSDC...");
    console.log("Network:", networkName);
    console.log("MockUSDC Address:", mockUsdcAddress);

    const [signer] = await viem.getWalletClients();
    const recipient = signer.account.address;
    console.log("Recipient:", recipient);

    // Default amount: 1000 USDC (6 decimals)
    const amount = parseUnits("1000", 6);

    const mockUsdc = await viem.getContractAt("MockUSDC", mockUsdcAddress);

    // Check if the contract has a mint function (it is MockUSDC after all)
    try {
        const tx = await mockUsdc.write.mint([recipient, amount]);
        console.log(`\n✅ Minted 1000 USDC to ${recipient}`);
        console.log("Tx Hash:", tx);
    } catch (error) {
        console.error("\n❌ Failed to mint. Ensure this is a MockUSDC contract with a public mint function.");
        console.error(error);
    }
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
