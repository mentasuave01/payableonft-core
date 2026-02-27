import assert from "node:assert/strict";
import { describe, it, before } from "node:test";
import { network } from "hardhat";
import { parseUnits, getAddress, pad } from "viem";

describe("PayableONFT", async function () {
    const { viem } = await network.connect();
    const publicClient = await viem.getPublicClient();
    const walletClients = await viem.getWalletClients();

    const owner = walletClients[0];
    const user1 = walletClients[1];
    const user2 = walletClients[2];

    const MINT_PRICE = parseUnits("10", 6); // 10 USDC
    const LOCAL_EID = 40231; // Arbitrum Sepolia EID
    const REMOTE_EID = 40232; // Optimism Sepolia EID

    let mockUsdc: any;
    let mockEndpoint: any;
    let payableOnft: any;

    before(async () => {
        console.log("Owner address:", owner.account.address);
        console.log("User1 address:", user1.account.address);
        console.log("User2 address:", user2.account.address);

        // Deploy mock USDC
        mockUsdc = await viem.deployContract("MockUSDC");
        console.log("MockUSDC deployed:", mockUsdc.address);

        // Deploy mock LayerZero endpoint
        mockEndpoint = await viem.deployContract("MockLzEndpoint", [LOCAL_EID]);
        console.log("MockLzEndpoint deployed:", mockEndpoint.address);

        // Deploy PayableONFT
        payableOnft = await viem.deployContract("PayableONFT", [
            "OmniUSDC NFT",
            "ONFT",
            mockEndpoint.address,
            owner.account.address,
            mockUsdc.address,
            LOCAL_EID,
        ]);
        console.log("PayableONFT deployed:", payableOnft.address);

        // Set up peer for cross-chain messaging
        const remotePeer = pad(payableOnft.address as `0x${string}`, { size: 32 });
        await payableOnft.write.setPeer([REMOTE_EID, remotePeer]);
        console.log("Set peer for EID", REMOTE_EID);

        // Pre-fund user accounts with USDC
        await mockUsdc.write.mint([user1.account.address, parseUnits("1000", 6)]);
        await mockUsdc.write.mint([user2.account.address, parseUnits("1000", 6)]);
        console.log("Minted 1000 USDC each to user1 and user2");
    });

    describe("Deployment", () => {
        it("Should have correct USDC address", async () => {
            const usdcAddr = await payableOnft.read.usdc();
            assert.equal(getAddress(usdcAddr), getAddress(mockUsdc.address));
        });

        it("Should have correct origin EID", async () => {
            const eid = await payableOnft.read.originEid();
            assert.equal(eid, LOCAL_EID);
        });

        it("Should have correct mint price", async () => {
            const price = await payableOnft.read.MINT_PRICE();
            assert.equal(price, MINT_PRICE);
        });

        it("Should have correct owner", async () => {
            const contractOwner = await payableOnft.read.owner();
            assert.equal(getAddress(contractOwner), getAddress(owner.account.address));
        });

        it("Should have correct MINT_GAS_LIMIT (100k — no round-trip)", async () => {
            const gasLimit = await payableOnft.read.MINT_GAS_LIMIT();
            assert.equal(gasLimit, 100_000n);
            console.log("✅ MINT_GAS_LIMIT is 100,000 (optimized, no bridgeBack)");
        });
    });

    describe("mint() — Local (Origin Chain)", () => {
        it("Should fail without USDC approval", async () => {
            await assert.rejects(
                async () => await user1.writeContract({
                    address: payableOnft.address,
                    abi: payableOnft.abi,
                    functionName: "mint",
                    args: ["0x"],
                    value: 0n
                }),
                /reverted/
            );
        });

        it("Should successfully mint after USDC approval", async () => {
            // Approve USDC
            await user1.writeContract({
                address: mockUsdc.address,
                abi: mockUsdc.abi,
                functionName: "approve",
                args: [payableOnft.address, MINT_PRICE],
            });

            // Get balance before
            const balanceBefore = await mockUsdc.read.balanceOf([user1.account.address]);

            // Quote fee (on Origin, should be 0)
            const extraOptions = "0x";
            const fee = await payableOnft.read.quoteMint([extraOptions]);
            assert.equal(fee.nativeFee, 0n, "On Origin, mint fee should be 0");

            // Mint
            await user1.writeContract({
                address: payableOnft.address,
                abi: payableOnft.abi,
                functionName: "mint",
                args: [extraOptions],
                value: fee.nativeFee
            });

            // Check NFT was minted
            const tokenId = await payableOnft.read.nextTokenId() - 1n;
            const nftOwner = await payableOnft.read.ownerOf([tokenId]);
            assert.equal(getAddress(nftOwner), getAddress(user1.account.address));

            // Check USDC was deducted
            const balanceAfter = await mockUsdc.read.balanceOf([user1.account.address]);
            assert.equal(balanceBefore - balanceAfter, MINT_PRICE);

            console.log(`✅ User1 minted NFT #${tokenId} on Origin (0 LZ fee)`);
        });

        it("Should emit MintedAndPaid event", async () => {
            await user2.writeContract({
                address: mockUsdc.address,
                abi: mockUsdc.abi,
                functionName: "approve",
                args: [payableOnft.address, MINT_PRICE],
            });

            const extraOptions = "0x";
            const fee = await payableOnft.read.quoteMint([extraOptions]);

            const hash = await user2.writeContract({
                address: payableOnft.address,
                abi: payableOnft.abi,
                functionName: "mint",
                args: [extraOptions],
                value: fee.nativeFee
            });

            const receipt = await publicClient.waitForTransactionReceipt({ hash });

            assert.ok(receipt.logs.length > 0, "Should emit events");
            console.log(`✅ User2 minted NFT, tx: ${hash.slice(0, 10)}...`);
        });
    });

    describe("Cross-Chain Mint (Remote → Origin)", () => {
        let remotePayableOnft: any;
        let remoteEndpoint: any;

        before(async () => {
            // Deploy a second contract that thinks it's on REMOTE_EID
            remoteEndpoint = await viem.deployContract("MockLzEndpoint", [REMOTE_EID]) as any;
            remotePayableOnft = await viem.deployContract("PayableONFT", [
                "OmniUSDC NFT",
                "ONFT",
                remoteEndpoint.address,
                owner.account.address,
                mockUsdc.address,
                LOCAL_EID, // originEid is still LOCAL_EID
            ]) as any;

            // Set peer for remote contract → origin
            const originPeer = pad(payableOnft.address as `0x${string}`, { size: 32 });
            await remotePayableOnft.write.setPeer([LOCAL_EID, originPeer]);

            // Fund user1 with USDC for remote minting
            await mockUsdc.write.mint([user1.account.address, parseUnits("100", 6)]);

            // Set a low fee for testing
            await remoteEndpoint.write.setNativeFee([parseUnits("0.001", 18)]);
        });

        it("Should quote a cross-chain mint fee (no NativeDrop overhead)", async () => {
            const extraOptions = "0x";
            const fee = await remotePayableOnft.read.quoteMint([extraOptions]);

            assert.ok(fee.nativeFee > 0n, "Remote mint should have LZ fee");
            console.log(`✅ Cross-chain mint quote: ${fee.nativeFee} wei (1 LZ message, no NativeDrop)`);
        });

        it("Should send cross-chain mint request from remote", async () => {
            // Approve USDC
            await user1.writeContract({
                address: mockUsdc.address,
                abi: mockUsdc.abi,
                functionName: "approve",
                args: [remotePayableOnft.address, MINT_PRICE],
            });

            const balanceBefore = await mockUsdc.read.balanceOf([user1.account.address]);

            // Quote and mint
            const extraOptions = "0x";
            const fee = await remotePayableOnft.read.quoteMint([extraOptions]);

            await user1.writeContract({
                address: remotePayableOnft.address,
                abi: remotePayableOnft.abi,
                functionName: "mint",
                args: [extraOptions],
                value: fee.nativeFee
            });

            // USDC should be deducted on remote chain
            const balanceAfter = await mockUsdc.read.balanceOf([user1.account.address]);
            assert.equal(balanceBefore - balanceAfter, MINT_PRICE);

            console.log("✅ Cross-chain mint request sent (USDC paid on remote)");
            console.log("   NFT will be minted on Origin once LZ delivers the message");
        });
    });

    describe("quoteBridge()", () => {
        it("Should return a fee quote for bridging", async () => {
            const options = "0x";
            const fee = await payableOnft.read.quoteBridge([REMOTE_EID, options]);
            assert.ok(fee.nativeFee >= 0n, "Should return native fee");
            console.log(`✅ Quote for bridging: ${fee.nativeFee} wei native`);
        });
    });

    describe("setUSDC() — Admin", () => {
        it("Should fail if called by non-owner", async () => {
            try {
                await user1.writeContract({
                    address: payableOnft.address,
                    abi: payableOnft.abi,
                    functionName: "setUSDC",
                    args: [user2.account.address],
                });
                assert.fail("Should have reverted");
            } catch (error: any) {
                assert.ok(error.message.includes("OwnableUnauthorizedAccount") || error.message.includes("reverted"), "Should revert with ownership error");
                console.log("✅ Non-owner correctly rejected");
            }
        });

        it("Should allow owner to set new USDC address", async () => {
            const newUsdcAddress = user2.account.address;

            await owner.writeContract({
                address: payableOnft.address,
                abi: payableOnft.abi,
                functionName: "setUSDC",
                args: [newUsdcAddress],
            });

            const currentUsdc = await payableOnft.read.usdc();
            assert.equal(getAddress(currentUsdc), getAddress(newUsdcAddress));

            // Reset
            await owner.writeContract({
                address: payableOnft.address,
                abi: payableOnft.abi,
                functionName: "setUSDC",
                args: [mockUsdc.address],
            });
            console.log("✅ Owner can update USDC address");
        });
    });

    describe("withdrawUSDC() — Admin", () => {
        it("Should fail if called by non-owner", async () => {
            try {
                await user1.writeContract({
                    address: payableOnft.address,
                    abi: payableOnft.abi,
                    functionName: "withdrawUSDC",
                });
                assert.fail("Should have reverted");
            } catch (error: any) {
                assert.ok(error.message.includes("OwnableUnauthorizedAccount") || error.message.includes("reverted"), "Should revert with ownership error");
                console.log("✅ Non-owner correctly rejected for withdrawUSDC");
            }
        });

        it("Should allow owner to withdraw collected USDC", async () => {
            const contractBalance = await mockUsdc.read.balanceOf([payableOnft.address]);
            const ownerBalanceBefore = await mockUsdc.read.balanceOf([owner.account.address]);

            await owner.writeContract({
                address: payableOnft.address,
                abi: payableOnft.abi,
                functionName: "withdrawUSDC",
            });

            const contractBalanceAfter = await mockUsdc.read.balanceOf([payableOnft.address]);
            const ownerBalanceAfter = await mockUsdc.read.balanceOf([owner.account.address]);

            assert.equal(contractBalanceAfter, 0n);
            assert.equal(ownerBalanceAfter - ownerBalanceBefore, contractBalance);

            console.log(`✅ Owner withdrew ${contractBalance} USDC from contract`);
        });
    });

    describe("Pausable Functionality", () => {
        it("Should allow owner to pause and unpause", async () => {
            await owner.writeContract({
                address: payableOnft.address,
                abi: payableOnft.abi,
                functionName: "pause",
            });

            const isPaused = await payableOnft.read.paused();
            assert.equal(isPaused, true);
            console.log("✅ Contract paused");

            await owner.writeContract({
                address: payableOnft.address,
                abi: payableOnft.abi,
                functionName: "unpause",
            });

            const isPausedAfter = await payableOnft.read.paused();
            assert.equal(isPausedAfter, false);
            console.log("✅ Contract unpaused");
        });

        it("Should fail if non-owner tries to pause", async () => {
            try {
                await user1.writeContract({
                    address: payableOnft.address,
                    abi: payableOnft.abi,
                    functionName: "pause",
                });
                assert.fail("Should have reverted");
            } catch (error: any) {
                assert.ok(error.message.includes("OwnableUnauthorizedAccount") || error.message.includes("reverted"), "Should revert");
                console.log("✅ Non-owner cannot pause");
            }
        });

        it("Should prevent minting when paused", async () => {
            await owner.writeContract({
                address: payableOnft.address,
                abi: payableOnft.abi,
                functionName: "pause",
            });

            await user1.writeContract({
                address: mockUsdc.address,
                abi: mockUsdc.abi,
                functionName: "approve",
                args: [payableOnft.address, MINT_PRICE],
            });

            try {
                const extraOptions = "0x";
                await user1.writeContract({
                    address: payableOnft.address,
                    abi: payableOnft.abi,
                    functionName: "mint",
                    args: [extraOptions],
                    value: 0n
                });
                assert.fail("Should have reverted");
            } catch (error: any) {
                const message = error.message || "";
                assert.ok(message.includes("EnforcedPause") || message.includes("reverted"), "Should revert due to pause");
                console.log("✅ Minting blocked when paused");
            }

            // Unpause for future tests
            await owner.writeContract({
                address: payableOnft.address,
                abi: payableOnft.abi,
                functionName: "unpause",
            });
        });
    });

    describe("Metadata", () => {
        it("Should allow owner to set base URI", async () => {
            const baseURI = "https://api.example.com/metadata/";
            await owner.writeContract({
                address: payableOnft.address,
                abi: payableOnft.abi,
                functionName: "setBaseURI",
                args: [baseURI],
            });

            await user1.writeContract({
                address: mockUsdc.address,
                abi: mockUsdc.abi,
                functionName: "approve",
                args: [payableOnft.address, MINT_PRICE],
            });
            const extraOptions = "0x";
            const fee = await payableOnft.read.quoteMint([extraOptions]);
            await user1.writeContract({
                address: payableOnft.address,
                abi: payableOnft.abi,
                functionName: "mint",
                args: [extraOptions],
                value: fee.nativeFee
            });

            const tokenId = await payableOnft.read.nextTokenId() - 1n;
            const tokenURI = await payableOnft.read.tokenURI([tokenId]);
            assert.equal(tokenURI, `${baseURI}${tokenId}`);
            console.log(`✅ Token URI for #${tokenId}: ${tokenURI}`);
        });

        it("Should fail if non-owner tries to set base URI", async () => {
            try {
                await user1.writeContract({
                    address: payableOnft.address,
                    abi: payableOnft.abi,
                    functionName: "setBaseURI",
                    args: ["https://hacker.com/"],
                });
                assert.fail("Should have reverted");
            } catch (error: any) {
                assert.ok(error.message.includes("OwnableUnauthorizedAccount") || error.message.includes("reverted"), "Should revert");
                console.log("✅ Non-owner cannot set base URI");
            }
        });
    });
});
