require('@nomicfoundation/hardhat-chai-matchers');
require('@nomicfoundation/hardhat-verify');
require('hardhat-abi-exporter');
require('hardhat-contract-sizer');
require('hardhat-deal');
require('solidity-docgen');
require('@openzeppelin/hardhat-upgrades');

const helpers = require('@nomicfoundation/hardhat-network-helpers');

const INFURA_API_KEY = vars.get('INFURA_API_KEY');

task('mine6', "Mine 6 blocks").setAction(() => helpers.mine(6));

const accounts = vars.has('PRIVATE_KEY') ? [ vars.get('PRIVATE_KEY') ] : undefined;

module.exports = {
  networks: {
    forked: {
      url: 'http://127.0.0.1:8545',
      accounts
    },

    optimisticEthereum: {
      url: `https://optimism-mainnet.infura.io/v3/${INFURA_API_KEY}`,
      accounts
    },

    arbitrumOne: {
      url: `https://arbitrum-mainnet.infura.io/v3/${INFURA_API_KEY}`,
      accounts
    },

    polygon: {
      url: `https://polygon-mainnet.infura.io/v3/${INFURA_API_KEY}`,
      accounts
    },

    sepolia: {
      url: `https://sepolia.infura.io/v3/${INFURA_API_KEY}`,
      accounts
    }
  },

  etherscan: {
    apiKey: {
      ethereum: vars.get('ETHERSCAN_ETHEREUM', null),
      optimisticEthereum: vars.get('ETHERSCAN_OPTIMISTIC_ETHEREUM', null),
      arbitrumOne: vars.get('ETHERSCAN_ARBITRUM_ONE', null),
      polygon: vars.get('ETHERSCAN_POLYGON', null),
      sepolia: vars.get('ETHERSCAN_ETHEREUM', null)
    }
  },

  solidity: {
    compilers: [
      {
        version: '0.8.24',
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
          outputSelection: {
            "*": {
              "*": ["storageLayout"]
            }
          }
        }
      }
    ]
  },

  abiExporter: {
    path: './abi',
    runOnCompile: false,
    clear: true,
    flat: true,
    spacing: 2,
    pretty: false
  },

  docgen: {
    pages: 'files'
  }
};
