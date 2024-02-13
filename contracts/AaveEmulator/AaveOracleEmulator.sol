// SPDX-License-Identifier: none
pragma solidity ^0.8.23;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";

contract AaveOracleEmulator is Ownable {
    address public immutable ADDRESSES_PROVIDER;
    address public immutable BASE_CURRENCY;
    uint256 public immutable BASE_CURRENCY_UNIT;

    mapping (address => uint256) private price;

    address[] private _assets;

    constructor(
        address provider,
        address[] memory assets,
        address baseCurrency,
        uint256 baseCurrencyUnit
    ) Ownable(msg.sender) {
        ADDRESSES_PROVIDER = provider;
        BASE_CURRENCY = baseCurrency;
        BASE_CURRENCY_UNIT = baseCurrencyUnit;
        _assets = assets;
    }

    function getAssetPrice(address asset) external view returns (uint256) {
        return price[asset];
    }

    function getAssetsPrices(address[] calldata assets) external view returns (uint256[] memory) {
        uint256[] memory assetsPrices = new uint256[](assets.length);

        for (uint i = 0; i < assets.length; i++) {
            assetsPrices[i] = price[assets[i]];
        }

        return assetsPrices;
    }

    function getSourceOfAsset(address asset) external pure returns (address) {
        return address(0);
    }

    function getFallbackOracle() external pure returns (address) {
        return address(0);
    }

    function setOverridePrice(address asset, uint256 _price) external onlyOwner {
        price[asset] = _price;
    }
}
