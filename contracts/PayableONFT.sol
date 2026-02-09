// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { ONFT721 } from "./layerzero/onft-evm/onft721/ONFT721.sol";
import { SendParam, MessagingFee, MessagingReceipt } from "./layerzero/onft-evm/onft721/interfaces/IONFT721.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { Pausable } from "@openzeppelin/contracts/utils/Pausable.sol";
import { ONFT721MsgCodec } from "./layerzero/onft-evm/onft721/libs/ONFT721MsgCodec.sol";

contract PayableONFT is ONFT721, Pausable {
    uint256 public nextTokenId;
    uint256 public constant MINT_PRICE = 10 * 10**6; // 10 USDC (6 decimals)
    IERC20 public usdc;
    
    // Unique prefix for this chain to prevent ID collision across chains
    // e.g., Chain A = 1000000, Chain B = 2000000
    uint256 public immutable CHAIN_ID_PREFIX;

    event MintedAndPaid(address indexed user, uint256 tokenId, uint256 price);

    constructor(
        string memory _name,
        string memory _symbol,
        address _lzEndpoint,
        address _delegate,
        address _usdc,
        uint256 _chainPrefix
    ) ONFT721(_name, _symbol, _lzEndpoint, _delegate) {
        usdc = IERC20(_usdc);
        CHAIN_ID_PREFIX = _chainPrefix;
        nextTokenId = _chainPrefix + 1;
    }

    /**
     * @notice Mints an NFT to the user on the CURRENT chain after taking payment.
     */
    function mint() external whenNotPaused {
        _payAndMint(msg.sender);
    }

    /**
     * @notice Mints on the current chain, then immediately bridges to the destination chain.
     * @param _dstEid The LayerZero Endpoint ID of the destination chain.
     * @param _extraOptions LayerZero execution options (gas settings).
     */
    function mintAndBridge(
        uint32 _dstEid,
        bytes calldata _extraOptions
    ) external payable whenNotPaused returns (MessagingReceipt memory receipt) {
        // 1. Pay and Mint locally to this contract first
        uint256 newTokenId = _payAndMint(address(this));

        // 2. Prepare Send Params
        bytes32 recipient = bytes32(uint256(uint160(msg.sender)));
        
        SendParam memory sendParam = SendParam({
            dstEid: _dstEid,
            to: recipient,
            tokenId: newTokenId,
            extraOptions: _extraOptions,
            composeMsg: "",
            onftCmd: ""
        });

        // 3. Build message and options using parent's internal method
        (bytes memory message, bytes memory options) = _buildMsgAndOptionsMemory(sendParam);

        // 4. Quote and verify fee
        MessagingFee memory fee = _quote(_dstEid, message, options, false);
        require(msg.value >= fee.nativeFee, "Insufficient native gas for bridging");

        // 5. Debit the NFT (burn from this contract)
        _debit(address(this), newTokenId, _dstEid);

        // 6. Send the NFT cross-chain
        receipt = _lzSend(_dstEid, message, options, fee, payable(msg.sender));
        emit ONFTSent(receipt.guid, _dstEid, msg.sender, newTokenId);
    }

    /**
     * @notice Quote the LayerZero fee for bridging an NFT to a destination chain.
     * @param _dstEid The destination endpoint ID.
     * @param _extraOptions LayerZero execution options.
     */
    function quoteBridge(
        uint32 _dstEid,
        bytes calldata _extraOptions
    ) external view returns (MessagingFee memory fee) {
        bytes32 recipient = bytes32(uint256(uint160(msg.sender)));
        
        // Build message for quoting
        (bytes memory message, ) = ONFT721MsgCodec.encode(recipient, nextTokenId, "");
        bytes memory options = combineOptions(_dstEid, SEND, _extraOptions);
        
        fee = _quote(_dstEid, message, options, false);
    }

    /**
     * @dev Builds message and options from memory SendParam (needed for internal calls)
     */
    function _buildMsgAndOptionsMemory(
        SendParam memory _sendParam
    ) internal view returns (bytes memory message, bytes memory options) {
        require(_sendParam.to != bytes32(0), "InvalidReceiver");
        
        bool hasCompose;
        (message, hasCompose) = ONFT721MsgCodec.encode(_sendParam.to, _sendParam.tokenId, _sendParam.composeMsg);
        uint16 msgType = hasCompose ? SEND_AND_COMPOSE : SEND;
        
        // Use enforcedOptions directly since we can't convert memory to calldata
        bytes memory enforcedOpts = enforcedOptions[_sendParam.dstEid][msgType];
        options = enforcedOpts.length > 0 
            ? _combineOptionsHelper(enforcedOpts, _sendParam.extraOptions)
            : _sendParam.extraOptions;
    }

    /**
     * @dev Helper to combine options from memory
     */
    function _combineOptionsHelper(
        bytes memory _enforcedOptions,
        bytes memory _extraOptions
    ) internal pure returns (bytes memory) {
        // Simple concatenation - in production you'd use proper OptionsBuilder
        if (_extraOptions.length == 0) return _enforcedOptions;
        if (_enforcedOptions.length == 0) return _extraOptions;
        return abi.encodePacked(_enforcedOptions, _extraOptions);
    }

    // Internal logic to handle payment and minting
    function _payAndMint(address _to) internal returns (uint256) {
        // Transfer USDC from user to this contract
        // User must have approved this contract to spend USDC
        require(usdc.transferFrom(msg.sender, address(this), MINT_PRICE), "USDC Payment failed");

        uint256 tokenId = nextTokenId;
        _mint(_to, tokenId);
        
        emit MintedAndPaid(msg.sender, tokenId, MINT_PRICE);
        
        nextTokenId++;
        return tokenId;
    }

    // Admin function to withdraw collected USDC
    function withdrawUSDC() external onlyOwner {
        usdc.transfer(owner(), usdc.balanceOf(address(this)));
    }
    
    // Admin function to update USDC address
    function setUSDC(address _usdc) external onlyOwner {
        usdc = IERC20(_usdc);
    }

    /**
     * @dev Override _payNative to allow excess native gas (excess is refunded by endpoint)
     * The parent implementation requires exact msg.value match, but we want to allow
     * users to send more than needed for a better UX (excess goes to refund address).
     */
    function _payNative(uint256 _nativeFee) internal virtual override returns (uint256 nativeFee) {
        if (msg.value < _nativeFee) revert NotEnoughNative(msg.value);
        return _nativeFee;
    }

    /**
     * @notice Pause minting (emergency stop)
     */
    function pause() external onlyOwner {
        _pause();
    }

    /**
     * @notice Unpause minting
     */
    function unpause() external onlyOwner {
        _unpause();
    }
}
