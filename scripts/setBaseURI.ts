
import { network } from "hardhat";
import { getDeployedAddress } from "./constants.js";

/**
 * Set the Base URI for the PayableONFT contract.
 *
 * Usage:
 *   BASE_URI="ipfs://QmYourHash/" bunx hardhat run scripts/setBaseURI.ts --network arbitrumSepolia
 */

async function main() {
    const { viem } = await network.connect();
    const networkName = network.name;

    // Get the Base URI from environment variable
    const baseURI = process.env.BASE_URI;
    if (!baseURI) {
        throw new Error("Missing BASE_URI environment variable. Usage: BASE_URI='ipfs://...' bunx hardhat run scripts/setBaseURI.ts --network <network>");
    }

    // Read contract address from deployments.json
    const onftAddress = getDeployedAddress(networkName);

    const publicClient = await viem.getPublicClient();
    const [wallet] = await viem.getWalletClients();

    console.log("Setting Base URI on", networkName);
    console.log("Contract:", onftAddress);
    console.log("Wallet:", wallet.account.address);
    console.log("New Base URI:", baseURI);

    const onft = await viem.getContractAt("PayableONFT", onftAddress);

    // Check current URI
    // @ts-ignore - _baseURI is internal, so we can't read it directly easily via viem unless we use storage or if it was public. 
    // But we can check tokenURI if a token exists, or just trust the setBaseURI call.
    // Actually ONFT721 inherits from ERC721 which has no public baseURI getter by default usually, but ONFT721 implementation might.
    // Looking at ONFT721.sol provided earlier: 
    // function _baseURI() internal view override returns (string memory) { return baseTokenURI; }
    // It is internal.
    // But there is a public `tokenURI(tokenId)`.

    console.log("\nSetting Base URI...");
    const hash = await onft.write.setBaseURI([baseURI]);
    console.log("Tx hash:", hash);

    await publicClient.waitForTransactionReceipt({ hash });
    console.log("✅ Base URI set successfully!");
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
