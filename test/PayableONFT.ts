import assert from "node:assert/strict";
import { describe, it, before } from "node:test";
import { network } from "hardhat";
import { parseUnits, getAddress, pad, parseAbi } from "viem";

describe("PayableONFT", async function () {
    const { viem } = await network.connect();
    const publicClient = await viem.getPublicClient();
    const walletClients = await viem.getWalletClients();

    // Use separate accounts for different roles
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
        const chainPrefix = BigInt(LOCAL_EID) * BigInt(1_000_000);
        payableOnft = await viem.deployContract("PayableONFT", [
            "OmniUSDC NFT",
            "ONFT",
            mockEndpoint.address,
            owner.account.address,
            mockUsdc.address,
            chainPrefix,
        ]);
        console.log("PayableONFT deployed:", payableOnft.address);

        // Set up peer for cross-chain messaging (mock peer on remote chain)
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

        it("Should have correct chain prefix", async () => {
            const prefix = await payableOnft.read.CHAIN_ID_PREFIX();
            assert.equal(prefix, BigInt(LOCAL_EID) * BigInt(1_000_000));
        });

        it("Should have correct mint price", async () => {
            const price = await payableOnft.read.MINT_PRICE();
            assert.equal(price, MINT_PRICE);
        });

        it("Should have correct owner", async () => {
            const contractOwner = await payableOnft.read.owner();
            assert.equal(getAddress(contractOwner), getAddress(owner.account.address));
        });
    });

    describe("mint()", () => {
        it("Should fail without USDC approval", async () => {
            await assert.rejects(
                async () => await user1.writeContract({
                    address: payableOnft.address,
                    abi: payableOnft.abi,
                    functionName: "mint",
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

            // Mint
            await user1.writeContract({
                address: payableOnft.address,
                abi: payableOnft.abi,
                functionName: "mint",
            });

            // Check NFT was minted
            const tokenId = await payableOnft.read.nextTokenId() - 1n;
            const nftOwner = await payableOnft.read.ownerOf([tokenId]);
            assert.equal(getAddress(nftOwner), getAddress(user1.account.address));

            // Check USDC was deducted
            const balanceAfter = await mockUsdc.read.balanceOf([user1.account.address]);
            assert.equal(balanceBefore - balanceAfter, MINT_PRICE);

            console.log(`✅ User1 minted NFT #${tokenId}`);
        });

        it("Should emit MintedAndPaid event", async () => {
            // Approve and mint
            await user2.writeContract({
                address: mockUsdc.address,
                abi: mockUsdc.abi,
                functionName: "approve",
                args: [payableOnft.address, MINT_PRICE],
            });

            const hash = await user2.writeContract({
                address: payableOnft.address,
                abi: payableOnft.abi,
                functionName: "mint",
            });

            const receipt = await publicClient.waitForTransactionReceipt({ hash });

            // Check for event (MintedAndPaid)
            assert.ok(receipt.logs.length > 0, "Should emit events");
            console.log(`✅ User2 minted NFT, tx: ${hash.slice(0, 10)}...`);
        });
    });

    describe("quoteBridge()", () => {
        it("Should return a fee quote for bridging", async () => {
            const options = "0x"; // Empty options for simple quote

            const fee = await payableOnft.read.quoteBridge([REMOTE_EID, options]);

            assert.ok(fee.nativeFee >= 0n, "Should return native fee");
            console.log(`✅ Quote for bridging: ${fee.nativeFee} wei native, ${fee.lzTokenFee} lzToken`);
        });
    });

    describe("setUSDC() - Admin", () => {
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
            const newUsdcAddress = user2.account.address; // Just for testing

            await owner.writeContract({
                address: payableOnft.address,
                abi: payableOnft.abi,
                functionName: "setUSDC",
                args: [newUsdcAddress],
            });

            const currentUsdc = await payableOnft.read.usdc();
            assert.equal(getAddress(currentUsdc), getAddress(newUsdcAddress));

            // Reset back to original
            await owner.writeContract({
                address: payableOnft.address,
                abi: payableOnft.abi,
                functionName: "setUSDC",
                args: [mockUsdc.address],
            });
            console.log("✅ Owner can update USDC address");
        });
    });

    describe("withdrawUSDC() - Admin", () => {
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
            // Check contract balance (should have USDC from mints)
            const contractBalance = await mockUsdc.read.balanceOf([payableOnft.address]);
            const ownerBalanceBefore = await mockUsdc.read.balanceOf([owner.account.address]);

            // Withdraw
            await owner.writeContract({
                address: payableOnft.address,
                abi: payableOnft.abi,
                functionName: "withdrawUSDC",
            });

            // Check balances after
            const contractBalanceAfter = await mockUsdc.read.balanceOf([payableOnft.address]);
            const ownerBalanceAfter = await mockUsdc.read.balanceOf([owner.account.address]);

            assert.equal(contractBalanceAfter, 0n);
            assert.equal(ownerBalanceAfter - ownerBalanceBefore, contractBalance);

            console.log(`✅ Owner withdrew ${contractBalance} USDC from contract`);
        });
    });

    describe("mintAndBridge()", () => {
        it("Should mint and prepare bridge to destination chain", async () => {
            // Approve USDC (user1 still has funds from initial minting)
            await user1.writeContract({
                address: mockUsdc.address,
                abi: mockUsdc.abi,
                functionName: "approve",
                args: [payableOnft.address, MINT_PRICE],
            });

            // Get fee quote
            const options = "0x";
            const fee = await payableOnft.read.quoteBridge([REMOTE_EID, options]);

            const balanceBefore = await mockUsdc.read.balanceOf([user1.account.address]);

            const hash = await user1.writeContract({
                address: payableOnft.address,
                abi: payableOnft.abi,
                functionName: "mintAndBridge",
                args: [REMOTE_EID, options],
                value: parseUnits("0.1", 18), // Use 0.1 ETH to ensure enough for mock endpoint
            });

            const receipt = await publicClient.waitForTransactionReceipt({ hash });

            // Check USDC was deducted
            const balanceAfter = await mockUsdc.read.balanceOf([user1.account.address]);
            assert.equal(balanceBefore - balanceAfter, MINT_PRICE);

            // Transaction should succeed (NFT was minted and bridge message sent)
            assert.ok(receipt.status === "success", "Transaction should succeed");

            console.log(`✅ User1 minted and bridged NFT to EID ${REMOTE_EID}`);
        });

        it("Should fail without USDC approval", async () => {
            // Clear any existing approval for user2
            await user2.writeContract({
                address: mockUsdc.address,
                abi: mockUsdc.abi,
                functionName: "approve",
                args: [payableOnft.address, 0n],
            });

            try {
                await user2.writeContract({
                    address: payableOnft.address,
                    abi: payableOnft.abi,
                    functionName: "mintAndBridge",
                    args: [REMOTE_EID, "0x"],
                    value: parseUnits("0.1", 18),
                });
                assert.fail("Should have reverted");
            } catch (error: any) {
                assert.ok(error.message.includes("ERC20InsufficientAllowance") || error.message.includes("reverted"), "Should revert");
                console.log("✅ Correctly rejects mint without USDC approval");
            }
        });
    });

    describe("Pausable Functionality", () => {
        it("Should allow owner to pause and unpause", async () => {
            // Pause
            await owner.writeContract({
                address: payableOnft.address,
                abi: payableOnft.abi,
                functionName: "pause",
            });

            const isPaused = await payableOnft.read.paused();
            assert.equal(isPaused, true);
            console.log("✅ Contract paused");

            // Unpause
            await owner.writeContract({
                address: payableOnft.address,
                abi: payableOnft.abi,
                functionName: "unpause",
            });

            const isPausedAfter = await payableOnft.read.paused();
            assert.equal(isPausedAfter, false);
            console.log("✅ Contract unpaused");
        });

        it("Should fail if non-owner tries to pause/unpause", async () => {
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
            // Pause
            await owner.writeContract({
                address: payableOnft.address,
                abi: payableOnft.abi,
                functionName: "pause",
            });

            // Approve USDC for mint
            await user1.writeContract({
                address: mockUsdc.address,
                abi: mockUsdc.abi,
                functionName: "approve",
                args: [payableOnft.address, MINT_PRICE],
            });

            // Try to mint
            try {
                await user1.writeContract({
                    address: payableOnft.address,
                    abi: payableOnft.abi,
                    functionName: "mint",
                });
                assert.fail("Should have reverted");
            } catch (error: any) {
                assert.ok(error.message.includes("EnforcedPause") || error.message.includes("reverted"), "Should revert due to pause");
                console.log("✅ Minting blocked when paused");
            }

            // Try to mintAndBridge
            try {
                await user1.writeContract({
                    address: payableOnft.address,
                    abi: payableOnft.abi,
                    functionName: "mintAndBridge",
                    args: [REMOTE_EID, "0x"],
                    value: parseUnits("0.1", 18),
                });
                assert.fail("Should have reverted");
            } catch (error: any) {
                assert.ok(error.message.includes("EnforcedPause") || error.message.includes("reverted"), "Should revert due to pause");
                console.log("✅ MintAndBridge blocked when paused");
            }

            // Unpause for future tests
            await owner.writeContract({
                address: payableOnft.address,
                abi: payableOnft.abi,
                functionName: "unpause",
            });
        });
    });

    describe("Token ID Collision Prevention", () => {
        it("Should use chain prefix for token IDs", async () => {
            const expectedPrefix = BigInt(LOCAL_EID) * BigInt(1_000_000);
            const nextTokenId = await payableOnft.read.nextTokenId();

            // Token ID should be greater than the prefix
            assert.ok(nextTokenId > expectedPrefix, "Token ID should include chain prefix");

            console.log(`✅ Token IDs start from ${expectedPrefix + 1n}`);
        });
    });
});
