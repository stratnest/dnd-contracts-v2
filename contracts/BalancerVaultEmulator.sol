pragma solidity ^0.8.23;

import { IERC20 } from "@openzeppelin/contracts/interfaces/IERC20.sol";
import { IVaultForDND } from "./interfaces/balancer/IVaultForDND.sol";
import { IFlashLoanRecipientForDND } from "./interfaces/balancer/IFlashLoanRecipientForDND.sol";

import "hardhat/console.sol";

contract BalancerVaultEmulator is IVaultForDND {
    function flashLoan(
        address recipient,
        IERC20[] calldata tokens,
        uint256[] calldata amounts,
        bytes calldata userData
    ) public {
        uint256[] memory feeAmounts = new uint256[](tokens.length);
        uint256[] memory preLoanBalances = new uint256[](tokens.length);

        for (uint256 i = 0; i < tokens.length; ++i) {
            IERC20 token = tokens[i];
            uint256 amount = amounts[i];

            preLoanBalances[i] = token.balanceOf(address(this));
            if (preLoanBalances[i] < amount) {
                console.log("%s Required: %s, Actual: %s", address(token), amount, preLoanBalances[i]);
                revert("Balancer vault not enough tokens");
            }
            token.transfer(address(recipient), amount);
        }

        IFlashLoanRecipientForDND(recipient).receiveFlashLoan(tokens, amounts, feeAmounts, userData);

        for (uint256 i = 0; i < tokens.length; ++i) {
            uint256 postLoanBalance = tokens[i].balanceOf(address(this));
            require(postLoanBalance >= preLoanBalances[i], "Balancer vault oops2");
        }
    }
}
