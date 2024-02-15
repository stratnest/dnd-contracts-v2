# Stratnest smart contracts

This is the main repository for smart contracts source code for StratNest protocol https://stratnest.net.

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
