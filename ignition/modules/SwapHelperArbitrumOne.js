const { buildModule } = require('@nomicfoundation/hardhat-ignition/modules');

module.exports = buildModule('SwapHelperArbitrumOne', (m) => {
  const swapHelperArbitrumOne = m.contract('SwapHelperArbitrumOne', []);
  return { swapHelperArbitrumOne };
});
