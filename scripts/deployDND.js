let mainToken;
let stableToken;

async function main() {
  const TestToken = await ethers.getContractFactory('TestToken');

  stableToken = await TestToken.deploy('testUSD', 6);
  await stableToken.waitForDeployment();
  stableToken.address = await stableToken.getAddress();
  console.log("stable", stableToken.address);

  mainToken = await TestToken.deploy('testETH', 18);
  await mainToken.waitForDeployment();
  mainToken.address = await mainToken.getAddress();
  console.log("main ", mainToken.address);

  const AddressProvider = await ethers.getContractFactory('PoolAddressesProviderEmulator');
  const addressProvider = await AddressProvider.deploy();
  await addressProvider.waitForDeployment();
  console.log("PoolAddressesProviderEmulator", await addressProvider.getAddress());

  const PoolEmulator = await ethers.getContractFactory('PoolEmulator');
  const aavePool = await PoolEmulator.deploy(await addressProvider.getAddress());
  await aavePool.waitForDeployment();
  console.log("PoolEmulator", await aavePool.getAddress());

  await addressProvider.setAddress(0, await aavePool.getAddress());
  console.log("pool address set");

  const AaveOracleEmulator = await ethers.getContractFactory('AaveOracleEmulator');
  const aaveOracle = await AaveOracleEmulator.deploy(
    await addressProvider.getAddress(),
    [
      await stableToken.getAddress(),
      await mainToken.getAddress()
    ],
    ethers.ZeroAddress,
    100000000n
  );
  await aaveOracle.waitForDeployment();
  console.log("AaveOracleEmulator", await aaveOracle.getAddress());

  await addressProvider.setPriceOracle(await aaveOracle.getAddress());

  await aaveOracle.setOverridePrice(await mainToken.getAddress(), 2700n * 10n**8n);
  await aaveOracle.setOverridePrice(await stableToken.getAddress(), 99999000);

  console.log("Prices updated");

  const SwapHelper = await ethers.getContractFactory('SwapHelperEmulator');
  let swapHelper = await SwapHelper.deploy(await mainToken.getAddress(), await aaveOracle.getAddress());
  await swapHelper.waitForDeployment();
  console.log("SwapHelperEmulator", await swapHelper.getAddress());

  const BalancerVaultEmulator = await ethers.getContractFactory('BalancerVaultEmulator');
  const balancerVaultEmulator = await BalancerVaultEmulator.deploy();
  await balancerVaultEmulator.waitForDeployment();
  console.log("BalancerVaultEmulator", await balancerVaultEmulator.getAddress());

  const dndArguments = [
    true, // ismock
    8,
    "DND",
    "Stratnest",
    await stableToken.getAddress(),
    await mainToken.getAddress(),
    await balancerVaultEmulator.getAddress(),
    await addressProvider.getAddress()
  ];

  const DeltaNeutralDollar = await ethers.getContractFactory('DeltaNeutralDollar2');
  const deltaNeutralDollar = await upgrades.deployProxy(
    DeltaNeutralDollar,
    dndArguments,
    {
      initializer: 'initialize',
      kind: 'uups'
    }
  );
  await deltaNeutralDollar.waitForDeployment();
  console.log("DeltaNeutralDollar2", await deltaNeutralDollar.getAddress());

  await deltaNeutralDollar.setSettings(
    await swapHelper.getAddress(),

    10n ** 18n / 100n, // min
    10n ** 18n / 10n, // max

    10, // additionalLtvDistancePercent
    0, // flags
    10 // minRebalancePercent, 10%
  );

  console.log("Settings set");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
