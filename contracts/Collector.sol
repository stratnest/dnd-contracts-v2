// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { IERC20 } from "@openzeppelin/contracts/interfaces/IERC20.sol";
import { IConnext } from "@connext/interfaces/core/IConnext.sol";

uint32 constant ETHEREUM = 6648936;

contract Collector is Ownable {
    address public immutable connext;
    address public base;
    uint256 public slippage;

    address[] private tokens;

    event Push(address indexed token, uint256 amount, uint256 fee);

    constructor(address _connext, address[] memory _tokens)
        Ownable(msg.sender)
    {
        connext = _connext;

        slippage = 500; // bps

        for (uint i = 0; i < _tokens.length; i++) {
            tokens.push(_tokens[i]);
        }
    }

    modifier onlyAllowedToken(address token) {
        bool isAllowedToken = false;

        for (uint i = 0; i < tokens.length; i++) {
            if (tokens[i] == token) {
                isAllowedToken = true;
                break;
            }
        }

        require(isAllowedToken, "token is not allowed");

        _;
    }

    function getAllowedTokens()
        public
        view
        returns (address[] memory)
    {
        return tokens;
    }

    function push(address token, uint256 relayerFee)
        public
        payable
        onlyAllowedToken(token)
    {
        require(base != address(0), "base is not set");
        require(msg.value >= relayerFee, "insufficient fee");

        uint256 amount = IERC20(token).balanceOf(address(this));

        require(amount > 0, "zero amount");

        IERC20(token).approve(connext, amount);

        bytes memory callData;
        IConnext(connext).xcall{value: msg.value}( // explicitly send the whole of caller's fee to Connext
            ETHEREUM, // _destination
            base,     // _to: destination address
            token,    // _asset
            owner(),  // _delegate: address that can revert or forceLocal on destination
            amount,   // _amount: amount of tokens to transfer
            slippage, // _slippage: max slippage in BPS (e.g. 300 = 3%)
            callData
        );

        if (IERC20(token).allowance(address(this), connext) > 0) {
            IERC20(token).approve(connext, 0);
        }

        emit Push(token, amount, msg.value);
    }

    function setBase(address _base)
        public
        onlyOwner
    {
        base = _base;
    }

    function setSlippage(uint256 _slippage)
        public
        onlyOwner
    {
        slippage = _slippage;
    }

    function setAllowedTokens(address[] memory _tokens)
        public
        onlyOwner
    {
        tokens = _tokens;
    }

    function rescue(address token, address to)
        public
        onlyOwner
    {
        if (token == address(0)) {
            payable(to).transfer(address(this).balance);
            return;
        }

        IERC20(token).transfer(to, IERC20(token).balanceOf(address(this)));
    }
}
