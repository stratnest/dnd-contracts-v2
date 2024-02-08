const { buildModule } = require('@nomicfoundation/hardhat-ignition/modules');

module.exports = buildModule('Collector', m => {
  const collector = m.contract('Collector', [
    m.getParameter('connext'),
    m.getParameter('allowedTokens')
  ]);

  return { collector };
});

