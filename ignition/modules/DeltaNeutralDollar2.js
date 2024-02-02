const { buildModule } = require('@nomicfoundation/hardhat-ignition/modules');
// const swapHelperArbitrumOne = require('./SwapHelperArbitrumOne');

module.exports = buildModule('DeltaNeutralDollar2', (m) => {
  // const a = m.useModule(swapHelperArbitrumOne);
  // console.log(a.swapHelperArbitrumOne);
  // const sirko = m.contractAt("SwapHelperArbitrumOne", [a.swapHelperArbitrumOne]);
  // console.log(sirko);;

  const dnd = m.contract('DeltaNeutralDollar2', []);

  const USDCE_ARBITRUM = '0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8';
  const WSTETH_ARBITRUM = '0x5979D7b546E38E414F7E9822514be443A4800529';

  const BALANCER_VAULT = '0xBA12222222228d8Ba445958a75a0704d566BF2C8'; // optimism, arbitrum, polygon and base

  const AAVE_ADDRESSES_PROVIDER_OPTIMISM_ARBITRUM_POLYGON = '0xa97684ead0e402dC232d5A977953DF7ECBaB3CDb';

  const settings = {
    swapHelper: process.env.SWAP_HELPER_ADDRESS,

    minDepositAmount: 10n ** 18n / 100n, // 0.01 ETH
    maxDepositAmount: 10n ** 18n * 2n, // 2 ETH

    additionalLtvDistancePercent: 10,
    flags: 0,
    minRebalancePercent: 10 // 1.5%
  };

  m.call(dnd, 'initialize', [
    8,
    "DND",
    "Delta Neutral Something FIXME",
    USDCE_ARBITRUM,
    WSTETH_ARBITRUM,
    BALANCER_VAULT,
    AAVE_ADDRESSES_PROVIDER_OPTIMISM_ARBITRUM_POLYGON,
    settings
  ]);

  return { dnd };
});
