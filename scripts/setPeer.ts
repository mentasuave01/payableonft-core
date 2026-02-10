import { network } from "hardhat";
import { LZ_EIDS, type NetworkName, getDeployedAddress, getDeployedNetworks } from "./constants.js";
import { pad } from "viem";

/**
 * Sets peers for cross-chain communication with ALL other deployed networks.
 * Run this on EACH chain after deploying to all chains.
 *
 * Usage:
 *   bunx hardhat run scripts/setPeer.ts --network arbitrumSepolia
 *
 * This will automatically find all other deployed networks in deployments.json
 * and set each one as a peer.
 */

async function main() {
    const { viem, networkName } = await network.connect();

    if (!(networkName in LZ_EIDS)) {
        throw new Error(`Network ${networkName} not configured in LZ_EIDS`);
    }

    const localAddress = getDeployedAddress(networkName);
    const onft = await viem.getContractAt("PayableONFT", localAddress);

    // Get all other deployed networks
    const allDeployed = getDeployedNetworks();
    const peers = allDeployed.filter(d => d.network !== networkName);

    if (peers.length === 0) {
        console.log("⚠️  No other networks deployed yet. Deploy on at least one more chain first.");
        console.log("    Run: bunx hardhat run scripts/deploy.ts --network <name>");
        return;
    }

    console.log(`Setting peers on ${networkName} (${localAddress})`);
    console.log(`Found ${peers.length} peer network(s) to connect:\n`);

    for (const peer of peers) {
        const peerEid = LZ_EIDS[peer.network];
        const peerBytes32 = pad(peer.address, { size: 32 });

        console.log(`  → ${peer.network}`);
        console.log(`    Address: ${peer.address}`);
        console.log(`    EID: ${peerEid}`);
        console.log(`    Bytes32: ${peerBytes32}`);

        const hash = await onft.write.setPeer([peerEid, peerBytes32]);
        console.log(`    ✅ Tx: ${hash}\n`);
    }

    console.log(`\n✅ All ${peers.length} peer(s) set successfully on ${networkName}!`);

    // Remind to run on other chains too
    const otherChains = allDeployed
        .filter(d => d.network !== networkName)
        .map(d => `  bunx hardhat run scripts/setPeer.ts --network ${d.network}`);

    console.log("\nDon't forget to run setPeer on the other chains too:");
    console.log(otherChains.join("\n"));
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
