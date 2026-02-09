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
