# DND source code

This is the main repository for smart contracts source code.

# Requirements

We are using [hardhat](https://hardhat.org) so a recent node.js v21 version is a requirement. `npm install` is something that you should be familiar with.

# Hardhat vars

```bash
npx hardhat vars set INFURA_API_KEY YOUR_API_KEY
```

# Testing

Fork Arbitrum One, Optimism, Polygon or Base:

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
