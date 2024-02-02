pragma solidity ^0.8.23;

import { OwnableUpgradeable } from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import { UUPSUpgradeable } from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import { IERC20 } from "@openzeppelin/contracts/interfaces/IERC20.sol";
import { IConnext } from "@connext/interfaces/core/IConnext.sol";

uint32 constant ETHEREUM = 6648936;

contract Collector is OwnableUpgradeable, UUPSUpgradeable { // FIXME review proxy
// FIXME deploy using old methods
    address public connext;
    address public base;
    uint256 public slippage;

    address[] private tokens;

    event Push(address indexed token, uint256 amount, uint256 fee);

    function initialize(
        address _connext,
        address[] memory _tokens
    )
        public
        initializer
    {
        connext = _connext;

        slippage = 500; // bps

        for (uint i = 0; i < _tokens.length; i++) {
            tokens.push(_tokens[i]);
        }

        _transferOwnership(msg.sender);
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

    function _authorizeUpgrade(address) internal override onlyOwner {} // FIXME what is it

    function getTokens() public view returns (address[] memory) {
        return tokens;
    }

    function push(address token, uint256 relayerFee) public payable onlyAllowedToken(token) {
        require(base != address(0), "base is not set");
        require(msg.value >= relayerFee, "insufficient fee");

        uint256 amount = IERC20(token).balanceOf(address(this));

        require(amount > 0, "zero amount");

        IERC20(token).approve(connext, amount);

        bytes memory callData;
        IConnext(connext).xcall{value: msg.value}( // explicitly send all caller's fee to Connext
            ETHEREUM, // _destination: Domain ID of the destination chain
            base,     // _to: address of the target contract
            token,    // _asset: address of the token contract
            owner(),  // _delegate: address that can revert or forceLocal on destination
            amount,   // _amount: amount of tokens to transfer
            slippage, // _slippage: max slippage the user will accept in BPS (e.g. 300 = 3%)
            callData  // _callData: the encoded calldata to send
        );

        if (IERC20(token).allowance(address(this), connext) > 0) {
            IERC20(token).approve(connext, 0);
        }

        emit Push(token, amount, msg.value);
    }

    function setBase(address _base) public onlyOwner {
        base = _base;
    }

    function setSlippage(uint256 _slippage) public onlyOwner {
        slippage = _slippage;
    }

    function rescue(address token, address to) public onlyOwner {
        if (token == address(0)) {
            payable(to).transfer(address(this).balance);
            return;
        }

        IERC20(token).transfer(to, IERC20(token).balanceOf(address(this)));
    }
}
