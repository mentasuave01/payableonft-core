import assert from "node:assert/strict";
import { describe, it, before } from "node:test";
import { network } from "hardhat";
import { parseUnits, getAddress, pad, encodePacked } from "viem";

/**
 * End-to-end cross-chain minting test for Lazy Bridge architecture.
 *
 * Flow: User on Chain B pays USDC → 20-byte mint message sent to Origin A
 *       → Origin A mints NFT to user's address (stays on Origin)
 *       → User bridges later via standard ONFT send() if desired
 */
describe("PayableONFT - Lazy Bridge Cross-Chain", async function () {
    const { viem } = await network.connect();
    const publicClient = await viem.getPublicClient();
    const walletClients = await viem.getWalletClients();

    const owner = walletClients[0];
    const user1 = walletClients[1];

    const MINT_PRICE = parseUnits("10", 6); // 10 USDC
    const ORIGIN_EID = 40231; // Chain A (Origin)
    const REMOTE_EID = 40232; // Chain B (Remote)

    let mockUsdcA: any;
    let mockEndpointA: any;
    let onftA: any; // Origin

    let mockUsdcB: any;
    let mockEndpointB: any;
    let onftB: any; // Remote

    before(async () => {
        // Deploy on Chain A (Origin)
        mockUsdcA = await viem.deployContract("MockUSDC");
        mockEndpointA = await viem.deployContract("MockLzEndpoint", [ORIGIN_EID]);
        onftA = await viem.deployContract("PayableONFT", [
            "OmniUSDC NFT A", "ONFT", mockEndpointA.address, owner.account.address, mockUsdcA.address, ORIGIN_EID
        ]);

        // Deploy on Chain B (Remote)
        mockUsdcB = await viem.deployContract("MockUSDC");
        mockEndpointB = await viem.deployContract("MockLzEndpoint", [REMOTE_EID]);
        onftB = await viem.deployContract("PayableONFT", [
            "OmniUSDC NFT B", "ONFT", mockEndpointB.address, owner.account.address, mockUsdcB.address, ORIGIN_EID
        ]);

        // Wire Peers
        const peerA = pad(onftA.address as `0x${string}`, { size: 32 });
        const peerB = pad(onftB.address as `0x${string}`, { size: 32 });
        await onftA.write.setPeer([REMOTE_EID, peerB]);
        await onftB.write.setPeer([ORIGIN_EID, peerA]);

        // Fund User on Chain B with USDC
        await mockUsdcB.write.mint([user1.account.address, parseUnits("1000", 6)]);
        await user1.writeContract({
            address: mockUsdcB.address,
            abi: mockUsdcB.abi,
            functionName: "approve",
            args: [onftB.address, MINT_PRICE]
        });

        // Fund Mock Endpoints for gas
        const testClient = await viem.getTestClient();
        await testClient.setBalance({
            address: mockEndpointA.address,
            value: parseUnits("1", 18)
        });
        await testClient.setBalance({
            address: mockEndpointB.address,
            value: parseUnits("1", 18)
        });
    });

    it("Should mint locally on Origin", async () => {
        await mockUsdcA.write.mint([user1.account.address, MINT_PRICE]);
        await user1.writeContract({
            address: mockUsdcA.address,
            abi: mockUsdcA.abi,
            functionName: "approve",
            args: [onftA.address, MINT_PRICE]
        });

        await user1.writeContract({
            address: onftA.address,
            abi: onftA.abi,
            functionName: "mint",
            args: ["0x"]
        });

        const ownerOf1 = await onftA.read.ownerOf([1n]);
        assert.equal(getAddress(ownerOf1), getAddress(user1.account.address));
        console.log("✅ Local mint on Origin works");
    });

    it("Should request mint from Remote (Lazy Bridge — no round trip)", async () => {
        // User calls mint on Chain B (Remote)
        await user1.writeContract({
            address: onftB.address,
            abi: onftB.abi,
            functionName: "mint",
            args: ["0x"],
            value: parseUnits("0.01", 18) // LZ fee only (no NativeDrop!)
        });

        // Verify USDC was collected on Chain B
        const bal = await mockUsdcB.read.balanceOf([user1.account.address]);
        assert.equal(bal, parseUnits("990", 6)); // 1000 - 10

        // --- SIMULATE LZ MESSAGE DELIVERY B → A ---
        // Lazy Bridge message is just 20 bytes: the user's address
        const mintPayload = encodePacked(
            ['address'],
            [user1.account.address]
        );

        // Verify message is exactly 20 bytes (our optimization)
        assert.equal(mintPayload.length, 42); // "0x" + 40 hex chars = 20 bytes
        console.log(`   Message size: ${(mintPayload.length - 2) / 2} bytes (vs 64+ for ONFT codec)`);

        const testClient = await viem.getTestClient();
        await testClient.impersonateAccount({ address: mockEndpointA.address });

        const originParam = {
            srcEid: REMOTE_EID,
            sender: pad(onftB.address as `0x${string}`, { size: 32 }),
            nonce: 1n
        };
        const guid = "0x" + "ab".repeat(32) as `0x${string}`;

        // Deliver the mint message to Origin
        await walletClients[0].writeContract({
            address: onftA.address,
            abi: onftA.abi,
            functionName: "lzReceive",
            args: [
                originParam,
                guid,
                mintPayload,
                "0x0000000000000000000000000000000000000000",
                "0x"
            ],
            account: mockEndpointA.address
        });

        // --- VERIFY NFT MINTED ON ORIGIN TO USER ---
        const nextId = await onftA.read.nextTokenId();
        assert.equal(nextId, 3n); // 1 was local, 2 was cross-chain. Next is 3.

        // NFT #2 should exist AND belong to user1 ON ORIGIN (not burned!)
        const ownerOf2 = await onftA.read.ownerOf([2n]);
        assert.equal(getAddress(ownerOf2), getAddress(user1.account.address));

        console.log("✅ Lazy Bridge cross-chain mint: NFT #2 minted to user on Origin");
        console.log("   No return trip! User can bridge later via send() if needed.");
    });
});
