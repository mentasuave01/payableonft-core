import assert from "node:assert/strict";
import { describe, it, before } from "node:test";
import { network } from "hardhat";
import { parseUnits, getAddress, pad, encodePacked } from "viem";

describe("PayableONFT - Centralized Minting", async function () {
    const { viem } = await network.connect();

    // ... (rest of setup)

    // And update usage:
    // await hre.network.provider.request(...)
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
        // Deploy Mocks on Chain A
        mockUsdcA = await viem.deployContract("MockUSDC");
        mockEndpointA = await viem.deployContract("MockLzEndpoint", [ORIGIN_EID]);

        // Deploy PayableONFT on Chain A (Origin)
        // originEid = ORIGIN_EID
        onftA = await viem.deployContract("PayableONFT", [
            "OmniUSDC NFT A", "ONFT", mockEndpointA.address, owner.account.address, mockUsdcA.address, ORIGIN_EID
        ]);

        // Deploy Mocks on Chain B
        mockUsdcB = await viem.deployContract("MockUSDC");
        mockEndpointB = await viem.deployContract("MockLzEndpoint", [REMOTE_EID]);

        // Deploy PayableONFT on Chain B (Remote)
        // originEid = ORIGIN_EID (Same as A)
        onftB = await viem.deployContract("PayableONFT", [
            "OmniUSDC NFT B", "ONFT", mockEndpointB.address, owner.account.address, mockUsdcB.address, ORIGIN_EID
        ]);

        // Wire Peers
        const peerA = pad(onftA.address as `0x${string}`, { size: 32 });
        const peerB = pad(onftB.address as `0x${string}`, { size: 32 });

        await onftA.write.setPeer([REMOTE_EID, peerB]);
        await onftB.write.setPeer([ORIGIN_EID, peerA]);

        // Fund User on Chain B (Remote)
        await mockUsdcB.write.mint([user1.account.address, parseUnits("1000", 6)]);
        await user1.writeContract({
            address: mockUsdcB.address,
            abi: mockUsdcB.abi,
            functionName: "approve",
            args: [onftB.address, MINT_PRICE]
        });

        // Fund Contract A with ETH for return trip (since we are not actually processing the NativeDrop in Mock)
        // In real world, NativeDrop would fund it. In test, we just send it eth.
        // Fund Contract A with ETH for return trip
        await walletClients[0].sendTransaction({
            to: onftA.address,
            value: parseUnits("1", 18)
        });

        // Fund Mock Endpoints using setBalance (admin override)
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
        // Approve
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
            args: ["0x"] // extraOptions
        });

        const ownerOf1 = await onftA.read.ownerOf([1n]);
        assert.equal(getAddress(ownerOf1), getAddress(user1.account.address));
    });

    it("Should request mint from Remote", async () => {
        // User Calls Mint on B
        const hash = await user1.writeContract({
            address: onftB.address,
            abi: onftB.abi,
            functionName: "mint",
            args: ["0x"],
            value: parseUnits("0.1", 18) // for LZ fee + Drop
        });

        // Verify B burned the USDC
        const bal = await mockUsdcB.read.balanceOf([user1.account.address]);
        // 1000 - 10 = 990
        assert.equal(bal, parseUnits("990", 6));

        // --- SIMULATE MESSAGE DELIVERY B -> A ---
        // Payload: [to(32), tokenId(32), composeMsg(variable)]
        // In _requestMint: to = address(this) (Origin Contract), tokenId = MAX

        // Construct the message manually as we don't have the codec js lib
        // ONFT721MsgCodec.encode(to, tokenId, composeMsg)
        // to is bytes32
        const toBytes32 = pad(onftA.address as `0x${string}`, { size: 32 });
        const tokenId = 2n ** 256n - 1n; // MAX UINT
        // Pack: to (32) + tokenId (32)
        // Since composeMsg is empty, it's just that.
        const payload = encodePacked(
            ['bytes32', 'uint256'],
            [toBytes32, tokenId]
        );

        // Impersonate Endpoint A to call lzReceive
        const testClient = await viem.getTestClient();
        await testClient.impersonateAccount({ address: mockEndpointA.address });

        // Send lzReceive to A
        const originParam = {
            srcEid: REMOTE_EID,
            sender: pad(onftB.address as `0x${string}`, { size: 32 }),
            nonce: 1n
        };
        const guid = "0x" + "11".repeat(32) as `0x${string}`; // Mock GUID

        // Use existing wallet client but override account to be the impersonated mock endpoint
        await walletClients[0].writeContract({
            address: onftA.address,
            abi: onftA.abi,
            functionName: "lzReceive",
            args: [
                originParam,
                guid,
                payload,
                "0x0000000000000000000000000000000000000000", // executor
                "0x" // extraData
            ],
            account: mockEndpointA.address // Override sender
        });

        // --- VERIFY A MINTED AND BURNED ---
        const nextId = await onftA.read.nextTokenId();
        assert.equal(nextId, 3n); // 1 was local, 2 was this one. Next is 3.

        // Verify ID 2 is burned (owner should be 0x0 or revert)
        // OpenZeppelin ERC721 ownerOf reverts if nonexistent.
        // But _burn removes it. so it should revert.
        await assert.rejects(async () => {
            await onftA.read.ownerOf([2n]);
        });

        // --- SIMULATE MESSAGE DELIVERY A -> B ---
        // A sends back to user1.
        // Payload: [to(User1), tokenId(2)]
        const user1Bytes32 = pad(user1.account.address, { size: 32 });
        const payloadBack = encodePacked(
            ['bytes32', 'uint256'],
            [user1Bytes32, 2n]
        );

        await testClient.impersonateAccount({ address: mockEndpointB.address });

        await walletClients[0].writeContract({
            address: onftB.address,
            abi: onftB.abi,
            functionName: "lzReceive",
            args: [
                { srcEid: ORIGIN_EID, sender: pad(onftA.address, { size: 32 }), nonce: 1n },
                guid,
                payloadBack,
                "0x0000000000000000000000000000000000000000",
                "0x"
            ],
            account: mockEndpointB.address
        });

        // --- VERIFY B HAS NFT ---
        const ownerOf2 = await onftB.read.ownerOf([2n]);
        assert.equal(getAddress(ownerOf2), getAddress(user1.account.address));

        console.log("✅ Cross-chain minting successful (B -> A -> B)");
    });
});
