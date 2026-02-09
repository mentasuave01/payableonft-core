// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { ILayerZeroEndpointV2, MessagingParams, MessagingFee, MessagingReceipt } from "../layerzero/lz-evm-protocol-v2/interfaces/ILayerZeroEndpointV2.sol";
import { Origin } from "../layerzero/lz-evm-protocol-v2/interfaces/ILayerZeroReceiver.sol";
import { SetConfigParam } from "../layerzero/lz-evm-protocol-v2/interfaces/IMessageLibManager.sol";

/**
 * @notice Mock LayerZero Endpoint V2 for testing
 * @dev Simulates cross-chain messaging for local testing
 */
contract MockLzEndpoint is ILayerZeroEndpointV2 {
    uint32 public localEid;

    constructor(uint32 _localEid) {
        localEid = _localEid;
    }

    // Core messaging functions
    function quote(MessagingParams calldata, address) external pure returns (MessagingFee memory) {
        return MessagingFee({ nativeFee: 0.001 ether, lzTokenFee: 0 });
    }

    function send(
        MessagingParams calldata _params,
        address
    ) external payable returns (MessagingReceipt memory) {
        return MessagingReceipt({
            guid: keccak256(abi.encode(_params.dstEid, _params.message)),
            nonce: 1,
            fee: MessagingFee({ nativeFee: msg.value, lzTokenFee: 0 })
        });
    }

    function verify(Origin calldata, address, bytes32) external {}
    function verifiable(Origin calldata, address) external pure returns (bool) { return true; }
    function initializable(Origin calldata, address) external pure returns (bool) { return true; }
    function lzReceive(Origin calldata, address, bytes32, bytes calldata, bytes calldata) external payable {}
    function clear(address, Origin calldata, bytes32, bytes calldata) external {}
    function setLzToken(address) external {}
    function lzToken() external pure returns (address) { return address(0); }
    function setDelegate(address) external {}
    function nativeToken() external pure returns (address) { return address(0); }
    function eid() external view returns (uint32) { return localEid; }

    // IMessagingContext
    function isSendingMessage() external pure returns (bool) { return false; }
    function getSendContext() external pure returns (uint32, address) { return (0, address(0)); }

    // IMessageLibManager stubs
    function registerLibrary(address) external {}
    function isRegisteredLibrary(address) external pure returns (bool) { return true; }
    function getRegisteredLibraries() external pure returns (address[] memory) { return new address[](0); }
    function setDefaultSendLibrary(uint32, address) external {}
    function defaultSendLibrary(uint32) external pure returns (address) { return address(0); }
    function setDefaultReceiveLibrary(uint32, address, uint256) external {}
    function defaultReceiveLibrary(uint32) external pure returns (address) { return address(0); }
    function setDefaultReceiveLibraryTimeout(uint32, address, uint256) external {}
    function defaultReceiveLibraryTimeout(uint32) external pure returns (address, uint256) { return (address(0), 0); }
    function isSupportedEid(uint32) external pure returns (bool) { return true; }
    function isValidReceiveLibrary(address, uint32, address) external pure returns (bool) { return true; }
    function setSendLibrary(address, uint32, address) external {}
    function getSendLibrary(address, uint32) external pure returns (address) { return address(0); }
    function isDefaultSendLibrary(address, uint32) external pure returns (bool) { return true; }
    function setReceiveLibrary(address, uint32, address, uint256) external {}
    function getReceiveLibrary(address, uint32) external pure returns (address, bool) { return (address(0), true); }
    function setReceiveLibraryTimeout(address, uint32, address, uint256) external {}
    function receiveLibraryTimeout(address, uint32) external pure returns (address, uint256) { return (address(0), 0); }
    function setConfig(address, address, SetConfigParam[] calldata) external {}
    function getConfig(address, address, uint32, uint32) external pure returns (bytes memory) { return ""; }
    function isSendLibrary(address, uint32, address) external pure returns (bool) { return true; }

    // IMessagingChannel - Fixed signatures
    function nilify(address, uint32, bytes32, uint64, bytes32) external {}
    function burn(address, uint32, bytes32, uint64, bytes32) external {}
    function skip(address, uint32, bytes32, uint64) external {}
    function nilifiedAt(address, bytes32, uint32, bytes32) external pure returns (uint256) { return 0; }
    function burntAt(address, bytes32, uint32, bytes32) external pure returns (uint256) { return 0; }
    function lazyInboundNonce(address, uint32, bytes32) external pure returns (uint64) { return 0; }
    function inboundNonce(address, uint32, bytes32) external pure returns (uint64) { return 0; }
    function outboundNonce(address, uint32, bytes32) external pure returns (uint64) { return 0; }
    function inboundPayloadHash(address, uint32, bytes32, uint64) external pure returns (bytes32) { return bytes32(0); }
    function nextGuid(address, uint32, bytes32) external pure returns (bytes32) { return bytes32(0); }

    // IMessagingComposer stubs
    function composeQueue(address, address, bytes32, uint16) external pure returns (bytes32) { return bytes32(0); }
    function sendCompose(address, bytes32, uint16, bytes calldata) external {}
    function lzCompose(address, address, bytes32, uint16, bytes calldata, bytes calldata) external payable {}
}
