# DND source code

This is the main repository for smart contracts source code.

# Requirements

We are using [hardhat](https://hardhat.org) so a recent node.js v21 version is a requirement. `npm install` is something that you should be familiar with.

# Testing

Copy `.env_example` into `.env` and edit appropriately.

Fork Arbitrum One, Optimism, Polygon or Base:

```bash
npx hardhat node --fork https://polygon-mainnet.infura.io/v3/YOU_API_KEY --no-deploy
```

Then run test:

```bash
npx hardhat --network forked test test/DeltaNeutralDollar2Test.mjs
```

# Linter

We use [solhint](https://protofire.github.io/solhint/).

```bash
npm run lint
```
