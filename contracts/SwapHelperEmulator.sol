// SPDX-License-Identifier: Unlicensed
pragma solidity ^0.8.0;

import { IERC20 } from "@openzeppelin/contracts/interfaces/IERC20.sol";

import { IAaveOracle } from "@aave/core-v3/contracts/interfaces/IAaveOracle.sol";
import { IPoolAddressesProvider } from "@aave/core-v3/contracts/interfaces/IPoolAddressesProvider.sol";

import "./ISwapHelper.sol";

import "hardhat/console.sol";

contract SwapHelperEmulator is ISwapHelper {
    address private custodian;
    address private wstethToken;
    address private addressesProvider;

    // FIXME use this balance instead of custodian
    constructor(address _custodian, address _ethToken, address _addressesProvider) {
        custodian = _custodian;
        wstethToken = _ethToken;
        addressesProvider = _addressesProvider;
    }

    function oracle() internal view returns (IAaveOracle) {
        return IAaveOracle(IPoolAddressesProvider(addressesProvider).getPriceOracle());
    }

    function swap(address from, address to, uint256 amount)
        external
        override
        returns (uint256)
    {
        console.log("sender", msg.sender);
        console.log("amount", amount);
        IERC20(from).transferFrom(msg.sender, address(this), amount);

        uint256 wstethPrice = oracle().getAssetPrice(address(wstethToken));

        if (to == wstethToken) {
            uint256 stablePrice = oracle().getAssetPrice(from);
            uint256 amountEth = stableToEth(amount, stablePrice, wstethPrice) / 1000 * 995; // 0.5%
            IERC20(wstethToken).transferFrom(custodian, msg.sender, amountEth);
            IERC20(from).transfer(custodian, amount);
            return amountEth;

        } else if (from == wstethToken) {
            uint256 stablePrice = oracle().getAssetPrice(to);
            uint256 amountStable = ethToStable(amount, wstethPrice, stablePrice) / 1000 * 995; // 0.5%
            IERC20(to).transferFrom(custodian, msg.sender, amountStable);
            IERC20(wstethToken).transfer(custodian, amount);
            return amountStable;
        }

        revert("WTF");
    }

    function calcSwapFee(address from, address to, uint256 amount) // solhint-disable-line no-unused-vars
        public
        view
        override
        returns (uint256)
    {
        return amount * 10 / 1000;
    }

    function ethToStable(uint256 amount, uint256 ethPrice, uint256 stablePrice) internal pure returns (uint256) {
        return amount * ethPrice / 10 ** (18 - 6) / stablePrice;
    }

    function stableToEth(uint256 amount, uint256 stablePrice, uint256 ethPrice) internal pure returns (uint256) {
        return amount * stablePrice * 10 ** (18 - 6) / ethPrice;
    }
}
