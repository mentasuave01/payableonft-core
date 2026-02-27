import { network } from "hardhat";
import { LZ_EIDS, type NetworkName, getDeployedAddress, getDeployedNetworks } from "./constants.js";
import { pad } from "viem";

/**
 * Checks if peers are correctly set for cross-chain communication.
 * Run this on EACH chain to verify peer configuration.
 *
 * Usage:
 *   bunx hardhat run scripts/checkPeers.ts --network arbitrumMainnet
 *
 * Or check all deployed networks at once:
 *   for /f %n in ('echo arbitrumMainnet optimismMainnet baseMainnet') do bunx hardhat run scripts/checkPeers.ts --network %n
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
    const SKIP_NETWORKS = ["hardhatMainnet", "localhost"];
    const peers = allDeployed.filter(d => d.network !== networkName && !SKIP_NETWORKS.includes(d.network));

    if (peers.length === 0) {
        console.log("⚠️  No other networks deployed yet. Nothing to check.");
        return;
    }

    console.log(`\n🔍 Checking peers on ${networkName} (${localAddress})\n`);
    console.log(`${"Network".padEnd(20)} ${"EID".padEnd(8)} ${"Expected".padEnd(44)} ${"On-Chain".padEnd(44)} Status`);
    console.log("─".repeat(130));

    let allCorrect = true;

    for (const peer of peers) {
        const peerEid = LZ_EIDS[peer.network];
        const expectedPeer = pad(peer.address, { size: 32 }).toLowerCase();

        // Read the on-chain peer value
        const onChainPeer = ((await onft.read.peers([peerEid])) as string).toLowerCase();

        const isSet = onChainPeer !== "0x" + "0".repeat(64);
        const isCorrect = onChainPeer === expectedPeer;

        let status: string;
        if (!isSet) {
            status = "❌ NOT SET";
            allCorrect = false;
        } else if (isCorrect) {
            status = "✅ OK";
        } else {
            status = "⚠️  MISMATCH";
            allCorrect = false;
        }

        console.log(
            `${peer.network.padEnd(20)} ${String(peerEid).padEnd(8)} ${expectedPeer.slice(0, 42)}... ${onChainPeer.slice(0, 42)}... ${status}`
        );

        if (isSet && !isCorrect) {
            console.log(`   Expected: ${expectedPeer}`);
            console.log(`   Got:      ${onChainPeer}`);
        }
    }

    console.log("─".repeat(130));

    if (allCorrect) {
        console.log(`\n✅ All ${peers.length} peer(s) are correctly set on ${networkName}!\n`);
    } else {
        console.log(`\n❌ Some peers are missing or incorrect on ${networkName}.`);
        console.log(`   Fix with: bunx hardhat run scripts/setPeer.ts --network ${networkName}\n`);
    }
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
