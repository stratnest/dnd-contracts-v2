pragma solidity ^0.8.23;

import { IERC20 } from "@openzeppelin/contracts/interfaces/IERC20.sol";
import { IVaultForDND } from "./interfaces/balancer/IVaultForDND.sol";
import { IFlashLoanRecipientForDND } from "./interfaces/balancer/IFlashLoanRecipientForDND.sol";
import { TestToken } from "./TestToken.sol";

contract BalancerVaultEmulator is IVaultForDND {
    function flashLoan(
        address recipient,
        IERC20[] calldata tokens,
        uint256[] calldata amounts,
        bytes calldata userData
    ) public {
        uint256[] memory feeAmounts = new uint256[](tokens.length);

        for (uint256 i = 0; i < tokens.length; ++i) {
            TestToken(payable(address(tokens[i]))).mintTo(address(recipient), amounts[i]);
        }

        IFlashLoanRecipientForDND(recipient).receiveFlashLoan(tokens, amounts, feeAmounts, userData);

        for (uint256 i = 0; i < tokens.length; ++i) {
            uint256 postLoanBalance = tokens[i].balanceOf(address(this));
            require(postLoanBalance >= amounts[i], "Balancer vault FL did not repay");
            TestToken(payable(address(tokens[i]))).burn(amounts[i]);
        }
    }
}
