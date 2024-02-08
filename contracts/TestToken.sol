// SPDX-License-Identifier: Unlicensed
pragma solidity ^0.8.23;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract TestToken is ERC20 {
    uint8 private immutable _decimals;

    constructor(string memory symbol, uint8 __decimals) ERC20("Test token", symbol) {
        _decimals = __decimals;
    }

    function decimals() public view override returns (uint8) {
        return _decimals;
    }

    function mint(uint256 amount) public {
        _mint(msg.sender, amount);
    }

    function mintTo(address account, uint256 amount) public {
        _mint(account, amount);
    }
}
