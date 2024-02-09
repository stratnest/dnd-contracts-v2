// SPDX-License-Identifier: none
pragma solidity ^0.8.23;

contract PoolAddressesProviderEmulator {
    mapping(uint8 => address) private addresses;

    uint8 public constant POOL = 0;
    uint8 public constant PRICE_ORACLE = 1;
    uint8 public constant DATA_PROVIDER = 2;

    function getAddress(uint8 what) private view returns (address) {
        return addresses[what];
    }

    function setAddress(uint8 what, address _address) public {
        addresses[what] = _address;
    }

    function getPool() external view returns (address) {
        return addresses[POOL];
    }

    function getPriceOracle() external view returns (address) {
        return addresses[PRICE_ORACLE];
    }

    function setPriceOracle(address _address) public {
        addresses[PRICE_ORACLE] = _address;
    }

    function getPoolDataProvider() external view returns (address) {
        return addresses[DATA_PROVIDER];
    }
}
