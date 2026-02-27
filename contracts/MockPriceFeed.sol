// SPDX-License-Identifier: MIT

pragma solidity ^0.8.20;

import {
    ILayerZeroPriceFeed
} from "./layerzero/lz-evm-protocol-v2/interfaces/ILayerZeroPriceFeed.sol";

contract MockPriceFeed is ILayerZeroPriceFeed {
    uint256 public fee;

    function setFee(uint256 _fee) external {
        fee = _fee;
    }

    function getFee(
        uint32,
        uint256,
        uint256
    ) external view override returns (uint256) {
        return fee;
    }

    // Dummy implementations for required interface functions
    function nativeTokenPriceUSD() external view override returns (uint128) {
        return 0;
    }
    function getPrice(uint32) external view override returns (Price memory) {
        return Price(0, 0, 0);
    }
    function getPriceRatioDenominator()
        external
        view
        override
        returns (uint128)
    {
        return 10 ** 20;
    }
    function estimateFeeByEid(
        uint32,
        uint256,
        uint256
    ) external view override returns (uint256, uint128, uint128, uint128) {
        return (fee, 0, 0, 0);
    }
    function estimateFeeOnSend(
        uint32,
        uint256,
        uint256
    ) external payable override returns (uint256, uint128, uint128, uint128) {
        return (fee, 0, 0, 0);
    }
}
