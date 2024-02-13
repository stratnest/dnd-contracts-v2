// SPDX-License-Identifier: Unlicensed
pragma solidity ^0.8.23;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract TestToken is ERC20 {
    uint8 private immutable _decimals;

    event Deposit(address indexed dst, uint wad);
    event Withdrawal(address indexed src, uint wad);

    constructor(string memory symbol, uint8 __decimals) ERC20("Test token", symbol) {
        _decimals = __decimals;
    }

    function decimals() public view override returns (uint8) {
        return _decimals;
    }

    function mint(uint256 amount) public {
        _mint(msg.sender, amount);
    }

    function burn(uint256 amount) public {
        _burn(msg.sender, amount);
    }

    function mintTo(address account, uint256 amount) public {
        _mint(account, amount);
    }

    function burnFrom(address account, uint256 amount) public {
        _burn(account, amount);
    }

    receive() external payable {
        deposit();
    }

    function deposit() public payable {
        _mint(msg.sender, msg.value);
        emit Deposit(msg.sender, msg.value);
    }

    function withdraw(uint wad) public {
        _burn(msg.sender, wad);
        payable(msg.sender).transfer(wad);
        emit Withdrawal(msg.sender, wad);
    }
}
