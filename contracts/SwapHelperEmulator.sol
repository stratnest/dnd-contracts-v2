// SPDX-License-Identifier: Unlicensed
pragma solidity ^0.8.0;

import { IERC20 } from "@openzeppelin/contracts/interfaces/IERC20.sol";
import { IAaveOracle } from "@aave/core-v3/contracts/interfaces/IAaveOracle.sol";

import "./ISwapHelper.sol";

contract SwapHelperEmulator is ISwapHelper {
    address private ethToken;
    address private aaveOracle;

    constructor(address _ethToken, address _aaveOracle) {
        ethToken = _ethToken;
        aaveOracle = _aaveOracle;
    }

    function swap(address from, address to, uint256 amount)
        external
        override
        returns (uint256)
    {
        require(IERC20(from).allowance(msg.sender, address(this)) >= amount, "Allowance not set");
        require(IERC20(from).balanceOf(msg.sender) >= amount, "Insufficient balance");

        IERC20(from).transferFrom(msg.sender, address(this), amount);

        uint256 ethPrice = IAaveOracle(aaveOracle).getAssetPrice(address(ethToken));

        if (to == ethToken) {
            uint256 stablePrice = IAaveOracle(aaveOracle).getAssetPrice(from);
            uint256 amountEth = stableToEth(amount, stablePrice, ethPrice) / 1000 * 995; // 0.5%
            releaseFunds(msg.sender, ethToken, amountEth);
            return amountEth;

        } else if (from == ethToken) {
            uint256 stablePrice = IAaveOracle(aaveOracle).getAssetPrice(to);
            uint256 amountStable = ethToStable(amount, ethPrice, stablePrice) / 1000 * 995; // 0.5%
            releaseFunds(msg.sender, to, amountStable);
            return amountStable;
        }

        revert("WTF");
    }

    function releaseFunds(address recipient, address token, uint256 amount) internal {
        require(IERC20(token).balanceOf(address(this)) >= amount, "Insufficient balance on swapEmulator");
        IERC20(token).transfer(recipient, amount);
    }

    function calcSwapFee(address from, address to, uint256 amount)
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
