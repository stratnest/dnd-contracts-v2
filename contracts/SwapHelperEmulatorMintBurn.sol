// SPDX-License-Identifier: Unlicensed
pragma solidity ^0.8.0;

import { Math } from "@openzeppelin/contracts/utils/math/Math.sol";
import { IERC20 } from "@openzeppelin/contracts/interfaces/IERC20.sol";
import { IAaveOracle } from "@aave/core-v3/contracts/interfaces/IAaveOracle.sol";

import { TestToken } from "./TestToken.sol";
import { ISwapHelper } from "./ISwapHelper.sol";

uint256 constant COMMISSION = 5;
uint256 constant COMMISSION_DIVIDER = 1000; // 5/1000 is 0.5%, which is a high commission amount

contract SwapHelperEmulatorMintBurn is ISwapHelper {
    address private ethToken;
    address private aaveOracle;

    constructor(address _ethToken, address _aaveOracle) {
        ethToken = _ethToken;
        aaveOracle = _aaveOracle;
    }

    function swapExactInput(address from, address to, uint256 amountIn)
        external
        override
        returns (uint256)
    {
        require(IERC20(from).allowance(msg.sender, address(this)) >= amountIn, "Allowance not set");

        TestToken(payable(from)).burnFrom(msg.sender, amountIn);

        uint256 ethPrice = IAaveOracle(aaveOracle).getAssetPrice(ethToken);

        if (to == ethToken) {
            uint256 stablePrice = IAaveOracle(aaveOracle).getAssetPrice(from);
            uint256 amountEth = Math.mulDiv(stableToEth(amountIn, stablePrice, ethPrice), COMMISSION_DIVIDER - COMMISSION, COMMISSION_DIVIDER);
            TestToken(payable(to)).mintTo(msg.sender, amountEth);
            return amountEth;

        } else if (from == ethToken) {
            uint256 stablePrice = IAaveOracle(aaveOracle).getAssetPrice(to);
            uint256 amountStable = Math.mulDiv(ethToStable(amountIn, ethPrice, stablePrice), COMMISSION_DIVIDER - COMMISSION, COMMISSION_DIVIDER);
            TestToken(payable(to)).mintTo(msg.sender, amountStable);
            return amountStable;
        }

        revert("WTF");
    }

    function swapExactOutput(address from, address to, uint256 amountOut, uint256 amountInMaximum)
        external
        override
        returns (uint256)
    {
        if (to == ethToken) {
            uint256 amountStable = Math.mulDiv(
                ethToStable(
                    amountOut,
                    IAaveOracle(aaveOracle).getAssetPrice(ethToken),
                    IAaveOracle(aaveOracle).getAssetPrice(from)
                ),
                COMMISSION_DIVIDER + COMMISSION,
                COMMISSION_DIVIDER
            );

            TestToken(payable(from)).burnFrom(msg.sender, amountStable);
            TestToken(payable(to)).mintTo(msg.sender, amountOut);

            return amountStable;

        } else if (from == ethToken) {
            uint256 amountEth = Math.mulDiv(
                stableToEth(
                    amountOut,
                    IAaveOracle(aaveOracle).getAssetPrice(to),
                    IAaveOracle(aaveOracle).getAssetPrice(ethToken)
                ),
                COMMISSION_DIVIDER + COMMISSION,
                COMMISSION_DIVIDER
            );

            TestToken(payable(from)).burnFrom(msg.sender, amountEth);
            TestToken(payable(to)).mintTo(msg.sender, amountOut);

            return amountEth;

        } else {
            revert("Unknown pair");
        }
    }

    function calcSwapFee(address from, address to, uint256 amount)
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
