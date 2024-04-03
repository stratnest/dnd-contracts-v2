import chai from 'chai';
import { takeSnapshot, setBalance } from '@nomicfoundation/hardhat-network-helpers';
import { deal } from 'hardhat-deal';
import chalk from 'chalk';
import withinPercent from '../utils/chai-percent.js';

const ONE_ETHER = 1n * 10n ** 18n;

chai.use(withinPercent);
const expect = chai.expect;

const BALANCER_VAULT = '0xBA12222222228d8Ba445958a75a0704d566BF2C8'; // optimism, arbitrum, polygon and base

const AAVE_ADDRESSES_PROVIDER_OPTIMISM_ARBITRUM_POLYGON = '0xa97684ead0e402dC232d5A977953DF7ECBaB3CDb';
const AAVE_ADDRESSES_PROVIDER_BASE = '0xe20fCBdBfFC4Dd138cE8b2E6FBb6CB49777ad64D';

const WSTETH_OPTIMISM = '0x1F32b1c2345538c0c6f582fCB022739c4A194Ebb';
const WSTETH_ARBITRUM = '0x5979D7b546E38E414F7E9822514be443A4800529';
const WSTETH_POLYGON = '0x03b54A6e9a984069379fae1a4fC4dBAE93B3bCCD';
const CBETH_BASE = '0x2Ae3F1Ec7F1F5012CFEab0185bfc7aa3cf0DEc22';

const WETH_OPTIMISM = '0x4200000000000000000000000000000000000006';
const WETH_ARBITRUM = '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1';
const WETH_POLYGON = '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619';
const WETH_BASE = '0x4200000000000000000000000000000000000006';

const USDC_OPTIMISM = '0x7F5c764cBc14f9669B88837ca1490cCa17c31607';
const USDCE_ARBITRUM = '0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8';
const USDC_POLYGON = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174';
const USDBC_BASE = '0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA';

const CHAIN_OPTIMISM = 'optimism';
const CHAIN_ARBITRUM = 'arbitrum';
const CHAIN_POLYGON = 'polygon';
const CHAIN_BASE = 'base';
const CHAIN_LOCAL = 'local';

const FLAGS_DEPOSIT_PAUSED  = 1 << 1;
const FLAGS_WITHDRAW_PAUSED = 1 << 2;

const ERROR_OPERATION_DISABLED_BY_FLAGS = 'DND-01';
const ERROR_ONLY_FLASHLOAN_LENDER = 'DND-02';
const ERROR_INCORRECT_FLASHLOAN_TOKEN_RECEIVED = 'DND-03';
const ERROR_UNKNOWN_FLASHLOAN_MODE = 'DND-04';
const ERROR_INCORRECT_DEPOSIT_OR_WITHDRAWAL_AMOUNT = 'DND-05';
const ERROR_CONTRACT_NOT_READY_FOR_WITHDRAWAL = 'DND-06';
const ERROR_POSITION_CLOSED = 'DND-07';
const ERROR_POSITION_UNCHANGED = 'DND-08';
const ERROR_IMPOSSIBLE_MODE = 'DND-09';

describe("DeltaNeutralDollar2", function() {
  let snapshot, initialSnapshot;

  let currentChain;

  let myAccount, secondAccount, ownerAccount, liquidatorAccount;

  let mainTokenAddress, stableTokenAddress;
  let stableToken, mainToken;
  let aaveAddressesProvider;

  let deltaNeutralDollar;
  let swapHelper;
  let aavePool;
  let aaveOracle;

  let mainTokenPrice;
  let stableTokenPrice;

  let wethTokenAddress;
  let usdcAToken;

  async function detectChain() {
    const [ optimismCode, arbitrumCode, baseCode, polygonCode ] = await Promise.all([
      ethers.provider.getCode(WSTETH_OPTIMISM),
      ethers.provider.getCode(WSTETH_ARBITRUM),
      ethers.provider.getCode(CBETH_BASE),
      ethers.provider.getCode(WSTETH_POLYGON)
    ]);

    if (optimismCode.length > 2) {
      currentChain = CHAIN_OPTIMISM;
      mainTokenAddress = WSTETH_OPTIMISM;
      stableTokenAddress = USDC_OPTIMISM;
      aaveAddressesProvider = AAVE_ADDRESSES_PROVIDER_OPTIMISM_ARBITRUM_POLYGON;
      wethTokenAddress = WETH_OPTIMISM;
      return;
    }

    if (arbitrumCode.length > 2) {
      currentChain = CHAIN_ARBITRUM;
      mainTokenAddress = WSTETH_ARBITRUM;
      stableTokenAddress = USDCE_ARBITRUM;
      aaveAddressesProvider = AAVE_ADDRESSES_PROVIDER_OPTIMISM_ARBITRUM_POLYGON;
      wethTokenAddress = WETH_ARBITRUM;
      return;
    }

    if (baseCode.length > 2) {
      currentChain = CHAIN_BASE;
      mainTokenAddress = CBETH_BASE;
      stableTokenAddress = USDBC_BASE;
      aaveAddressesProvider = AAVE_ADDRESSES_PROVIDER_BASE;
      wethTokenAddress = WETH_BASE;
      return;
    }

    if (polygonCode.length > 2) {
      currentChain = CHAIN_POLYGON;
      mainTokenAddress = WSTETH_POLYGON;
      stableTokenAddress = USDC_POLYGON;
      aaveAddressesProvider = AAVE_ADDRESSES_PROVIDER_OPTIMISM_ARBITRUM_POLYGON;
      wethTokenAddress = WETH_POLYGON;
    }

    currentChain = CHAIN_LOCAL;
  }

  before(async () => {
    await detectChain();
    console.log(`Running on ${currentChain}`);

    initialSnapshot = await takeSnapshot();

    [ myAccount, secondAccount, ownerAccount, liquidatorAccount ] = await hre.ethers.getSigners();

    const DeltaNeutralDollar = await ethers.getContractFactory('DeltaNeutralDollar2');
    // to test proxies:
    deltaNeutralDollar = await upgrades.deployProxy(DeltaNeutralDollar, [], { initializer: false, kind: 'uups' });

    // to test direct deployment
    // deltaNeutralDollar = await DeltaNeutralDollar.deploy();

    let addressProvider;

    if (currentChain == CHAIN_LOCAL) {
      const TestToken = await ethers.getContractFactory('TestToken');

      stableToken = await TestToken.deploy('STABLE', 6);
      await stableToken.waitForDeployment();
      stableToken.address = await stableToken.getAddress();

      mainToken = await TestToken.deploy('MAIN', 18);
      await mainToken.waitForDeployment();
      mainToken.address = await mainToken.getAddress();

      const AddressProvider = await ethers.getContractFactory('PoolAddressesProviderEmulator');
      addressProvider = await AddressProvider.deploy();
      await addressProvider.waitForDeployment();

      const PoolEmulator = await ethers.getContractFactory('PoolEmulator');
      aavePool = await PoolEmulator.deploy(await addressProvider.getAddress());
      await aavePool.waitForDeployment();

      await getMainToken(aavePool, 1000n * ONE_ETHER);
      await getStableToken(aavePool, 1000n * 2000n * 10n ** 6n);

      await addressProvider.setAddress(0, await aavePool.getAddress());

      const AaveOracleEmulator = await ethers.getContractFactory('AaveOracleEmulator');
      aaveOracle = await AaveOracleEmulator.deploy(
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

      const SwapHelper = await ethers.getContractFactory('SwapHelperEmulatorMintBurn');
      swapHelper = await SwapHelper.deploy(await mainToken.getAddress(), await aaveOracle.getAddress());
      await swapHelper.waitForDeployment();

    } else {
      stableToken = await ethers.getContractAt('IERC20Metadata', stableTokenAddress);
      stableToken.address = await stableToken.getAddress();

      mainToken = await ethers.getContractAt('IERC20Metadata', mainTokenAddress);
      mainToken.address = await mainToken.getAddress();

      addressProvider = await ethers.getContractAt('IPoolAddressesProvider', aaveAddressesProvider);
      aavePool = await ethers.getContractAt('IPool', await addressProvider.getPool());

      const MockAaveOracle = await ethers.getContractFactory('MockAaveOracle');
      aaveOracle = await MockAaveOracle.deploy(await addressProvider.getPriceOracle());
      await aaveOracle.waitForDeployment();

      const addressProviderOwner = await (await ethers.getContractAt('OwnableUpgradeable', await addressProvider.getAddress())).owner();
      const impersonatorOwner = await ethers.getImpersonatedSigner(addressProviderOwner);
      await setBalance(await impersonatorOwner.getAddress(), ONE_ETHER);
      await addressProvider.connect(impersonatorOwner).setPriceOracle(await aaveOracle.getAddress());

      await aaveOracle.setOverridePrice(await mainToken.getAddress(), 2000n * 10n ** 8n);

      const SwapHelper = await ethers.getContractFactory('SwapHelperEmulatorCustodian');
      swapHelper = await SwapHelper.deploy(await mainToken.getAddress(), wethTokenAddress, await addressProvider.getAddress());
      await swapHelper.waitForDeployment();

      await getMainToken(swapHelper, ONE_ETHER * 20n);
      await getStableToken(swapHelper, 1_000_000n * 10n ** 6n);
    }

    mainTokenPrice = await aaveOracle.getAssetPrice(await mainToken.getAddress());
    stableTokenPrice = await aaveOracle.getAssetPrice(await stableToken.getAddress());

    let balancerVaultAddress = BALANCER_VAULT;

    if (currentChain == CHAIN_LOCAL) {
      const BalancerVaultEmulator = await ethers.getContractFactory('BalancerVaultEmulator');
      const balancerVaultEmulator = await BalancerVaultEmulator.deploy();
      await balancerVaultEmulator.waitForDeployment();

      balancerVaultAddress = await balancerVaultEmulator.getAddress();

      await Promise.all([
        getMainToken(balancerVaultEmulator, 100n * 10n**18n),
        getStableToken(balancerVaultEmulator, 1_000_000n * 10n**6n)
      ]);
    }

    await deltaNeutralDollar.initialize(
      currentChain == CHAIN_LOCAL,
      8,
      "DND",
      "Delta Neutral Dividend",
      await stableToken.getAddress(),
      await mainToken.getAddress(),
      balancerVaultAddress,
      await addressProvider.getAddress()
    );

    await deltaNeutralDollar.setSettings(
      await swapHelper.getAddress(),

      10n ** 18n / 100n, // minDepositAmount
      10n ** 18n * 2n, // maxDepositAmount

      10, // additionalLtvDistancePercent
      0, // flags
      10 // 1.0%, minRebalancePercent
    );

    await deltaNeutralDollar.transferOwnership(ownerAccount.address);

    await Promise.all([
      mainToken.approve(await deltaNeutralDollar.getAddress(), 2n ** 256n - 1n),
      getMainToken(myAccount, ONE_ETHER * 2n),

      // prepare liquidatorAccount
      getMainToken(liquidatorAccount, 10n * ONE_ETHER),

      stableToken.connect(liquidatorAccount).approve(await aavePool.getAddress(), 2n ** 256n - 1n),
      mainToken.connect(liquidatorAccount).approve(await aavePool.getAddress(), 2n ** 256n - 1n)
    ]);

    snapshot = await takeSnapshot();
  });

  after(async () => initialSnapshot.restore());

  afterEach("Revert snapshot after test", async () => {
    await snapshot.restore();
    snapshot = await takeSnapshot();
  });

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
    if (currentChain == CHAIN_LOCAL) {
      await mainToken.mintTo(await getAddressOfTarget(target), amount);
    } else {
      await deal(mainToken.address, await getAddressOfTarget(target), amount);
    }
  }

  async function getStableToken(target, amount) {
    if (currentChain == CHAIN_LOCAL) {
      await stableToken.mintTo(await getAddressOfTarget(target), amount);
    } else {
      await deal(stableToken.address, await getAddressOfTarget(target), amount);
    }
  }

  function formatBaseInUSDC(v, usdcPrice) {
    const baseValue = parseFloat(ethers.formatUnits(v, 8)).toFixed(2);

    if (usdcPrice >= 99000000n && usdcPrice <= 1_0100_0000n) {
      return chalk.yellow(baseValue);
    }

    const usdValue = parseFloat(ethers.formatUnits(v * 10n ** 8n / usdcPrice, 8)).toFixed(2);

    return chalk.yellow(baseValue) + ' aka ' + chalk.yellow(usdValue) + ' USDC';
  }

  function formatDecimals(v, d) {
    if (v >= BigInt(Number.MAX_SAFE_INTEGER) * 10n ** BigInt(d)) {
      return '∞';
    }

    return parseFloat(ethers.formatUnits(v, d));
  }

  async function loadAaveTokensForDisplay() {
    // won't work for aave emulator!!
    const poolDataProvider = await ethers.getContractAt('IPoolDataProvider', await addressProvider.getPoolDataProvider());

    let reserveTokenAddresses = await poolDataProvider.getReserveTokensAddresses(mainToken.getAddress());
    wstethVariableDebtToken = await ethers.getContractAt('IERC20Metadata', reserveTokenAddresses.variableDebtTokenAddress);

    reserveTokenAddresses = await poolDataProvider.getReserveTokensAddresses(await stableToken.getAddress());
    usdcAToken = await ethers.getContractAt('IERC20Metadata', reserveTokenAddresses.aTokenAddress);
  }

  async function log(title, originalWstethPrice, address) {
    if (currentChain !== CHAIN_LOCAL && !usdcAToken) {
      await loadAaveTokensForDisplay();
    }

    address ||= await deltaNeutralDollar.getAddress();

    console.log();
    console.log("=== %s ===", title);

    const userData = await aavePool.getUserAccountData(address);

    const wstethPrice = await aaveOracle.getAssetPrice(await mainToken.getAddress());
    const usdcPrice = await aaveOracle.getAssetPrice(await stableToken.getAddress());
    const netBase = userData.totalCollateralBase - userData.totalDebtBase;

    const ethPriceDiff = Number(wstethPrice - originalWstethPrice) / Number(originalWstethPrice) * 100;

    console.log('                  eth price', formatBaseInUSDC(wstethPrice, usdcPrice), chalk.blue(ethPriceDiff.toFixed(1)) + '%');
    console.log();

    const formattedHealthFactor = formatDecimals(userData.healthFactor, 18);
    const healthFactorString = '               healthFactor ' + formattedHealthFactor;

    if (userData.healthFactor <= ONE_ETHER / 100n * 101n) {
      console.log(chalk.red(healthFactorString));
    } else {
      console.log(healthFactorString);
    }

    console.log();
    console.log('       availableBorrowsBase', formatBaseInUSDC(userData.availableBorrowsBase, usdcPrice));
    console.log('        totalCollateralBase', formatBaseInUSDC(userData.totalCollateralBase, usdcPrice));
    // console.log('            totalCollateral', formatDecimals(await usdcAToken.balanceOf(await deltaNeutralDollar.getAddress()), 6), 'USDC');
    console.log('              totalDebtBase', formatBaseInUSDC(userData.totalDebtBase, usdcPrice));
    // console.log('                  totalDebt', formatDecimals(await wstethVariableDebtToken.balanceOf(await deltaNeutralDollar.getAddress()), 18), 'ETH');
    console.log('                    netBase', formatBaseInUSDC(netBase, usdcPrice));

    const wstethBalance = await mainToken.balanceOf(address);
    const wstethBalanceBase = wstethPrice * wstethBalance / ONE_ETHER;
    console.log('             wsteth balance', formatDecimals(wstethBalance, 18), 'ETH aka', formatBaseInUSDC(wstethBalanceBase, usdcPrice));

    const usdcBalanceOfBase = (await stableToken.balanceOf(await deltaNeutralDollar.getAddress())) * 10n ** 2n;
    if (usdcBalanceOfBase > 0n) {
      console.log('               usdc balance', chalk.blue(formatBaseInUSDC(usdcBalanceOfBase, usdcPrice)));
    }

    const totalBase = wstethBalanceBase + netBase + usdcBalanceOfBase;
    console.log(chalk.bold('                      total', chalk.blue(formatBaseInUSDC(totalBase, usdcPrice))));

    const diffToOriginalEthPrice = Number(totalBase - originalWstethPrice) / Number(originalWstethPrice) * 100;
    console.log('       diff to original eth', chalk.blue(diffToOriginalEthPrice.toFixed(1)) + '%');
    console.log();
  }

  async function liquidate(address, collateral, debt) {
    const userData = await aavePool.getUserAccountData(address);
    if (userData.healthFactor > 1n * 10n ** 18n) {
      console.log("=== Failed to liquidate as health factor >= 1 ===");
      console.log();
      return false;
    }

    await getStableToken(liquidatorAccount, 7000n * 10n ** 6n);

    collateral ||= mainToken;
    debt ||= stableToken;

    const tr = await (await aavePool.connect(liquidatorAccount).liquidationCall(
      await collateral.getAddress(),
      await debt.getAddress(),
      address,
      2n ** 256n - 1n,
      false
    )).wait();

    const liquidationCallArgs = tr.logs.find(e => e.eventName == 'LiquidationCall').args.toObject();

    console.log();
    console.log("=== Liquidated ===");

    console.log(`    liquidation debtToCover`, ethers.formatUnits(liquidationCallArgs.debtToCover, await debt.decimals()), await debt.symbol());
    console.log(` liquidatedCollateralAmount`, ethers.formatUnits(liquidationCallArgs.liquidatedCollateralAmount, await collateral.decimals()), await collateral.symbol());

    return true;
  }

  it("open position in mainToken", async () => {
    await deltaNeutralDollar.deposit(ONE_ETHER);

    expect(await deltaNeutralDollar.balanceOf(myAccount.address)).to.be.withinPercent(mainTokenPrice, 1);
    expect(await deltaNeutralDollar.totalBalanceBase()).to.be.withinPercent(mainTokenPrice, 1);

    let diff = await deltaNeutralDollar.calculateRequiredPositionChange();

    expect(diff.toObject()).to.deep.equal({ collateralChangeBase: 0n, debtChangeBase: 0n });
  });

  it("eth price down", async () => {
    await deltaNeutralDollar.deposit(ONE_ETHER);

    await aaveOracle.setOverridePrice(await mainToken.getAddress(), mainTokenPrice / 100n * 93n);

    expect(await deltaNeutralDollar.balanceOf(myAccount.address)).to.be.withinPercent(mainTokenPrice, 1);

    let diff = await deltaNeutralDollar.calculateRequiredPositionChange();
    expect(diff.debtChangeBase).to.be.gt(0);
    expect(diff.collateralChangeBase).to.be.eq(0);

    await deltaNeutralDollar.rebalance();

    expect(await deltaNeutralDollar.balanceOf(myAccount.address)).to.be.withinPercent(mainTokenPrice, 1);

    diff = await deltaNeutralDollar.calculateRequiredPositionChange();
    expect(diff.toObject()).to.deep.equal({ collateralChangeBase: 0n, debtChangeBase: 0n });
  });

  it("eth price up", async () => {
    await deltaNeutralDollar.deposit(ONE_ETHER);

    await aaveOracle.setOverridePrice(await mainToken.getAddress(), mainTokenPrice / 100n * 103n);

    expect(await deltaNeutralDollar.balanceOf(myAccount.address)).to.be.withinPercent(mainTokenPrice, 1);

    let diff = await deltaNeutralDollar.calculateRequiredPositionChange();
    expect(diff.debtChangeBase).to.be.lt(0);
    expect(diff.collateralChangeBase).to.be.eq(0);

    await deltaNeutralDollar.rebalance();

    expect(await deltaNeutralDollar.balanceOf(myAccount.address)).to.be.withinPercent(mainTokenPrice, 1);

    diff = await deltaNeutralDollar.calculateRequiredPositionChange();
    expect(diff.toObject()).to.deep.equal({ collateralChangeBase: 0n, debtChangeBase: 0n });
  });

  it("eth price up then price down", async () => {
    await deltaNeutralDollar.deposit(ONE_ETHER);

    await aaveOracle.setOverridePrice(await mainToken.getAddress(), mainTokenPrice / 100n * 103n);

    expect(await deltaNeutralDollar.balanceOf(myAccount.address)).to.be.withinPercent(mainTokenPrice, 1);

    await deltaNeutralDollar.rebalance();
    expect(await deltaNeutralDollar.balanceOf(myAccount.address)).to.be.withinPercent(mainTokenPrice, 1);

    await aaveOracle.setOverridePrice(await mainToken.getAddress(), mainTokenPrice / 100n * 97n);

    await deltaNeutralDollar.rebalance();
    expect(await deltaNeutralDollar.balanceOf(myAccount.address)).to.be.withinPercent(mainTokenPrice, 1);
    expect(await deltaNeutralDollar.totalBalanceBase()).to.be.withinPercent(mainTokenPrice, 1);
  });

  it("eth price down 2x stepwise", async () => {
    await deltaNeutralDollar.deposit(ONE_ETHER);

    for (let percent = 93; percent >= 51; percent -= 7) {
      console.log(`eth price at ${percent}%`);
      await aaveOracle.setOverridePrice(await mainToken.getAddress(), mainTokenPrice / 100n * BigInt(percent));
      await deltaNeutralDollar.rebalance();
      expect(await deltaNeutralDollar.balanceOf(myAccount.address)).to.be.withinPercent(mainTokenPrice, 1);
    }

    await deltaNeutralDollar.connect(ownerAccount).closePosition();

    const mainTokenPriceAtTheEnd = await aaveOracle.getAssetPrice(await mainToken.getAddress());
    const balance = await mainToken.balanceOf(await deltaNeutralDollar.getAddress());
    const balanceInBase = balance * mainTokenPriceAtTheEnd / 10n**18n;

    expect(balanceInBase).to.be.withinPercent(mainTokenPrice, 1.1);
  });

  it("eth price up 2x stepwise", async () => {
    await deltaNeutralDollar.deposit(ONE_ETHER);

    for (let percent = 107; percent <= 198; percent += 7) {
      console.log(`eth price at ${percent}%`);
      await aaveOracle.setOverridePrice(await mainToken.getAddress(), mainTokenPrice / 100n * BigInt(percent));
      await deltaNeutralDollar.rebalance();
      expect(await deltaNeutralDollar.balanceOf(myAccount.address)).to.be.withinPercent(mainTokenPrice, 1);
    }

    await deltaNeutralDollar.connect(ownerAccount).closePosition();

    const mainTokenPriceAtTheEnd = await aaveOracle.getAssetPrice(await mainToken.getAddress());
    const balance = await mainToken.balanceOf(await deltaNeutralDollar.getAddress());
    const balanceInBase = balance * mainTokenPriceAtTheEnd / 10n**18n;

    expect(balanceInBase).to.be.withinPercent(mainTokenPrice, 1.1);
  });

  it("deposit twice", async () => {
    await deltaNeutralDollar.deposit(ONE_ETHER);
    await deltaNeutralDollar.deposit(ONE_ETHER);

    expect(await deltaNeutralDollar.balanceOf(myAccount.address)).to.be.withinPercent(mainTokenPrice * 2n, 2);
    expect(await deltaNeutralDollar.totalBalanceBase()).to.be.withinPercent(mainTokenPrice * 2n, 1);

    let diff = await deltaNeutralDollar.calculateRequiredPositionChange();
    expect(diff.toObject()).to.deep.equal({ collateralChangeBase: 0n, debtChangeBase: 0n });
  });

  it("deposit twice with a huge price change between deposits", async () => {
    await deltaNeutralDollar.deposit(ONE_ETHER);

    await aaveOracle.setOverridePrice(await mainToken.getAddress(), mainTokenPrice / 100n * 96n);

    await deltaNeutralDollar.rebalance();

    await getMainToken(myAccount, ONE_ETHER * 3n);

    await deltaNeutralDollar.deposit(ONE_ETHER * 2n);

    const expectedBalanceBase = mainTokenPrice + (mainTokenPrice * 2n / 100n * 96n); // three eth, out of which two are deposited on diff price

    expect(await deltaNeutralDollar.balanceOf(myAccount.address)).to.be.withinPercent(expectedBalanceBase, 1);

    expect(await deltaNeutralDollar.totalBalanceBase()).to.be.withinPercent(expectedBalanceBase, 1);

    let diff = await deltaNeutralDollar.calculateRequiredPositionChange();
    expect(diff.toObject()).to.deep.equal({ collateralChangeBase: 0n, debtChangeBase: 0n });
  });

  // FIXME
  it.skip("withdraw almost everything", async () => {
    await deltaNeutralDollar.deposit(ONE_ETHER);

    // burn to zero
    await mainToken.transfer(liquidatorAccount.address, await mainToken.balanceOf(myAccount.address));

    const myBalanceBefore = await deltaNeutralDollar.balanceOf(myAccount.address);
    await deltaNeutralDollar.withdraw(myBalanceBefore / 100n * 75n);

    let diff = await deltaNeutralDollar.calculateRequiredPositionChange();
    expect(diff.toObject()).to.deep.equal({ collateralChangeBase: 0n, debtChangeBase: 0n });

    // about 75% has been withdrawn, so 25% must be left.
    expect(await deltaNeutralDollar.balanceOf(myAccount.address)).to.be.withinPercent(myBalanceBefore / 100n * 25n, 2);
    expect(await deltaNeutralDollar.totalBalanceBase()).to.be.withinPercent(myBalanceBefore / 100n * 25n, 2);
    expect(await deltaNeutralDollar.totalSupply()).to.be.withinPercent(myBalanceBefore / 100n * 25n, 2); // because for a single user it's the same as totalBalance
    expect(await mainToken.balanceOf(myAccount.address)).to.be.withinPercent(ONE_ETHER / 100n * 75n, 2);
  });

  it("withdraw must emit events", async () => {
    await deltaNeutralDollar.deposit(ONE_ETHER);

    const myBalanceBefore = await deltaNeutralDollar.balanceOf(myAccount.address);
    await deltaNeutralDollar.withdraw(myBalanceBefore / 4n);

    function quarterOfEth(x) {
      const QUARTER = ONE_ETHER / 4n;
      return x >= QUARTER / 100n * 98n && x <= QUARTER / 100n * 102n;
    }

    function quarterOfBalance(x) {
      const referenceValue = myBalanceBefore / 4n;
      return x >= referenceValue / 100n * 98n && x <= referenceValue / 100n * 102n;
    }

    await expect(deltaNeutralDollar.withdraw(myBalanceBefore / 4n)).to.emit(deltaNeutralDollar, 'PositionWithdraw')
      .withArgs(myBalanceBefore / 4n, quarterOfBalance, quarterOfEth, myAccount.address);
  });

  it("deposit must emit events", async () => {
    function correctBaseAmount(x) {
      return x >= (mainTokenPrice / 100n * 98n) && x <= (mainTokenPrice / 100n * 102n);
    }

    await expect(deltaNeutralDollar.deposit(ONE_ETHER)).to.emit(deltaNeutralDollar, 'PositionDeposit')
      .withArgs(ONE_ETHER, correctBaseAmount, myAccount.address);
  });

  it("transfer tokens", async () => {
    await deltaNeutralDollar.deposit(ONE_ETHER);
    await deltaNeutralDollar.transfer(secondAccount.address, await deltaNeutralDollar.balanceOf(myAccount.address));

    // burn to zero
    await mainToken.connect(secondAccount).transfer(await swapHelper.getAddress(), await mainToken.balanceOf(secondAccount.address));

    const secondBalanceBefore = await deltaNeutralDollar.balanceOf(secondAccount.address);
    expect(secondBalanceBefore).to.be.withinPercent(mainTokenPrice, 1.1);

    await expect(deltaNeutralDollar.withdraw(1000000000)).to.be.revertedWith(ERROR_INCORRECT_DEPOSIT_OR_WITHDRAWAL_AMOUNT);

    await deltaNeutralDollar.connect(secondAccount).withdraw(secondBalanceBefore / 2n);

    expect(await mainToken.balanceOf(secondAccount.address)).to.be.withinPercent(ONE_ETHER / 2n, 1.1);
  });

  it("withdraw more than balance", async () => {
    await deltaNeutralDollar.deposit(ONE_ETHER);
    const myBalance = await deltaNeutralDollar.balanceOf(myAccount.address);
    await expect(deltaNeutralDollar.withdraw(myBalance + 1n)).to.be.revertedWith(ERROR_INCORRECT_DEPOSIT_OR_WITHDRAWAL_AMOUNT);
  });

  it("only owner can close position", async () => {
    await deltaNeutralDollar.deposit(ONE_ETHER);
    await expect(deltaNeutralDollar.closePosition()).to.be.to.be.revertedWithCustomError(deltaNeutralDollar, "OwnableUnauthorizedAccount");
  });

  it("only owner can set settings and mappings", async () => {
    await expect(deltaNeutralDollar.setSettings(
      ethers.ZeroAddress,

      0,
      10n ** 18n * 2n,

      0,
      0,
      0
    )).to.be.revertedWithCustomError(deltaNeutralDollar, "OwnableUnauthorizedAccount");
  });

  it("only owner can rescue tokens", async () => {
    await deltaNeutralDollar.deposit(ONE_ETHER);
    await expect(deltaNeutralDollar.rescue(await mainToken.getAddress(), myAccount.address)).to.be.revertedWithCustomError(deltaNeutralDollar, "OwnableUnauthorizedAccount");
  });

  it("caps are respected", async () => {
    await getMainToken(myAccount, ONE_ETHER * 3n + 1n);
    await expect(deltaNeutralDollar.deposit(ONE_ETHER * 3n + 1n)).to.be.revertedWith(ERROR_INCORRECT_DEPOSIT_OR_WITHDRAWAL_AMOUNT);
    await expect(deltaNeutralDollar.deposit(1n)).to.be.revertedWith(ERROR_INCORRECT_DEPOSIT_OR_WITHDRAWAL_AMOUNT);
  });

  it("cannot deposit when flags disabled", async () => {
    await deltaNeutralDollar.deposit(ONE_ETHER / 2n);

    await deltaNeutralDollar.connect(ownerAccount).setSettings(
      await deltaNeutralDollar.swapHelper(),
      0,
      10n ** 18n * 200n,
      10,
      FLAGS_DEPOSIT_PAUSED,
      10
    );

    await expect(deltaNeutralDollar.deposit(ONE_ETHER / 2n)).to.be.revertedWith(ERROR_OPERATION_DISABLED_BY_FLAGS);

    await deltaNeutralDollar.withdraw(await deltaNeutralDollar.balanceOf(myAccount.address) / 2n); // withdraw still allowed
  });

  it("cannot withdraw when flags disabled", async () => {
    await deltaNeutralDollar.deposit(ONE_ETHER / 2n);

    await deltaNeutralDollar.connect(ownerAccount).setSettings(
      await deltaNeutralDollar.swapHelper(),
      0,
      10n ** 18n * 200n,
      10,
      FLAGS_WITHDRAW_PAUSED,
      10
    );

    await expect(deltaNeutralDollar.withdraw(100)).to.be.revertedWith(ERROR_OPERATION_DISABLED_BY_FLAGS);

    await deltaNeutralDollar.deposit(ONE_ETHER / 2n); // deposit still allowed
  });

  it("close position with balance and emit event", async () => {
    await deltaNeutralDollar.deposit(ONE_ETHER);

    function aboutOneEther(x) {
      return x >= (ONE_ETHER / 100n * 98n) && x <= (ONE_ETHER / 100n * 102n);
    }

    await expect(deltaNeutralDollar.connect(ownerAccount).closePosition()).to.emit(deltaNeutralDollar, 'PositionClose').withArgs(aboutOneEther);
    expect(await mainToken.balanceOf(await deltaNeutralDollar.getAddress())).to.be.withinPercent(ONE_ETHER, 1.1);
  });

  it("close position with flash loan and emit event", async () => {
    await deltaNeutralDollar.deposit(ONE_ETHER);

    const before = await mainToken.balanceOf(myAccount.address);
    await deltaNeutralDollar.connect(ownerAccount).rescue(await mainToken.getAddress(), myAccount.address);
    const after = await mainToken.balanceOf(myAccount.address);
    const diff = after - before - (ONE_ETHER / 2n);

    // force balance less than debt
    await mainToken.transfer(await deltaNeutralDollar.getAddress(), diff);

    await expect(deltaNeutralDollar.connect(ownerAccount).closePosition()).to.emit(deltaNeutralDollar, 'PositionClose');

    await mainToken.transfer(await deltaNeutralDollar.getAddress(), ONE_ETHER / 2n);

    expect(await mainToken.balanceOf(await deltaNeutralDollar.getAddress())).to.be.withinPercent(ONE_ETHER, 1.1);
  });

  it("disallow deposit after close position", async () => {
    await deltaNeutralDollar.deposit(ONE_ETHER);
    await deltaNeutralDollar.connect(ownerAccount).closePosition();
    await expect(deltaNeutralDollar.deposit(ONE_ETHER)).to.be.revertedWith(ERROR_OPERATION_DISABLED_BY_FLAGS);
  });

  it("eth price down then close position", async () => {
    await deltaNeutralDollar.deposit(ONE_ETHER);

    await aaveOracle.setOverridePrice(await mainToken.getAddress(), mainTokenPrice / 100n * 96n);

    await deltaNeutralDollar.connect(ownerAccount).closePosition();

    expect(await mainToken.balanceOf(await deltaNeutralDollar.getAddress())).to.be.withinPercent(ONE_ETHER / 100n * 104n, 1);
  });

  it("does not rebalance in case of too small percent movement", async () => {
    await deltaNeutralDollar.deposit(ONE_ETHER);

    // mock 4% price difference
    await aaveOracle.setOverridePrice(await mainToken.getAddress(), mainTokenPrice / 100n * 96n);

    let diff = await deltaNeutralDollar.calculateRequiredPositionChange();
    expect(diff.debtChangeBase).to.be.gt(0);
    expect(diff.collateralChangeBase).to.be.eq(0);

    await deltaNeutralDollar.connect(ownerAccount).setSettings(
      await swapHelper.getAddress(),

      10n ** 18n / 100n, // minDepositAmount
      10n ** 18n * 2n, // maxDepositAmount

      10, // additionalLtvDistancePercent
      0, // flags
      41 // 1.0%, minRebalancePercent
    );

    diff = await deltaNeutralDollar.calculateRequiredPositionChange();
    expect(diff.debtChangeBase).to.be.eq(0);
    expect(diff.collateralChangeBase).to.be.eq(0);
  });

  it("eth price up then close position", async () => {
    await deltaNeutralDollar.deposit(ONE_ETHER);

    await aaveOracle.setOverridePrice(await mainToken.getAddress(), mainTokenPrice / 100n * 104n);

    await deltaNeutralDollar.connect(ownerAccount).closePosition();

    expect(await mainToken.balanceOf(await deltaNeutralDollar.getAddress())).to.be.withinPercent(ONE_ETHER / 100n * 96n, 1);
  });

  it("close position then withdraw", async () => {
    await deltaNeutralDollar.deposit(ONE_ETHER);

    // burn to zero
    await mainToken.transfer(liquidatorAccount.address, await mainToken.balanceOf(myAccount.address));

    await deltaNeutralDollar.connect(ownerAccount).closePosition();

    const myBalance = await deltaNeutralDollar.balanceOf(myAccount.address);
    await deltaNeutralDollar.withdraw(myBalance);

    expect(await mainToken.balanceOf(await deltaNeutralDollar.getAddress())).to.be.lt(10000000);
    expect(await mainToken.balanceOf(myAccount.address)).to.be.withinPercent(ONE_ETHER, 1.1);

    expect(await deltaNeutralDollar.totalSupply()).to.be.eq(0);
    expect(await deltaNeutralDollar.totalBalanceBase()).to.be.withinPercent(0, 0.1);
  });

  it("usdc price down", async () => {
    await deltaNeutralDollar.deposit(ONE_ETHER);

    await aaveOracle.setOverridePrice(await stableToken.getAddress(), stableTokenPrice / 100n * 97n);

    expect(await deltaNeutralDollar.balanceOf(myAccount.address)).to.be.withinPercent(mainTokenPrice, 1.1);

    let diff = await deltaNeutralDollar.calculateRequiredPositionChange();
    expect(diff.debtChangeBase).to.be.lt(0);
    expect(diff.collateralChangeBase).to.be.eq(0);

    await deltaNeutralDollar.rebalance();

    expect(await deltaNeutralDollar.balanceOf(myAccount.address)).to.be.withinPercent(mainTokenPrice, 1.1);

    diff = await deltaNeutralDollar.calculateRequiredPositionChange();
    expect(diff.toObject()).to.deep.equal({ collateralChangeBase: 0n, debtChangeBase: 0n });
  });

  it("basic liquidation test, no contracts", async function() {
    if (currentChain === CHAIN_LOCAL) {
      this.skip();
      return;
    }

    await stableToken.approve(await aavePool.getAddress(), 2n ** 256n - 1n);
    await getStableToken(myAccount, mainTokenPrice / 10n ** 2n * 2n); // usdc is 6 decimals, prices are 8 decimals
    await aavePool.supply(await stableToken.getAddress(), mainTokenPrice / 10n ** 2n * 2n, myAccount.address, 0);

    const { availableBorrowsBase } = await aavePool.getUserAccountData(myAccount.address);
    const borrowMainToken = availableBorrowsBase * 10n ** 18n / mainTokenPrice;

    await aavePool.borrow(await mainToken.getAddress(), borrowMainToken, 2, 0, myAccount.address);

    const userDataBefore = await aavePool.getUserAccountData(myAccount.address);

    await aaveOracle.setOverridePrice(await mainToken.getAddress(), mainTokenPrice / 100n * 108n);

    expect(await liquidate(myAccount.address, stableToken, mainToken)).to.be.true;

    const userDataAfter = await aavePool.getUserAccountData(myAccount.address);

    expect(userDataAfter.totalCollateralBase).to.be.lt(userDataBefore.totalCollateralBase);
    expect(userDataAfter.totalDebtBase).to.be.lt(userDataBefore.totalDebtBase);
  });

  it("eth price up then liquidation then close", async function() {
    if (currentChain === CHAIN_LOCAL) {
      this.skip();
      return;
    }

    await deltaNeutralDollar.deposit(ONE_ETHER);

    // burn to zero
    await mainToken.transfer(liquidatorAccount.address, await mainToken.balanceOf(myAccount.address));

    const baseBalanceBefore = await deltaNeutralDollar.balanceOf(myAccount.address);
    const totalBalanceBefore = await deltaNeutralDollar.totalBalanceBase();

    const higherMainTokenPrice = mainTokenPrice / 100n * 108n;

    await aaveOracle.setOverridePrice(await mainToken.getAddress(), higherMainTokenPrice);

    expect(await liquidate(await deltaNeutralDollar.getAddress(), stableToken, mainToken)).to.be.true;

    expect(await deltaNeutralDollar.balanceOf(myAccount.address)).to.be.withinPercent(baseBalanceBefore, 1);
    expect(await deltaNeutralDollar.totalBalanceBase()).to.be.withinPercent(totalBalanceBefore / 100n * 98n, 1); // two percent liquidation hit

    await deltaNeutralDollar.connect(ownerAccount).closePosition();

    expect(await mainToken.balanceOf(await deltaNeutralDollar.getAddress())).to.be.withinPercent(ONE_ETHER / 100n * 90n, 1); // 2% hit and 8% price difff
  });

  it("multiple users", async () => {
    await deltaNeutralDollar.deposit(ONE_ETHER);

    // burn to zero
    await mainToken.transfer(liquidatorAccount.address, await mainToken.balanceOf(myAccount.address));

    await mainToken.connect(secondAccount).approve(await deltaNeutralDollar.getAddress(), 2n ** 256n - 1n);

    await getMainToken(secondAccount, ONE_ETHER * 2n);

    await deltaNeutralDollar.connect(secondAccount).deposit(ONE_ETHER * 2n);

    const myBalanceAfterDeposit = await deltaNeutralDollar.balanceOf(myAccount.address);

    expect(myBalanceAfterDeposit).to.be.withinPercent(mainTokenPrice, 1.1);
    expect(await deltaNeutralDollar.balanceOf(secondAccount.address)).to.be.withinPercent(mainTokenPrice * 2n, 1.1);
    expect(await deltaNeutralDollar.totalBalanceBase()).to.be.withinPercent(mainTokenPrice * 3n, 1.1);

    const totalSupplyBefore = await deltaNeutralDollar.totalSupply();
    expect(totalSupplyBefore).to.be.withinPercent(mainTokenPrice * 3n, 1.1);

    const higherMainTokenPrice = mainTokenPrice / 100n * 103n;
    await aaveOracle.setOverridePrice(await mainToken.getAddress(), higherMainTokenPrice);

    expect(await deltaNeutralDollar.balanceOf(myAccount.address)).to.be.eq(myBalanceAfterDeposit);
    expect(await deltaNeutralDollar.balanceOf(secondAccount.address)).to.be.withinPercent(mainTokenPrice * 2n, 1.1);
    expect(await deltaNeutralDollar.totalBalanceBase()).to.be.withinPercent(mainTokenPrice * 3n, 1.1);
    expect(await deltaNeutralDollar.totalSupply()).to.be.eq(totalSupplyBefore);

    await deltaNeutralDollar.withdraw(myBalanceAfterDeposit);

    expect(await mainToken.balanceOf(myAccount.address)).to.be.withinPercent(ONE_ETHER / 100n * 97n, 1.1);

    expect(await deltaNeutralDollar.balanceOf(myAccount.address)).to.be.eq(0);
    expect(await deltaNeutralDollar.balanceOf(secondAccount.address)).to.be.withinPercent(mainTokenPrice * 2n, 1.1);
    expect(await deltaNeutralDollar.totalBalanceBase()).to.be.withinPercent(mainTokenPrice * 2n, 1.1);
    expect(await deltaNeutralDollar.totalSupply()).to.be.withinPercent(totalSupplyBefore / 3n * 2n, 1.1);
  });

  // FIXME for optimism, polygon and base
  // FIXME disabled because of mainTokenPriceReal
  it.skip("open position with real swap", async () => {
    const SWAP_HELPER_NAME_BY_CHAIN = {
      [CHAIN_ARBITRUM]: 'SwapHelperArbitrumOne',
      [CHAIN_OPTIMISM]: 'SwapHelperOptimisticEthereumUniswapV3',
      [CHAIN_POLYGON]: 'SwapHelperPolygonUniswapV3',
      [CHAIN_BASE]: 'SwapHelperBaseUniswapV3',
    };

    const SwapHelper = await ethers.getContractFactory(SWAP_HELPER_NAME_BY_CHAIN[currentChain]);
    const swapHelper = await SwapHelper.deploy();
    await swapHelper.waitForDeployment();

    const settings = (await deltaNeutralDollar.settings()).toObject();
    settings.swapHelper = await swapHelper.getAddress();

    await deltaNeutralDollar.connect(ownerAccount).setSettings(settings);

    await aaveOracle.setOverridePrice(await mainToken.getAddress(), wstethPriceReal);

    await deltaNeutralDollar.deposit(ONE_ETHER);

    expect(await deltaNeutralDollar.balanceOf(myAccount.address)).to.be.withinPercent(wstethPriceReal, 1);
    expect(await deltaNeutralDollar.totalBalanceBase()).to.be.withinPercent(wstethPriceReal, 1);

    let diff = await deltaNeutralDollar.calculateRequiredPositionChange();
    expect(diff.toObject()).to.deep.equal({ collateralChangeBase: 0n, debtChangeBase: 0n });
  });

  it("cannot be re-initialized", async () => {
    const settings = {
      swapHelper: '0x7F5c764cBc14f9669B88837ca1490cCa17c31607',
      minDepositAmount: 1,
      maxDepositAmount: 1,
      additionalLtvDistancePercent: 10,
      flags: 0,
      minRebalancePercent: 1
    };

    await expect(
      deltaNeutralDollar.initialize(
        true,
        8,
        "DNH",
        "Delta Neutral Dollar",
        '0xBA12222222228d8Ba445958a75a0704d566BF2C8', // doesn't matter
        '0xBA12222222228d8Ba445958a75a0704d566BF2C8', // doesn't matter
        '0xBA12222222228d8Ba445958a75a0704d566BF2C8', // doesn't matter
        '0xBA12222222228d8Ba445958a75a0704d566BF2C8', // doesn't matter
        settings
      )
    ).to.be.revertedWithCustomError(deltaNeutralDollar, 'InvalidInitialization');
  });

  it("only balancer vault can call flash loan", async () => {
    const tokens = [ await stableToken.getAddress() ];
    const amounts = [ 1 ];
    const feeAmounts = [ 0 ];
    const userData = ethers.encodeBytes32String('');

    await expect(deltaNeutralDollar.receiveFlashLoan(tokens, amounts, feeAmounts, userData)).to.be.revertedWith(ERROR_ONLY_FLASHLOAN_LENDER);
  });
});
