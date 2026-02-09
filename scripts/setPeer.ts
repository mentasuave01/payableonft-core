import { network } from "hardhat";
import { LZ_EIDS, type NetworkName } from "./constants.js";
import { pad } from "viem";

/**
 * Sets the peer for cross-chain communication.
 * Run this on EACH chain pointing to the other chain's contract.
 * 
 * Usage: 
 *   bunx hardhat run scripts/setPeer.ts --network arbitrumSepolia
 * 
 * Environment variables required:
 *   - PRIVATE_KEY: Deployer private key
 *   - ARBITRUM_SEPOLIA_ONFT_ADDRESS or OPTIMISM_SEPOLIA_ONFT_ADDRESS (local contract)
 *   - The peer contract address on the other chain
 */

// Update these with your deployed contract addresses
const DEPLOYED_CONTRACTS: Record<string, `0x${string}`> = {
    arbitrumSepolia: "0x0000000000000000000000000000000000000000", // Replace after deployment
    optimismSepolia: "0x0000000000000000000000000000000000000000", // Replace after deployment
};

async function main() {
    const { viem } = await network.connect();
    const networkName = network.name as NetworkName;

    if (!(networkName in LZ_EIDS)) {
        throw new Error(`Network ${networkName} not configured`);
    }

    // Determine peer network
    const peerNetwork = networkName === "arbitrumSepolia" ? "optimismSepolia" : "arbitrumSepolia";
    const peerEid = LZ_EIDS[peerNetwork as NetworkName];
    const peerAddress = DEPLOYED_CONTRACTS[peerNetwork];
    const localAddress = DEPLOYED_CONTRACTS[networkName];

    if (peerAddress === "0x0000000000000000000000000000000000000000") {
        throw new Error(`Peer contract address not set for ${peerNetwork}. Update DEPLOYED_CONTRACTS in this script.`);
    }

    if (localAddress === "0x0000000000000000000000000000000000000000") {
        throw new Error(`Local contract address not set for ${networkName}. Update DEPLOYED_CONTRACTS in this script.`);
    }

    console.log("Setting peer...");
    console.log("Current network:", networkName);
    console.log("Local contract:", localAddress);
    console.log("Peer network:", peerNetwork);
    console.log("Peer EID:", peerEid);
    console.log("Peer address:", peerAddress);

    const onft = await viem.getContractAt("PayableONFT", localAddress);

    // Peer address must be bytes32 padded
    const peerBytes32 = pad(peerAddress, { size: 32 });
    console.log("Peer bytes32:", peerBytes32);

    const hash = await onft.write.setPeer([peerEid, peerBytes32]);
    console.log("Transaction hash:", hash);
    console.log("\n✅ Peer set successfully!");
    console.log(`\nNext: Run the same script on ${peerNetwork} to complete the connection.`);
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
