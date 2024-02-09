// SPDX-License-Identifier: none
pragma solidity ^0.8.23;

import { IERC20 } from "@openzeppelin/contracts/interfaces/IERC20.sol";
import { IERC20Metadata } from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import { IAaveOracle } from "@aave/core-v3/contracts/interfaces/IAaveOracle.sol";
import { IPoolAddressesProvider } from "@aave/core-v3/contracts/interfaces/IPoolAddressesProvider.sol";

import "hardhat/console.sol";

struct ReserveConfigurationMapEmulator {
  //bit 0-15: LTV
  uint256 data;
}

uint256 constant PUT_LTV_TO_POOL_CONFIGURATION_DATA_MASK = (1 << 16) - 1;
uint256 constant LTV = 7700;
uint256 constant LIQUIDATION_THRESHOLD = 8200;

contract PoolEmulator {
  address public immutable ADDRESSES_PROVIDER;

  mapping (address customer => uint256 amount) private depositBalanceOf;
  mapping (address customer => uint256 amount) private debtBalanceOf;

  address private supplyAsset;
  address private borrowAsset;

  constructor(address provider) {
    ADDRESSES_PROVIDER = provider;
  }

  function supply(
    address asset,
    uint256 amount,
    address onBehalfOf,
    uint16 referralCode
  ) public {
    require(IERC20(asset).allowance(msg.sender, address(this)) >= amount, "Allowance not set");
    require(IERC20(asset).balanceOf(msg.sender) >= amount, "Insufficient balance");

    if (supplyAsset == address(0)) {
      supplyAsset = asset;
    }

    require(supplyAsset == asset, "Only one asset is supported");

    IERC20(asset).transferFrom(msg.sender, address(this), amount);
    depositBalanceOf[onBehalfOf] += amount;
  }

  function withdraw(
    address asset,
    uint256 amount,
    address to
  ) public returns (uint256) {
    uint256 amountToWithdraw = amount == type(uint256).max ? depositBalanceOf[msg.sender] : amount;

    require(amountToWithdraw > 0, "zero");
    require(depositBalanceOf[msg.sender] >= amountToWithdraw, "Insufficient balance");

    require(supplyAsset == asset, "Only one asset is supported");

    depositBalanceOf[msg.sender] -= amountToWithdraw;
    IERC20(asset).transfer(to, amountToWithdraw);

    return amountToWithdraw;
  }

  function borrow(
    address asset,
    uint256 amount,
    uint256 interestRateMode,
    uint16 referralCode,
    address onBehalfOf
  ) public {
    require(msg.sender == onBehalfOf, "Only self borrow");

    require(amount > 0, "zero");
    require(IERC20(asset).balanceOf(address(this)) >= amount, "Insufficient balance");

    if (borrowAsset == address(0)) {
      borrowAsset = asset;
    }

    require(borrowAsset == asset, "Only one asset is supported");

    debtBalanceOf[msg.sender] += amount;
    IERC20(asset).transfer(msg.sender, amount);
  }

  function repay(
    address asset,
    uint256 amount,
    uint256 interestRateMode,
    address onBehalfOf
  ) public returns (uint256) {
    uint256 amountToRepay = amount == type(uint256).max ? debtBalanceOf[onBehalfOf] : amount;
    require(amountToRepay > 0, "zero");

    require(IERC20(asset).allowance(msg.sender, address(this)) >= amountToRepay, "Allowance not set");
    require(IERC20(asset).balanceOf(msg.sender) >= amountToRepay, "Insufficient balance");

    require(borrowAsset == asset, "Only one asset is supported");

    IERC20(asset).transferFrom(msg.sender, address(this), amountToRepay);
    debtBalanceOf[onBehalfOf] -= amountToRepay;

    return amountToRepay;
  }

  function setUserUseReserveAsCollateral(
    address asset,
    bool useAsCollateral
  ) public {
    // always true
  }

  function getUserAccountData(
    address user
  )
    external
    view
    returns (
      uint256 totalCollateralBase,
      uint256 totalDebtBase,
      uint256 availableBorrowsBase,
      uint256 currentLiquidationThreshold,
      uint256 ltv,
      uint256 healthFactor
    )
  {
    ltv = LTV;
    currentLiquidationThreshold = LIQUIDATION_THRESHOLD;

    if (supplyAsset != address(0)) {
      IAaveOracle oracle = IAaveOracle(IPoolAddressesProvider(ADDRESSES_PROVIDER).getPriceOracle());
      uint256 supplyPrice = oracle.getAssetPrice(supplyAsset);
      uint8 supplyDecimals = IERC20Metadata(supplyAsset).decimals();
      totalCollateralBase = depositBalanceOf[user] * supplyPrice / (10 ** supplyDecimals);
    }

    if (borrowAsset != address(0)) {
      IAaveOracle oracle = IAaveOracle(IPoolAddressesProvider(ADDRESSES_PROVIDER).getPriceOracle());
      uint256 borrowPrice = oracle.getAssetPrice(borrowAsset);
      uint8 borrowDecimals = IERC20Metadata(borrowAsset).decimals();
      totalDebtBase = debtBalanceOf[user] * borrowPrice / (10 ** borrowDecimals);
    }

    uint256 maxBorrowBase = totalCollateralBase * ltv / 10000;
    if (maxBorrowBase > totalDebtBase) {
      availableBorrowsBase = maxBorrowBase - totalDebtBase;
    }

    console.log(" totalCollateralBase", totalCollateralBase);
    console.log("       totalDebtBase", totalDebtBase);
    console.log("       maxBorrowBase", maxBorrowBase);
    console.log("availableBorrowsBase", availableBorrowsBase);

    if (totalDebtBase > 0) {
      healthFactor = totalCollateralBase * LIQUIDATION_THRESHOLD * 1e18 / totalDebtBase / 10000;
      console.log("        healthFactor", healthFactor);

    } else {
      healthFactor = type(uint256).max;
      console.log("        healthFactor max");
    }
  }

  // only return ltv
  function getConfiguration(address asset) external view returns (ReserveConfigurationMapEmulator memory) {
    ReserveConfigurationMapEmulator memory result;
    result.data = LTV & PUT_LTV_TO_POOL_CONFIGURATION_DATA_MASK;
    return result;
  }
}


