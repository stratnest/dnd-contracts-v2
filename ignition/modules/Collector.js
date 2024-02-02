const { buildModule } = require('@nomicfoundation/hardhat-ignition/modules');

module.exports = buildModule('Collector', (m) => {
  const collector = m.contract('Collector', []);

  const CONNEXT_ARBITRUM = '0xEE9deC2712cCE65174B561151701Bf54b99C24C8';

  const DAI_ARBITRUM = '0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1';
  const WETH_ARBITRUM = '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1';

  m.call(collector, 'initialize', [
    CONNEXT_ARBITRUM,
    [
      DAI_ARBITRUM,
      WETH_ARBITRUM
    ]
  ]);

  return { collector };
});
