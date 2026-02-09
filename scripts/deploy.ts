import { network } from "hardhat";
import { LZ_ENDPOINTS, USDC_ADDRESSES, type NetworkName } from "./constants.js";

async function main() {
    const { viem as any } = await network.connect();
    const networkName = network.name as NetworkName;

    if (!(networkName in LZ_ENDPOINTS)) {
        throw new Error(`Network ${networkName} not configured. Use: arbitrumSepolia, optimismSepolia, or sepolia`);
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
    console.log("\nNext steps:");
    console.log("1. Deploy on another chain");
    console.log("2. Run setPeer on both contracts to connect them");
    console.log(`3. Update .env with ${networkName.toUpperCase()}_ONFT_ADDRESS=${onft.address}`);
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
