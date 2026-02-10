// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ONFT721} from "./layerzero/onft-evm/onft721/ONFT721.sol";
import {
    SendParam,
    MessagingFee,
    MessagingReceipt
} from "./layerzero/onft-evm/onft721/interfaces/IONFT721.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {
    ONFT721MsgCodec
} from "./layerzero/onft-evm/onft721/libs/ONFT721MsgCodec.sol";
import {
    OptionsBuilder
} from "./layerzero/oapp-evm/oapp/libs/OptionsBuilder.sol";

/// @title PayableONFT
/// @notice An ONFT721 extension that requires payment (USDC) to mint.
/// @dev Implements cross-chain minting where payment is always collected on the Origin chain.
contract PayableONFT is ONFT721, Pausable {
    using OptionsBuilder for bytes;

    uint256 public nextTokenId;
    /// @notice Price to mint one NFT (in USDC, 6 decimals)
    uint256 public constant MINT_PRICE = 10 * 10 ** 6; // 10 USDC
    IERC20 public usdc;

    /// @notice Origin Chain Endpoint ID where all tokens are minted and logic is centralized
    uint32 public immutable originEid;

    /// @dev Transient flag to bypass msg.value check in _payNative during internal bridging operations
    bool internal isBridgingBack;

    // Gas limits for execution
    uint128 public constant MINT_GAS_LIMIT = 300_000;
    uint128 public constant RETURN_GAS_LIMIT = 200_000;
    uint128 public constant MINT_MSG_VALUE = 0.0001 ether; // Value to drop to Origin for return trip

    event MintedAndPaid(address indexed user, uint256 tokenId, uint256 price);

    constructor(
        string memory _name,
        string memory _symbol,
        address _lzEndpoint,
        address _delegate,
        address _usdc,
        uint32 _originEid
    ) ONFT721(_name, _symbol, _lzEndpoint, _delegate) {
        usdc = IERC20(_usdc);
        originEid = _originEid;
        nextTokenId = 1;
    }

    // Accept native funds for return trip gas
    receive() external payable {}

    /**
     * @notice Mints an NFT.
     * @dev If on Origin, mints locally. If on Remote, sends a request to Origin.
     * @param _extraOptions LayerZero options (used if minting remotely).
     */
    function mint(bytes calldata _extraOptions) external payable whenNotPaused {
        if (endpoint.eid() == originEid) {
            _payAndMintLocal(msg.sender);
        } else {
            _requestMint(_extraOptions);
        }
    }

    /**
     * @notice Quote the fee for a cross-chain mint request.
     * @param _extraOptions LayerZero options.
     * @return fee The estimated messaging fee.
     */
    function quoteMint(
        bytes calldata _extraOptions
    ) external view returns (MessagingFee memory fee) {
        if (endpoint.eid() == originEid) {
            return MessagingFee(0, 0);
        }

        // Mock payload for quotation
        // to = address(this) (Origin Contract)
        // tokenId = type(uint256).max (Mint Request)
        bytes32 toAddress = bytes32(uint256(uint160(address(this))));
        uint256 tokenId = type(uint256).max;

        (bytes memory message, ) = ONFT721MsgCodec.encode(
            toAddress,
            tokenId,
            "" // composeMsg
        );

        bytes memory options = OptionsBuilder
            .newOptions()
            .addExecutorNativeDropOption(
                MINT_MSG_VALUE,
                bytes32(uint256(uint160(address(this))))
            );

        if (_extraOptions.length > 0) {
            options = abi.encodePacked(options, _extraOptions);
        }

        return _quote(originEid, message, options, false);
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
        require(
            endpoint.eid() == originEid,
            "MintAndBridge only allowed on Origin"
        );
        // 1. Pay and Mint locally to this contract first
        uint256 newTokenId = _payAndMintLocal(address(this));

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
        (
            bytes memory message,
            bytes memory options
        ) = _buildMsgAndOptionsMemory(sendParam);

        // 4. Quote and verify fee
        MessagingFee memory fee = _quote(_dstEid, message, options, false);
        require(
            msg.value >= fee.nativeFee,
            "Insufficient native gas for bridging"
        );

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
        (bytes memory message, ) = ONFT721MsgCodec.encode(
            recipient,
            nextTokenId,
            ""
        );
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
        (message, hasCompose) = ONFT721MsgCodec.encode(
            _sendParam.to,
            _sendParam.tokenId,
            _sendParam.composeMsg
        );
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

    // Internal logic to handle payment and minting locally
    function _payAndMintLocal(address _to) internal returns (uint256) {
        // Transfer USDC from user to this contract
        // User must have approved this contract to spend USDC
        require(
            usdc.transferFrom(msg.sender, address(this), MINT_PRICE),
            "USDC Payment failed"
        );

        return _mintInternal(_to);
    }

    function _mintInternal(address _to) internal returns (uint256) {
        uint256 tokenId = nextTokenId;
        _mint(_to, tokenId);

        emit MintedAndPaid(_to, tokenId, MINT_PRICE);

        nextTokenId++;
        return tokenId;
    }

    /**
     * @dev Request mint on Origin Chain
     */
    function _requestMint(bytes calldata _extraOptions) internal {
        // 1. Pay USDC locally
        require(
            usdc.transferFrom(msg.sender, address(this), MINT_PRICE),
            "USDC Payment failed"
        );

        // 2. Prepare Send Params with MAX tokenId to signal mint request
        bytes32 recipient = bytes32(uint256(uint160(address(this)))); // Send to contract itself on Origin

        // Add NativeDrop to options to fund the return trip on Origin
        bytes memory options = OptionsBuilder
            .newOptions()
            .addExecutorLzReceiveOption(MINT_GAS_LIMIT, 0)
            .addExecutorNativeDropOption(
                MINT_MSG_VALUE,
                bytes32(uint256(uint160(address(this))))
            ); // Drop to contract

        if (_extraOptions.length > 0) {
            options = abi.encodePacked(options, _extraOptions);
        }

        SendParam memory sendParam = SendParam({
            dstEid: originEid,
            to: recipient,
            tokenId: type(uint256).max, // Signal for Mint Request
            extraOptions: options,
            composeMsg: "",
            onftCmd: ""
        });

        // 3. Quote and pay
        MessagingFee memory fee = _quote(
            originEid,
            _buildMsg(sendParam),
            options,
            false
        );
        require(msg.value >= fee.nativeFee, "Insufficient native fee");

        // 4. Send
        _lzSend(
            originEid,
            _buildMsg(sendParam),
            options,
            fee,
            payable(msg.sender)
        );
    }

    /**
     * @dev Override _credit to handle Mint Requests on Origin.
     *      When a mint request arrives (tokenId == max), it:
     *      1. Mints a new token to this contract (temporarily).
     *      2. Bridges it back to the requester on the source chain (User).
     */
    function _credit(
        address _to,
        uint256 _tokenId,
        uint32 _srcEid
    ) internal virtual override {
        if (_tokenId == type(uint256).max && endpoint.eid() == originEid) {
            // It's a mint request.
            // _to is used as the destination address for the return trip.

            // 1. Mint new token to this contract
            uint256 newTokenId = _mintInternal(address(this));

            // 2. Bridge back to '_to' (the user) on '_srcEid'
            _bridgeBack(newTokenId, _to, _srcEid);
        } else {
            super._credit(_to, _tokenId, _srcEid);
        }
    }

    function _bridgeBack(
        uint256 _tokenId,
        address _to,
        uint32 _dstEid
    ) internal {
        isBridgingBack = true;

        // Build SendParam to send back to user
        SendParam memory sendParam = SendParam({
            dstEid: _dstEid,
            to: bytes32(uint256(uint160(_to))),
            tokenId: _tokenId,
            extraOptions: OptionsBuilder
                .newOptions()
                .addExecutorLzReceiveOption(RETURN_GAS_LIMIT, 0),
            composeMsg: "",
            onftCmd: ""
        });

        // Refill local options/message for internal call
        (
            bytes memory message,
            bytes memory options
        ) = _buildMsgAndOptionsMemory(sendParam);

        // Quote (fee paid by contract)
        MessagingFee memory fee = _quote(_dstEid, message, options, false);

        // Burn from this contract
        _burn(_tokenId);

        // Send logic
        _lzSend(_dstEid, message, options, fee, payable(address(this)));
        isBridgingBack = false;
    }

    function _buildMsg(
        SendParam memory _sendParam
    ) internal view returns (bytes memory) {
        (bytes memory message, ) = ONFT721MsgCodec.encode(
            _sendParam.to,
            _sendParam.tokenId,
            _sendParam.composeMsg
        );
        return message;
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
    function _payNative(
        uint256 _nativeFee
    ) internal virtual override returns (uint256 nativeFee) {
        if (isBridgingBack) return _nativeFee;
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
