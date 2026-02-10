import { network } from "hardhat";
import { LZ_ENDPOINTS, USDC_ADDRESSES, type NetworkName, saveDeployment, getDeployedNetworks } from "./constants.js";

async function main() {
    const { viem } = await network.connect();
    const networkName = network.name as NetworkName;

    if (!(networkName in LZ_ENDPOINTS)) {
        throw new Error(`Network ${networkName} not configured. Add it to constants.ts first.`);
    }

    const publicClient = await viem.getPublicClient();
    const chainId = await publicClient.getChainId();

    console.log("Deploying PayableONFT...");
    console.log("Network:", networkName);
    console.log("Chain ID:", chainId);

    const lzEndpoint = LZ_ENDPOINTS[networkName];
    const usdcAddress = USDC_ADDRESSES[networkName];

    // Create unique prefix based on chain ID to prevent ID collisions
    // e.g., Chain ID 421614 -> Prefix 421614000000
    const chainPrefix = BigInt(chainId) * BigInt(1_000_000);

    console.log("LayerZero Endpoint:", lzEndpoint);
    console.log("USDC Address:", usdcAddress);
    console.log("Chain Prefix:", chainPrefix.toString());

    const [deployer] = await viem.getWalletClients();
    console.log("Deployer:", deployer.account.address);

    const onft = await viem.deployContract("PayableONFT", [
        "OmniUSDC NFT",           // name
        "ONFT",                    // symbol
        lzEndpoint,                // LayerZero Endpoint V2
        deployer.account.address,  // delegate (owner)
        usdcAddress,               // USDC address
        chainPrefix,               // chain prefix for token IDs
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
