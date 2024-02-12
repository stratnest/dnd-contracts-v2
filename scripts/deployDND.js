let mainToken;
let stableToken;

async function getAddressOfTarget(target) {
  if (target.address) {
    return target.address;
  }

  if (target.getAddress) {
    return await target.getAddress();
  }

  return target;
}

async function getMainToken(target, amount) {
  await mainToken.mintTo(await getAddressOfTarget(target), amount);
}

async function getStableToken(target, amount) {
  await stableToken.mintTo(await getAddressOfTarget(target), amount);
}

async function main() {
  const DeltaNeutralDollar = await ethers.getContractFactory('DeltaNeutralDollar2');
  const deltaNeutralDollar = await DeltaNeutralDollar.deploy();
  await deltaNeutralDollar.waitForDeployment();
  console.log("DeltaNeutralDollar2", await deltaNeutralDollar.getAddress());

  const TestToken = await ethers.getContractFactory('TestToken');

  stableToken = await TestToken.deploy('STABLE', 6);
  await stableToken.waitForDeployment();
  stableToken.address = await stableToken.getAddress();

  mainToken = await TestToken.deploy('MAIN', 18);
  await mainToken.waitForDeployment();
  mainToken.address = await mainToken.getAddress();
  console.log("weth", mainToken.address);

  const AddressProvider = await ethers.getContractFactory('PoolAddressesProviderEmulator');
  const addressProvider = await AddressProvider.deploy();
  await addressProvider.waitForDeployment();
  console.log("PoolAddressesProviderEmulator", await addressProvider.getAddress());

  const PoolEmulator = await ethers.getContractFactory('PoolEmulator');
  const aavePool = await PoolEmulator.deploy(await addressProvider.getAddress());
  await aavePool.waitForDeployment();
  console.log("PoolEmulator", await aavePool.getAddress());

  await getMainToken(aavePool, 1000n * 10n ** 18n);
  await getStableToken(aavePool, 1000n * 2000n * 10n ** 6n);

  await addressProvider.setAddress(0, await aavePool.getAddress());

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
  await addressProvider.setPriceOracle(await aaveOracle.getAddress());

  await aaveOracle.setOverridePrice(await mainToken.getAddress(), 2000n * 10n**8n);
  await aaveOracle.setOverridePrice(await stableToken.getAddress(), 99999000);

  const SwapHelper = await ethers.getContractFactory('SwapHelperEmulator');
  let swapHelper = await SwapHelper.deploy(await mainToken.getAddress(), await aaveOracle.getAddress());
  await swapHelper.waitForDeployment();

  await Promise.all([
    getMainToken(swapHelper, 10n * 10n ** 18n),
    getStableToken(swapHelper, 10000n * 10n ** 6n),
  ]);

  const BalancerVaultEmulator = await ethers.getContractFactory('BalancerVaultEmulator');
  const balancerVaultEmulator = await BalancerVaultEmulator.deploy();
  await balancerVaultEmulator.waitForDeployment();

  await getMainToken(balancerVaultEmulator, 100n * 10n**18n);
  await getStableToken(balancerVaultEmulator, 1_000_000n * 10n**6n);

  const settings = {
    swapHelper: await swapHelper.getAddress(),

    minDepositAmount: 10n ** 18n / 100n, // 0.01 ETH
    maxDepositAmount: 10n ** 18n * 2n, // 2 ETH

    additionalLtvDistancePercent: 10,
    flags: 0,
    minRebalancePercent: 10 // 1.5%
  };

  await deltaNeutralDollar.initialize(
    true,
    8,
    "DND",
    "Stratnest",
    await stableToken.getAddress(),
    await mainToken.getAddress(),
    await balancerVaultEmulator.getAddress(),
    await addressProvider.getAddress(),
    settings
  );

  await mainToken.approve(await deltaNeutralDollar.getAddress(), 2n ** 256n - 1n);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
