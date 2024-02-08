import chai from 'chai';
import withinPercent from '../utils/chai-percent.js';
import { takeSnapshot, setBalance } from '@nomicfoundation/hardhat-network-helpers';

const ONE_ETHER = 1n * 10n ** 18n;
chai.use(withinPercent);
const expect = chai.expect;

const WETH_OPTIMISM = '0x4200000000000000000000000000000000000006';
const WETH_ARBITRUM = '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1';
const WETH_POLYGON = '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619';
const WETH_BASE = '0x4200000000000000000000000000000000000006';

const WETH_SPONSOR_OPTIMISM = '0xc4d4500326981eacD020e20A81b1c479c161c7EF';
const WETH_SPONSOR_ARBITRUM = '0x0dF5dfd95966753f01cb80E76dc20EA958238C46';
const WETH_SPONSOR_POLYGON = '0xF25212E676D1F7F89Cd72fFEe66158f541246445';
const WETH_SPONSOR_BASE = '0x46e6b214b524310239732d51387075e0e70970bf';

const DAI_OPTIMISM = '0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1';
const DAI_ARBITRUM = '0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1';
const DAI_POLYGON = '0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063';
const DAI_BASE = '0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb';

const DAI_SPONSOR_OPTIMISM = '0x1eED63EfBA5f81D95bfe37d82C8E736b974F477b';
const DAI_SPONSOR_ARBITRUM = '0xd85E038593d7A098614721EaE955EC2022B9B91B';
const DAI_SPONSOR_POLYGON = '0x4aac95EBE2eA6038982566741d1860556e265F8B';
const DAI_SPONSOR_BASE = '0xb864BA2aab1f53BC3af7AE49a318202dD3fd54C2';

const USDT_ARBITRUM = '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9';
const USDT_SPONSOR_ARBITRUM = '0xF977814e90dA44bFA03b6295A0616a897441aceC';

const CONNEXT_OPTIMISM = '0x8f7492DE823025b4CfaAB1D34c58963F2af5DEDA';
const CONNEXT_ARBITRUM = '0xEE9deC2712cCE65174B561151701Bf54b99C24C8';
const CONNEXT_POLYGON = '0x11984dc4465481512eb5b777E44061C158CF2259';

const CHAIN_OPTIMISM = 'optimism';
const CHAIN_ARBITRUM = 'arbitrum';
const CHAIN_POLYGON = 'polygon';
const CHAIN_BASE = 'base';

describe("CollectorTest", function() {
  let snapshot, initialSnapshot;

  let currentChain;

  let wethSponsorAddress, daiSponsorAddress, usdtSponsorAddress;
  let myAccount, ownerAccount, impersonatorWeth, impersonatorDai, impersonatorUsdt

  let wethAddress, daiAddress, usdtAddress;
  let weth, dai, usdt;

  let collector;
  let connextAddress;

  async function detectChain() {
    const [ optimismCode, arbitrumCode, baseCode ] = await Promise.all([
      ethers.provider.getCode(WETH_OPTIMISM),
      ethers.provider.getCode(WETH_ARBITRUM),
      ethers.provider.getCode(WETH_BASE)
    ]);

    if (optimismCode.length > 2) {
      currentChain = CHAIN_OPTIMISM;
      wethAddress = WETH_OPTIMISM;
      wethSponsorAddress = WETH_SPONSOR_OPTIMISM;
      daiAddress = DAI_OPTIMISM;
      daiSponsorAddress = DAI_SPONSOR_OPTIMISM;
      connextAddress = CONNEXT_OPTIMISM;
      return;
    }

    if (arbitrumCode.length > 2) {
      currentChain = CHAIN_ARBITRUM;
      wethAddress = WETH_ARBITRUM;
      wethSponsorAddress = WETH_SPONSOR_ARBITRUM;
      daiAddress = DAI_ARBITRUM;
      daiSponsorAddress = DAI_SPONSOR_ARBITRUM;
      usdtAddress = USDT_ARBITRUM;
      usdtSponsorAddress = USDT_SPONSOR_ARBITRUM;
      connextAddress = CONNEXT_ARBITRUM;
      return;
    }

    if (baseCode.length > 2) {
      currentChain = CHAIN_BASE;
      wethAddress = WETH_BASE;
      wethSponsorAddress = WETH_SPONSOR_BASE;
      daiAddress = USDBC_BASE;
      daiSponsorAddress = DAI_SPONSOR_BASE;
      return;
    }

    currentChain = CHAIN_POLYGON;
    wethAddress = WETH_POLYGON;
    wethSponsorAddress = WETH_SPONSOR_POLYGON;
    daiAddress = DAI_POLYGON;
    daiSponsorAddress = DAI_SPONSOR_POLYGON;
    connextAddress = CONNEXT_POLYGON;
  }

  before(async () => {
    await detectChain();
    console.log(`Running on ${currentChain}`);

    initialSnapshot = await takeSnapshot();

    [ myAccount, ownerAccount ] = await hre.ethers.getSigners();

    [ dai, weth, usdt ] = await Promise.all([
      ethers.getContractAt('IERC20Metadata', daiAddress),
      ethers.getContractAt('IERC20Metadata', wethAddress),
      ethers.getContractAt('IERC20Metadata', usdtAddress)
    ]);

    const Collector = await ethers.getContractFactory('Collector');
    collector = await Collector.deploy(
      connextAddress,
      [
        daiAddress,
        wethAddress
        // usdtAddress
      ]
    );
    await collector.waitForDeployment();

    await collector.setBase(CONNEXT_ARBITRUM);

    impersonatorDai = await ethers.getImpersonatedSigner(daiSponsorAddress);
    impersonatorWeth = await ethers.getImpersonatedSigner(wethSponsorAddress);
    impersonatorUsdt = await ethers.getImpersonatedSigner(usdtSponsorAddress);

    await Promise.all([
      await collector.transferOwnership(ownerAccount.address),

      await setBalance(impersonatorDai.address, ONE_ETHER),
      await setBalance(impersonatorWeth.address, ONE_ETHER),
      await setBalance(impersonatorUsdt.address, ONE_ETHER),

      dai.approve(await collector.getAddress(), 2n ** 256n - 1n),
      weth.approve(await collector.getAddress(), 2n ** 256n - 1n),
      usdt.approve(await collector.getAddress(), 2n ** 256n - 1n),
    ]);

    snapshot = await takeSnapshot();
  });

  after(async () => initialSnapshot.restore());

  afterEach("Revert snapshot after test", async () => {
    await snapshot.restore();
    snapshot = await takeSnapshot();
  });

  const FEE = 20000000000000000n;

  it("deposit and push weth", async () => {
    await weth.connect(impersonatorWeth).transfer(myAccount.address, ONE_ETHER * 2n);
    await weth.transfer(await collector.getAddress(), ONE_ETHER / 2n);

    await collector.push(await weth.getAddress(), FEE, { value: FEE * 2n });
    await expect(weth.balanceOf(await collector.getAddress())).to.eventually.equal(0);
  });

  it("deposit and push dai", async () => {
    const ONE_THOUSAND_DAI = 1000n * 10n ** 6n;
    await dai.connect(impersonatorDai).transfer(myAccount.address, ONE_THOUSAND_DAI),
    await dai.transfer(await collector.getAddress(), ONE_THOUSAND_DAI);

    await collector.push(await dai.getAddress(), FEE, { value: FEE * 2n });
    await expect(dai.balanceOf(await collector.getAddress())).to.eventually.equal(0);
  });

  it("cannot push usdt", async () => {
    const ONE_THOUSAND_USDT = 1000n * 10n ** 6n;
    await usdt.connect(impersonatorUsdt).transfer(myAccount.address, ONE_THOUSAND_USDT),
    await usdt.transfer(await collector.getAddress(), ONE_THOUSAND_USDT);

    await expect(collector.push(await usdt.getAddress(), FEE, { value: FEE * 2n })).to.be.revertedWith('token is not allowed');
  });

  it("cannot push when base is set to zero address", async () => {
    await collector.connect(ownerAccount).setBase(ethers.ZeroAddress);

    const ONE_THOUSAND_DAI = 1000n * 10n ** 6n;
    await dai.connect(impersonatorDai).transfer(myAccount.address, ONE_THOUSAND_DAI),
    await dai.transfer(await collector.getAddress(), ONE_THOUSAND_DAI);

    await expect(collector.push(await dai.getAddress(), FEE, { value: FEE * 2n })).to.be.revertedWith('base is not set');
  });

  it("only owner can call admin methods", async () => {
    await expect(collector.setBase(ethers.ZeroAddress)).to.be.revertedWithCustomError(collector, 'OwnableUnauthorizedAccount');
    await expect(collector.setSlippage(0)).to.be.revertedWithCustomError(collector, 'OwnableUnauthorizedAccount');
    await expect(collector.rescue(await usdt.getAddress(), myAccount.address)).to.be.revertedWithCustomError(collector, 'OwnableUnauthorizedAccount');
  });

  it("tokens can be rescued", async () => {
    const ONE_THOUSAND_DAI = 1000n * 10n ** 6n;
    await dai.connect(impersonatorDai).transfer(myAccount.address, ONE_THOUSAND_DAI),
    await dai.transfer(await collector.getAddress(), ONE_THOUSAND_DAI);
    await expect(dai.balanceOf(myAccount.address)).to.eventually.equal(0);
    await collector.connect(ownerAccount).rescue(await dai.getAddress(), myAccount.address);
    await expect(dai.balanceOf(myAccount.address)).to.eventually.equal(ONE_THOUSAND_DAI);
  });
});
