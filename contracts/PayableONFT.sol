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
    Origin
} from "./layerzero/lz-evm-protocol-v2/interfaces/ILayerZeroReceiver.sol";
import {
    OptionsBuilder
} from "./layerzero/oapp-evm/oapp/libs/OptionsBuilder.sol";

/// @title PayableONFT — Lazy Bridge Architecture
/// @notice An ONFT721 with cross-chain minting via lightweight LZ messages.
/// @dev Mints always land on Origin. Users bridge to other chains on-demand via standard ONFT send().
///      Cross-chain mint flow:
///        Remote: user pays USDC → sends 20-byte message (user address) to Origin
///        Origin: receives message → mints NFT to user's address on Origin
///        Later:  user bridges NFT wherever they want via send()
contract PayableONFT is ONFT721, Pausable {
    using OptionsBuilder for bytes;

    uint256 public nextTokenId;

    /// @notice Price to mint one NFT (in USDC, 6 decimals)
    uint256 public constant MINT_PRICE = 10 * 10 ** 6; // 10 USDC

    IERC20 public usdc;

    /// @notice Origin Chain Endpoint ID where all tokens are minted
    uint32 public immutable originEid;

    /// @notice Gas limit for executing a mint on Origin (just _mint + emit, no bridging back)
    uint128 public constant MINT_GAS_LIMIT = 100_000;

    /// @notice Custom message type for mint requests (distinct from ONFT SEND=1)
    uint16 public constant MINT_MSG_TYPE = 3;

    event MintedAndPaid(address indexed user, uint256 tokenId, uint256 price);
    event CrossChainMintReceived(
        uint32 indexed srcEid,
        address indexed user,
        uint256 tokenId
    );

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

    // ═══════════════════════════════════════════════════════════
    //                        MINTING
    // ═══════════════════════════════════════════════════════════

    /**
     * @notice Mint an NFT. On Origin → local mint. On Remote → sends LZ message to Origin.
     * @param _extraOptions Additional LayerZero options (pass 0x for defaults).
     */
    function mint(bytes calldata _extraOptions) external payable whenNotPaused {
        if (endpoint.eid() == originEid) {
            _payAndMintLocal(msg.sender);
        } else {
            _requestMint(_extraOptions);
        }
    }

    /**
     * @notice Quote the LZ fee for a cross-chain mint request.
     * @param _extraOptions LayerZero options.
     * @return fee The estimated messaging fee.
     */
    function quoteMint(
        bytes calldata _extraOptions
    ) external view returns (MessagingFee memory fee) {
        if (endpoint.eid() == originEid) {
            return MessagingFee(0, 0);
        }

        // Lightweight message: just the user's address (20 bytes)
        bytes memory message = abi.encodePacked(msg.sender);

        bytes memory options = OptionsBuilder
            .newOptions()
            .addExecutorLzReceiveOption(MINT_GAS_LIMIT, 0);

        if (_extraOptions.length > 0) {
            options = abi.encodePacked(options, _extraOptions);
        }

        return _quote(originEid, message, options, false);
    }

    /**
     * @notice Quote the LZ fee for bridging an NFT to a destination chain.
     * @param _dstEid The destination endpoint ID.
     * @param _extraOptions LayerZero execution options.
     */
    function quoteBridge(
        uint32 _dstEid,
        bytes calldata _extraOptions
    ) external view returns (MessagingFee memory fee) {
        bytes32 recipient = bytes32(uint256(uint160(msg.sender)));

        (bytes memory message, ) = _encodeONFTMsg(
            recipient,
            nextTokenId // representative tokenId for quote
        );
        bytes memory options = combineOptions(_dstEid, SEND, _extraOptions);

        fee = _quote(_dstEid, message, options, false);
    }

    // ═══════════════════════════════════════════════════════════
    //                    INTERNAL — MINTING
    // ═══════════════════════════════════════════════════════════

    /// @dev Pay USDC and mint locally (Origin chain only)
    function _payAndMintLocal(address _to) internal returns (uint256) {
        require(
            usdc.transferFrom(msg.sender, address(this), MINT_PRICE),
            "USDC Payment failed"
        );
        return _mintInternal(_to);
    }

    /// @dev Core mint logic
    function _mintInternal(address _to) internal returns (uint256) {
        uint256 tokenId = nextTokenId++;
        _mint(_to, tokenId);
        emit MintedAndPaid(_to, tokenId, MINT_PRICE);
        return tokenId;
    }

    /**
     * @dev Send a lightweight cross-chain mint request to Origin.
     *      Message is just 20 bytes (the user's address) — no ONFT721 codec overhead.
     *      No NativeDrop needed since there's no return trip.
     */
    function _requestMint(bytes calldata _extraOptions) internal {
        // 1. Pay USDC locally
        require(
            usdc.transferFrom(msg.sender, address(this), MINT_PRICE),
            "USDC Payment failed"
        );

        // 2. Build minimal message: just the requester's address
        bytes memory message = abi.encodePacked(msg.sender);

        // 3. Build options — just gas for minting, no NativeDrop
        bytes memory options = OptionsBuilder
            .newOptions()
            .addExecutorLzReceiveOption(MINT_GAS_LIMIT, 0);

        if (_extraOptions.length > 0) {
            options = abi.encodePacked(options, _extraOptions);
        }

        // 4. Quote
        MessagingFee memory fee = _quote(originEid, message, options, false);
        require(msg.value >= fee.nativeFee, "Insufficient native fee");

        // 5. Send lightweight message to Origin
        _lzSend(originEid, message, options, fee, payable(msg.sender));
    }

    // ═══════════════════════════════════════════════════════════
    //                    LZ RECEIVE OVERRIDE
    // ═══════════════════════════════════════════════════════════

    /**
     * @dev Override _lzReceive to handle both:
     *      - Mint requests: 20-byte message (just user address) → mint on Origin
     *      - Standard ONFT bridges: 64+ byte ONFT721 codec message → delegate to super
     *
     *      We distinguish by message length:
     *        20 bytes = mint request (abi.encodePacked(address))
     *        64+ bytes = standard ONFT721 bridge (bytes32 to + uint256 tokenId + ...)
     */
    function _lzReceive(
        Origin calldata _origin,
        bytes32 _guid,
        bytes calldata _message,
        address _executor,
        bytes calldata _extraData
    ) internal virtual override {
        if (_message.length == 20 && endpoint.eid() == originEid) {
            // ── Mint request from remote chain ──
            address user = address(bytes20(_message[0:20]));
            uint256 tokenId = _mintInternal(user);
            emit CrossChainMintReceived(_origin.srcEid, user, tokenId);
        } else {
            // ── Standard ONFT bridge transfer ──
            super._lzReceive(_origin, _guid, _message, _executor, _extraData);
        }
    }

    // ═══════════════════════════════════════════════════════════
    //                    ONFT BRIDGE HELPERS
    // ═══════════════════════════════════════════════════════════

    /// @dev Encode an ONFT721-compatible message (used for quoting bridges)
    function _encodeONFTMsg(
        bytes32 _to,
        uint256 _tokenId
    ) internal pure returns (bytes memory message, bool hasCompose) {
        message = abi.encodePacked(_to, _tokenId);
        hasCompose = false;
    }

    // ═══════════════════════════════════════════════════════════
    //                        ADMIN
    // ═══════════════════════════════════════════════════════════

    /// @notice Withdraw collected USDC to owner
    function withdrawUSDC() external onlyOwner {
        usdc.transfer(owner(), usdc.balanceOf(address(this)));
    }

    /// @notice Update USDC token address
    function setUSDC(address _usdc) external onlyOwner {
        usdc = IERC20(_usdc);
    }

    /// @notice Pause minting (emergency stop)
    function pause() external onlyOwner {
        _pause();
    }

    /// @notice Unpause minting
    function unpause() external onlyOwner {
        _unpause();
    }

    /**
     * @dev Override _payNative to allow excess native gas (refunded by endpoint)
     */
    function _payNative(
        uint256 _nativeFee
    ) internal virtual override returns (uint256 nativeFee) {
        if (msg.value < _nativeFee) revert NotEnoughNative(msg.value);
        return _nativeFee;
    }
}
