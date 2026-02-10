import { LZ_ENDPOINTS } from "./constants.js";
import { execSync } from "node:child_process";

const networks = Object.keys(LZ_ENDPOINTS);

console.log(`Starting deployment of MockUSDC to ${networks.length} networks: ${networks.join(", ")}`);

for (const network of networks) {
    console.log(`\n============================================================`);
    console.log(`Deploying to ${network}...`);
    console.log(`============================================================`);
    try {
        // Run the deployment script for this network
        execSync(`bunx hardhat run scripts/deployMockUSDC.ts --network ${network}`, { stdio: "inherit" });
    } catch (error) {
        console.error(`❌ Failed to deploy to ${network}. Continuing to next network...`);
    }
}

console.log("\n✅ All deployment attempts finished.");
