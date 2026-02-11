import { network } from "hardhat";
import { getDeployedAddress } from "./constants.js";
import { parseUnits } from "viem";

async function main() {
    const { viem, networkName } = await network.connect();
    const [wallet] = await viem.getWalletClients();
    const publicClient = await viem.getPublicClient();

    console.log(`\n🌊 Starting Demo Flow on ${networkName}`);
    console.log(`Address: ${wallet.account.address}`);

    // 1. Get Contracts
    const payableOnftAddress = getDeployedAddress(networkName);
    const payableOnft = await viem.getContractAt("PayableONFT", payableOnftAddress);
    console.log(`Contract: ${payableOnft.address}`);

    const usdcAddress = await payableOnft.read.usdc();
    // Assuming standard ERC20 ABI for USDC
    const usdc = await viem.getContractAt("MockUSDC", usdcAddress);
    console.log(`USDC: ${usdcAddress}`);

    // 2. Approve USDC
    // Retrieve MINT_PRICE from contract to be sure (it's public constant but good practice)
    const mintPrice = await payableOnft.read.MINT_PRICE();
    console.log(`Mint Price: ${mintPrice} units`);

    console.log("Approving USDC...");
    const approveHash = await usdc.write.approve([payableOnftAddress, mintPrice]);
    await publicClient.waitForTransactionReceipt({ hash: approveHash });
    console.log("✅ Approved");

    // 3. Mint
    console.log("Minting...");
    // Local mint (if on origin) or Remote mint req?
    // The contract logic handles it, but we need to pay native fee if it's a cross-chain request or if we want to drop gas?
    // quoteMint returns the fee.
    const extraOptions = "0x";
    const fee = await payableOnft.read.quoteMint([extraOptions]);
    console.log(`Quote Fee: ${fee.nativeFee} native`);

    const mintHash = await payableOnft.write.mint([extraOptions], { value: fee.nativeFee });
    console.log(`Tx Sent: ${mintHash}`);
    const receipt = await publicClient.waitForTransactionReceipt({ hash: mintHash });
    console.log("✅ Minted");

    // 4. Set Base URI
    console.log("Setting Base URI...");
    const baseURI = "https://example.com/api/metadata/";
    const uriHash = await payableOnft.write.setBaseURI([baseURI]);
    await publicClient.waitForTransactionReceipt({ hash: uriHash });
    console.log(`✅ Base URI set to: ${baseURI}`);

    // Check URI of latest token
    const nextTokenId = await payableOnft.read.nextTokenId();
    const lastTokenId = nextTokenId - 1n;
    if (lastTokenId > 0n) {
        const tokenURI = await payableOnft.read.tokenURI([lastTokenId]);
        console.log(`Token URI for #${lastTokenId}: ${tokenURI}`);
    } else {
        console.log("No tokens minted yet?");
    }
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
