// SPDX-License-Identifier: Unlicensed
pragma solidity ^0.8.0;

interface ISwapHelper {
    function calcSwapFee(address from, address to, uint256 amountIn)
        external
        view
        returns (uint256);

    function swapExactInput(address from, address to, uint256 amountIn)
        external
        returns (uint256);

    function swapExactOutput(address from, address to, uint256 amountOut, uint256 amountInMaximum)
        external
        returns (uint256);
}
