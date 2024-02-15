# Stratnest smart contracts

This is the main repository for smart contracts source code for StratNest protocol https://stratnest.net.

# Deployments

Current deployments at Blast testnet:

| Contract | Address |
| --- | --- |
| Main contract | [`0x78254357e923c6Ec2F86e4Cf3c84a0c4a462d874`](https://testnet.blastscan.io/address/0x78254357e923c6Ec2F86e4Cf3c84a0c4a462d874) |
| Stable token | [`0x6b44419F9e796c13bBee5e7ed749ECA3f6e9a847`](https://testnet.blastscan.io/address/0x6b44419F9e796c13bBee5e7ed749ECA3f6e9a847) |
| ETH token | [`0x494C6fd20BC9143Ec4519126b858ff39200FBE49`](https://testnet.blastscan.io/address/0x494C6fd20BC9143Ec4519126b858ff39200FBE49) |
| Uniswap V3 emulator | [`0x75389B6bA95E9f1D58bB835E2315fA036837140e`](https://testnet.blastscan.io/address/0x75389B6bA95E9f1D58bB835E2315fA036837140e) |
| Aave Emulation, PoolAddressesProvider | [`0x74cDf758A432849A28765295954F227eF14252e4`](https://testnet.blastscan.io/address/0x74cDf758A432849A28765295954F227eF14252e4) |
| Aave Emulation, Pool | [`0xC6E44c125b863344D1385b3Ea5594d5E7aA14F90`](https://testnet.blastscan.io/address/0xC6E44c125b863344D1385b3Ea5594d5E7aA14F90) |
| Aave Emulation, AaveOracle | [`0x7fCa2c968c50264707b8e48cAc9ae15CCA4f2815`](https://testnet.blastscan.io/address/0x7fCa2c968c50264707b8e48cAc9ae15CCA4f2815) |

`Collector` deployments on L2s:

| Chain | Address |
| --- | --- |
| Arbitrum One | [`0xa632319e5748FdA8a0086Ce3b66612e179FbF82A`](https://arbiscan.io/address/0xa632319e5748fda8a0086ce3b66612e179fbf82a) |
| Optimism | [`0xa632319e5748FdA8a0086Ce3b66612e179FbF82A`](https://optimistic.etherscan.io/address/0xa632319e5748FdA8a0086Ce3b66612e179FbF82A) |

# Requirements

We are using [hardhat](https://hardhat.org) so a recent node.js v21 version is a requirement. `npm install` is something that you should be familiar with.

# Hardhat vars

```bash
npx hardhat vars set INFURA_API_KEY your infura api key
npx hardhat vars set PRIVATE_KEY your private key
```

# Testing

Fork Arbitrum One or Optimism:

```bash
npx hardhat node --fork https://arbitrum-mainnet.infura.io/v3/YOUR_API_KEY
```

Then run test:

```bash
npx hardhat --network forked test test/DeltaNeutralDollar2Test.mjs
npx hardhat --network forked test test/CollectorTest.mjs
```

# Linter

We use [solhint](https://protofire.github.io/solhint/).

```bash
npm run lint
```
