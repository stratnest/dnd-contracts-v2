// SPDX-License-Identifier: Unlicensed
pragma solidity ^0.8.0;

import { Math } from "@openzeppelin/contracts/utils/math/Math.sol";
import { IERC20 } from "@openzeppelin/contracts/interfaces/IERC20.sol";
import { IAaveOracle } from "@aave/core-v3/contracts/interfaces/IAaveOracle.sol";
import { IPoolAddressesProvider } from "@aave/core-v3/contracts/interfaces/IPoolAddressesProvider.sol";

import { ISwapHelper } from "./ISwapHelper.sol";

uint256 constant COMMISSION = 5;
uint256 constant COMMISSION_DIVIDER = 1000; // 5/1000 is 0.5%, which is a high commission amount

contract SwapHelperEmulatorCustodian is ISwapHelper {
    address private wstethToken;
    address private wethToken;
    address private addressesProvider;

    constructor(address _ethToken, address _wethToken, address _addressesProvider) {
        wstethToken = _ethToken;
        wethToken = _wethToken;
        addressesProvider = _addressesProvider;
    }

    function swapExactInput(address from, address to, uint256 amountIn)
        external
        override
        returns (uint256)
    {
        IAaveOracle oracle = IAaveOracle(IPoolAddressesProvider(addressesProvider).getPriceOracle());

        IERC20(from).transferFrom(msg.sender, address(this), amountIn);

        uint256 wstethPrice = oracle.getAssetPrice(address(wstethToken));

        if (to == wstethToken) {
            uint256 stablePrice = oracle.getAssetPrice(from);

            uint256 amountEth = Math.mulDiv(
                stableToEth(amountIn, stablePrice, wstethPrice),
                COMMISSION_DIVIDER - COMMISSION,
                COMMISSION_DIVIDER
            );

            IERC20(wstethToken).transfer(msg.sender, amountEth);

            return amountEth;

        } else if (from == wstethToken) {
            uint256 stablePrice = oracle.getAssetPrice(to);

            uint256 amountStable = Math.mulDiv(
                ethToStable(amountIn, wstethPrice, stablePrice),
                COMMISSION_DIVIDER - COMMISSION,
                COMMISSION_DIVIDER
            );

            IERC20(to).transfer(msg.sender, amountStable);

            return amountStable;
        }

        revert("Unknown pair");
    }

    function swapExactOutput(address from, address to, uint256 amountOut, uint256 amountInMaximum)
        external
        override
        returns (uint256)
    {
        IAaveOracle oracle = IAaveOracle(IPoolAddressesProvider(addressesProvider).getPriceOracle());

        if (to == wstethToken) {
            uint256 amountStable = Math.mulDiv(
                ethToStable(
                    amountOut,
                    oracle.getAssetPrice(address(wstethToken)),
                    oracle.getAssetPrice(from)
                ),
                COMMISSION_DIVIDER + COMMISSION,
                COMMISSION_DIVIDER
            );

            IERC20(from).transferFrom(msg.sender, address(this), amountStable);
            IERC20(to).transfer(msg.sender, amountOut);

            return amountStable;

        } else if (from == wstethToken) {
            uint256 amountEth = Math.mulDiv(
                stableToEth(
                    amountOut,
                    oracle.getAssetPrice(to),
                    oracle.getAssetPrice(address(wstethToken))
                ),
                COMMISSION_DIVIDER + COMMISSION,
                COMMISSION_DIVIDER
            );

            IERC20(from).transferFrom(msg.sender, address(this), amountEth);
            IERC20(to).transfer(msg.sender, amountOut);

            return amountEth;
        }

        revert("Unknown pair");
    }

    function calcSwapFee(address from, address to, uint256 amount) // solhint-disable-line no-unused-vars
        public
        view
        override
        returns (uint256)
    {
        return Math.mulDiv(amount, COMMISSION, COMMISSION_DIVIDER);
    }

    function ethToStable(uint256 amount, uint256 ethPrice, uint256 stablePrice) internal pure returns (uint256) {
        return amount * ethPrice / 10 ** (18 - 6) / stablePrice;
    }

    function stableToEth(uint256 amount, uint256 stablePrice, uint256 ethPrice) internal pure returns (uint256) {
        return amount * stablePrice * 10 ** (18 - 6) / ethPrice;
    }
}
