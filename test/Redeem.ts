import assert from "node:assert/strict";
import { describe, it, before } from "node:test";
import { network } from "hardhat";
import { parseUnits, getAddress, pad } from "viem";

describe("Redeem", async function () {
    const { viem } = await network.connect();
    const publicClient = await viem.getPublicClient();
    const walletClients = await viem.getWalletClients();

    const owner = walletClients[0];
    const user1 = walletClients[1];
    const user2 = walletClients[2];

    const MINT_PRICE = parseUnits("10", 6);
    const LOCAL_EID = 40231;
    const REMOTE_EID = 40232;

    let mockUsdc: any;
    let mockEndpoint: any;
    let payableOnft: any;
    let redeem: any;

    // Helper: approve USDC and mint an NFT for a user, returns the tokenId
    async function mintNFTFor(user: any): Promise<bigint> {
        await user.writeContract({
            address: mockUsdc.address,
            abi: mockUsdc.abi,
            functionName: "approve",
            args: [payableOnft.address, MINT_PRICE],
        });
        await user.writeContract({
            address: payableOnft.address,
            abi: payableOnft.abi,
            functionName: "mint",
            args: ["0x"],
        });
        return (await payableOnft.read.nextTokenId()) - 1n;
    }

    before(async () => {
        // Deploy mock USDC
        mockUsdc = await viem.deployContract("MockUSDC");

        // Deploy mock LayerZero endpoint
        mockEndpoint = await viem.deployContract("MockLzEndpoint", [LOCAL_EID]);

        // Deploy PayableONFT
        // const chainPrefix = BigInt(LOCAL_EID) * BigInt(1_000_000);
        payableOnft = await viem.deployContract("PayableONFT", [
            "OmniUSDC NFT",
            "ONFT",
            mockEndpoint.address,
            owner.account.address,
            mockUsdc.address,
            LOCAL_EID,
        ]);

        // Set peer (required for full ONFT setup)
        const remotePeer = pad(payableOnft.address as `0x${string}`, { size: 32 });
        await payableOnft.write.setPeer([REMOTE_EID, remotePeer]);

        // Deploy Redeem contract
        redeem = await viem.deployContract("Redeem", [
            payableOnft.address,
            owner.account.address,
        ]);

        // Fund users with USDC
        await mockUsdc.write.mint([user1.account.address, parseUnits("1000", 6)]);
        await mockUsdc.write.mint([user2.account.address, parseUnits("1000", 6)]);

        console.log("PayableONFT:", payableOnft.address);
        console.log("Redeem:", redeem.address);
    });

    describe("Deployment", () => {
        it("Should have correct NFT contract address", async () => {
            const nft = await redeem.read.nftContract();
            assert.equal(getAddress(nft), getAddress(payableOnft.address));
        });

        it("Should have correct owner", async () => {
            const contractOwner = await redeem.read.owner();
            assert.equal(getAddress(contractOwner), getAddress(owner.account.address));
        });

        it("Should start with zero redeemed count", async () => {
            const count = await redeem.read.redeemedCount();
            assert.equal(count, 0n);
        });
    });

    describe("redeem()", () => {
        it("Should redeem an NFT via approve + redeem()", async () => {
            const tokenId = await mintNFTFor(user1);

            // Approve Redeem contract
            await user1.writeContract({
                address: payableOnft.address,
                abi: payableOnft.abi,
                functionName: "approve",
                args: [redeem.address, tokenId],
            });

            // Redeem
            await user1.writeContract({
                address: redeem.address,
                abi: redeem.abi,
                functionName: "redeem",
                args: [tokenId],
            });

            // NFT should now belong to the Redeem contract
            const nftOwner = await payableOnft.read.ownerOf([tokenId]);
            assert.equal(getAddress(nftOwner), getAddress(redeem.address));

            // Redeemer should be recorded
            const recorded = await redeem.read.redeemer([tokenId]);
            assert.equal(getAddress(recorded), getAddress(user1.account.address));

            // Count should increase
            const count = await redeem.read.redeemedCount();
            assert.equal(count, 1n);

            console.log(`✅ User1 redeemed NFT #${tokenId}`);
        });

        it("Should reject if caller is not NFT owner", async () => {
            const tokenId = await mintNFTFor(user1);

            try {
                await user2.writeContract({
                    address: redeem.address,
                    abi: redeem.abi,
                    functionName: "redeem",
                    args: [tokenId],
                });
                assert.fail("Should have reverted");
            } catch (error: any) {
                assert.ok(
                    error.message.includes("Not NFT owner") || error.message.includes("reverted"),
                    "Should revert with ownership error"
                );
                console.log("✅ Non-owner correctly rejected");
            }
        });

        it("Should reject if NFT not approved", async () => {
            const tokenId = await mintNFTFor(user1);

            try {
                await user1.writeContract({
                    address: redeem.address,
                    abi: redeem.abi,
                    functionName: "redeem",
                    args: [tokenId],
                });
                assert.fail("Should have reverted");
            } catch (error: any) {
                assert.ok(
                    error.message.includes("ERC721InsufficientApproval") || error.message.includes("reverted"),
                    "Should revert without approval"
                );
                console.log("✅ Unapproved NFT correctly rejected");
            }
        });

        it("Should accept NFT via safeTransferFrom (direct transfer)", async () => {
            const tokenId = await mintNFTFor(user2);
            const countBefore = await redeem.read.redeemedCount();

            // Transfer directly using safeTransferFrom
            await user2.writeContract({
                address: payableOnft.address,
                abi: payableOnft.abi,
                functionName: "safeTransferFrom",
                args: [user2.account.address, redeem.address, tokenId],
            });

            // NFT should belong to Redeem
            const nftOwner = await payableOnft.read.ownerOf([tokenId]);
            assert.equal(getAddress(nftOwner), getAddress(redeem.address));

            // Redeemer should be user2
            const recorded = await redeem.read.redeemer([tokenId]);
            assert.equal(getAddress(recorded), getAddress(user2.account.address));

            // Count should increase
            const countAfter = await redeem.read.redeemedCount();
            assert.equal(countAfter, countBefore + 1n);

            console.log(`✅ User2 redeemed NFT #${tokenId} via safeTransferFrom`);
        });
    });

    describe("withdraw() - Admin", () => {
        it("Should allow admin to withdraw an NFT", async () => {
            const tokenId = await mintNFTFor(user1);

            // Approve & redeem
            await user1.writeContract({
                address: payableOnft.address,
                abi: payableOnft.abi,
                functionName: "approve",
                args: [redeem.address, tokenId],
            });
            await user1.writeContract({
                address: redeem.address,
                abi: redeem.abi,
                functionName: "redeem",
                args: [tokenId],
            });

            // Admin withdraws to user2
            await owner.writeContract({
                address: redeem.address,
                abi: redeem.abi,
                functionName: "withdraw",
                args: [tokenId, user2.account.address],
            });

            const nftOwner = await payableOnft.read.ownerOf([tokenId]);
            assert.equal(getAddress(nftOwner), getAddress(user2.account.address));
            console.log(`✅ Admin withdrew NFT #${tokenId} to user2`);
        });

        it("Should reject non-admin withdraw", async () => {
            const tokenId = await mintNFTFor(user1);

            await user1.writeContract({
                address: payableOnft.address,
                abi: payableOnft.abi,
                functionName: "approve",
                args: [redeem.address, tokenId],
            });
            await user1.writeContract({
                address: redeem.address,
                abi: redeem.abi,
                functionName: "redeem",
                args: [tokenId],
            });

            try {
                await user1.writeContract({
                    address: redeem.address,
                    abi: redeem.abi,
                    functionName: "withdraw",
                    args: [tokenId, user1.account.address],
                });
                assert.fail("Should have reverted");
            } catch (error: any) {
                assert.ok(
                    error.message.includes("OwnableUnauthorizedAccount") || error.message.includes("reverted"),
                    "Should revert"
                );
                console.log("✅ Non-admin withdraw rejected");
            }
        });
    });

    describe("burn() - Admin", () => {
        it("Should allow admin to burn an NFT (send to dead address)", async () => {
            const tokenId = await mintNFTFor(user1);

            await user1.writeContract({
                address: payableOnft.address,
                abi: payableOnft.abi,
                functionName: "approve",
                args: [redeem.address, tokenId],
            });
            await user1.writeContract({
                address: redeem.address,
                abi: redeem.abi,
                functionName: "redeem",
                args: [tokenId],
            });

            // Admin burns
            await owner.writeContract({
                address: redeem.address,
                abi: redeem.abi,
                functionName: "burn",
                args: [tokenId],
            });

            // NFT should now belong to dead address
            const nftOwner = await payableOnft.read.ownerOf([tokenId]);
            assert.equal(
                getAddress(nftOwner),
                getAddress("0x000000000000000000000000000000000000dEaD")
            );
            console.log(`✅ Admin burned NFT #${tokenId}`);
        });

        it("Should reject non-admin burn", async () => {
            const tokenId = await mintNFTFor(user2);

            await user2.writeContract({
                address: payableOnft.address,
                abi: payableOnft.abi,
                functionName: "approve",
                args: [redeem.address, tokenId],
            });
            await user2.writeContract({
                address: redeem.address,
                abi: redeem.abi,
                functionName: "redeem",
                args: [tokenId],
            });

            try {
                await user2.writeContract({
                    address: redeem.address,
                    abi: redeem.abi,
                    functionName: "burn",
                    args: [tokenId],
                });
                assert.fail("Should have reverted");
            } catch (error: any) {
                assert.ok(
                    error.message.includes("OwnableUnauthorizedAccount") || error.message.includes("reverted"),
                    "Should revert"
                );
                console.log("✅ Non-admin burn rejected");
            }
        });
    });
});
