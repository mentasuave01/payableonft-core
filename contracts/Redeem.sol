// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { IERC721 } from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import { IERC721Receiver } from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title Redeem
 * @notice Accepts PayableONFT NFTs for redemption. Only the admin (owner) can
 *         withdraw or burn the NFTs after they are transferred in.
 */
contract Redeem is Ownable, IERC721Receiver {
    IERC721 public immutable nftContract;

    /// @notice Maps tokenId → original redeemer address
    mapping(uint256 => address) public redeemer;

    /// @notice List of all redeemed token IDs (for enumeration)
    uint256[] public redeemedTokenIds;

    address public constant BURN_ADDRESS = 0x000000000000000000000000000000000000dEaD;

    event Redeemed(address indexed user, uint256 tokenId);
    event Withdrawn(uint256 tokenId, address indexed to);
    event Burned(uint256 tokenId);

    constructor(address _nftContract, address _owner) Ownable(_owner) {
        require(_nftContract != address(0), "Invalid NFT address");
        nftContract = IERC721(_nftContract);
    }

    /**
     * @notice Redeem an NFT — transfers it from the caller into this contract.
     *         Caller must have approved this contract to transfer the NFT first.
     * @param tokenId The token ID to redeem.
     */
    function redeem(uint256 tokenId) external {
        require(nftContract.ownerOf(tokenId) == msg.sender, "Not NFT owner");

        nftContract.transferFrom(msg.sender, address(this), tokenId);

        redeemer[tokenId] = msg.sender;
        redeemedTokenIds.push(tokenId);

        emit Redeemed(msg.sender, tokenId);
    }

    /**
     * @notice Admin: withdraw an NFT held by this contract to any address.
     * @param tokenId The token ID to withdraw.
     * @param to The destination address.
     */
    function withdraw(uint256 tokenId, address to) external onlyOwner {
        require(to != address(0), "Invalid recipient");
        nftContract.transferFrom(address(this), to, tokenId);
        emit Withdrawn(tokenId, to);
    }

    /**
     * @notice Admin: burn an NFT by sending it to the dead address (0x...dEaD).
     * @param tokenId The token ID to burn.
     */
    function burn(uint256 tokenId) external onlyOwner {
        nftContract.transferFrom(address(this), BURN_ADDRESS, tokenId);
        emit Burned(tokenId);
    }

    /**
     * @notice Returns the total number of redeemed NFTs.
     */
    function redeemedCount() external view returns (uint256) {
        return redeemedTokenIds.length;
    }

    /**
     * @notice Required to receive ERC721 tokens via safeTransferFrom.
     *         Records the sender as the redeemer when NFTs are sent directly.
     */
    function onERC721Received(
        address /* operator */,
        address from,
        uint256 tokenId,
        bytes calldata /* data */
    ) external override returns (bytes4) {
        require(msg.sender == address(nftContract), "Only accepted NFT contract");

        redeemer[tokenId] = from;
        redeemedTokenIds.push(tokenId);

        emit Redeemed(from, tokenId);

        return IERC721Receiver.onERC721Received.selector;
    }
}
