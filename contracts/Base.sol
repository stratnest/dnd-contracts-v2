pragma solidity ^0.8.23;

import { OwnableUpgradeable } from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import { UUPSUpgradeable } from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import { IERC20 } from "@openzeppelin/contracts/interfaces/IERC20.sol";
import { ILaunchBridge } from "./interfaces/ILaunchBridge.sol";

interface IWETH {
    function withdraw(uint wad) external;
}

contract Base is OwnableUpgradeable, UUPSUpgradeable { // FIXME review proxy
    address public launchBridge;
    address public weth;

    event Deposit(uint256 amountEth, uint256 amountDai);
    event Transition();

    function initialize(
        address _launchBridge,
        address _weth
    )
        public
        initializer
    {
        launchBridge = _launchBridge;
        weth = _weth;

        _transferOwnership(msg.sender);
    }

    receive() external payable {} // thank you.

    function deposit() public payable {
        require(!ILaunchBridge(launchBridge).transitioned(address(this)), "already transitioned");

        uint256 amountWeth = IERC20(weth).balanceOf(address(this));
        if (amountWeth > 0) {
            IWETH(weth).withdraw(amountWeth);
        }

        uint256 amountEth = address(this).balance;
        uint256 amountDai = IERC20(ILaunchBridge(launchBridge).DAI()).balanceOf(address(this));

        require(amountDai + amountEth > 0, "zero amount");

        if (amountEth > 0) {
            ILaunchBridge(launchBridge).depositETH{value: amountEth}();
        }

        if (amountDai > 0) {
            IERC20(ILaunchBridge(launchBridge).DAI()).approve(launchBridge, amountDai);
            ILaunchBridge(launchBridge).depositDAI(amountDai);
        }

        emit Deposit(amountEth, amountDai);
    }

    function transition() public onlyOwner {
        ILaunchBridge(launchBridge).transition();
        emit Transition();
    }

    function _authorizeUpgrade(address) internal override onlyOwner {} // FIXME what is it

    function rescue(address token, address to) public onlyOwner {
        if (token == address(0)) {
            payable(to).transfer(address(this).balance);
            return;
        }

        IERC20(token).transfer(to, IERC20(token).balanceOf(address(this)));
    }
}
