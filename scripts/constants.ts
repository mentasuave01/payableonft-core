import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

// ============================================================
// Network Configuration
// To add a new network:
//   1. Add entries to LZ_ENDPOINTS, LZ_EIDS, USDC_ADDRESSES, CHAIN_IDS
//   2. Add network to hardhat.config.ts
//   3. Add RPC URL to .env
//   4. Add empty entry to deployments.json
// ============================================================

// LayerZero V2 Endpoint addresses (same on most testnets)
export const LZ_ENDPOINTS = {
    arbitrumSepolia: "0x6EDCE65403992e310A62460808c4b910D972f10f",
    optimismSepolia: "0x6EDCE65403992e310A62460808c4b910D972f10f",
    sepolia: "0x6EDCE65403992e310A62460808c4b910D972f10f",
} as const;

// LayerZero Endpoint IDs (EIDs)
export const LZ_EIDS = {
    arbitrumSepolia: 40231,
    optimismSepolia: 40232,
    sepolia: 40161,
} as const;

// USDC testnet addresses (Circle Testnet USDC)
export const USDC_ADDRESSES = {
    arbitrumSepolia: "0x75faf114eafb1BDbe2F031385358e18504701200",
    optimismSepolia: "0x5fd84259d66Cd46123540766Be93DFE6D43130D7",
    sepolia: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238",
} as const;

// Chain IDs
export const CHAIN_IDS = {
    arbitrumSepolia: 421614,
    optimismSepolia: 11155420,
    sepolia: 11155111,
} as const;

export type NetworkName = keyof typeof LZ_ENDPOINTS;

// The network that hosts the central minting logic
export const ORIGIN_NETWORK: NetworkName = "arbitrumSepolia";

// ============================================================
// Deployment Registry Helpers
// ============================================================

const DEPLOYMENTS_PATH = resolve(import.meta.dirname!, "..", "deployments.json");

export type Deployments = Record<string, string>;

/** Read all deployments from deployments.json */
export function getDeployments(): Deployments {
    const raw = readFileSync(DEPLOYMENTS_PATH, "utf-8");
    return JSON.parse(raw);
}

/** Get the deployed contract address for a specific network. Throws if not deployed. */
export function getDeployedAddress(network: string): `0x${string}` {
    const deployments = getDeployments();
    const addr = deployments[network];
    if (!addr) {
        throw new Error(
            `No deployment found for "${network}". Deploy first with: bunx hardhat run scripts/deploy.ts --network ${network}`
        );
    }
    return addr as `0x${string}`;
}

/** Save a deployment address for a network */
export function saveDeployment(network: string, address: string): void {
    const deployments = getDeployments();
    deployments[network] = address;
    writeFileSync(DEPLOYMENTS_PATH, JSON.stringify(deployments, null, 2) + "\n");
}

/** Get all networks that have been deployed (non-empty address) */
export function getDeployedNetworks(): { network: NetworkName; address: `0x${string}` }[] {
    const deployments = getDeployments();
    return Object.entries(deployments)
        .filter(([_, addr]) => addr !== "")
        .map(([network, addr]) => ({
            network: network as NetworkName,
            address: addr as `0x${string}`,
        }));
}
