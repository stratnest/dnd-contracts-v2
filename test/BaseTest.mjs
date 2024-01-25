import chai from 'chai';
import withinPercent from '../utils/chai-percent.js';
import { takeSnapshot, setBalance } from '@nomicfoundation/hardhat-network-helpers';

const ONE_ETHER = 1n * 10n ** 18n;
chai.use(withinPercent);
const expect = chai.expect;

describe("BaseTest", function() {
  let snapshot, initialSnapshot;

  const WETH_ADDRESS = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';
  const WETH_SPONSOR_ADDRESS = '0xF04a5cC80B1E94C69B48f5ee68a08CD2F09A7c3E';

  const DAI_ADDRESS = '0x6B175474E89094C44Da98b954EedeAC495271d0F';
  const DAI_SPONSOR_ADDRESS = '0x075e72a5eDf65F0A5f44699c7654C1a76941Ddc8';

  const BLAST_ADDRESS = '0x5F6AE08B8AeB7078cf2F96AFb089D7c9f51DA47d';

  let myAccount, ownerAccount, impersonatorWeth, impersonatorDai;

  let weth, dai, blast;

  let base;

  before(async () => {
    initialSnapshot = await takeSnapshot();

    [ myAccount, ownerAccount ] = await hre.ethers.getSigners();

    const Base = await ethers.getContractFactory('Base');
    base = await Base.deploy();
    await base.waitForDeployment();

    await base.initialize(
      BLAST_ADDRESS,
      WETH_ADDRESS
    );

    [ dai, weth, blast ] = await Promise.all([
      ethers.getContractAt('IERC20Metadata', DAI_ADDRESS),
      ethers.getContractAt('IERC20Metadata', WETH_ADDRESS),
      ethers.getContractAt('ILaunchBridge', BLAST_ADDRESS),
    ]);

    [ impersonatorDai, impersonatorWeth ] = await Promise.all([
      ethers.getImpersonatedSigner(DAI_SPONSOR_ADDRESS),
      ethers.getImpersonatedSigner(WETH_SPONSOR_ADDRESS)
    ]);

    await Promise.all([
      await base.transferOwnership(ownerAccount.address),

      await setBalance(impersonatorDai.address, ONE_ETHER),
      await setBalance(impersonatorWeth.address, ONE_ETHER)
    ]);

    snapshot = await takeSnapshot();
  });

  after(async () => initialSnapshot.restore());

  afterEach("Revert snapshot after test", async () => {
    await snapshot.restore();
    snapshot = await takeSnapshot();
  });

  it("deposit weth", async () => {
    await weth.connect(impersonatorWeth).transfer(await base.getAddress(), ONE_ETHER * 2n);
    await expect(weth.balanceOf(await base.getAddress())).to.eventually.equal(ONE_ETHER * 2n);

    await base.deposit();
    await expect(weth.balanceOf(await base.getAddress())).to.eventually.equal(0);

    const balance = await blast.balanceOf(await base.getAddress());
    expect(balance.ethBalance).to.be.withinPercent(ONE_ETHER * 2n, 0.1);
    expect(balance.usdBalance).to.be.eq(0);
  });

  it("deposit dai", async () => {
    await dai.connect(impersonatorDai).transfer(await base.getAddress(), ONE_ETHER * 100n);
    await expect(dai.balanceOf(await base.getAddress())).to.eventually.equal(ONE_ETHER * 100n);

    await base.deposit();
    await expect(dai.balanceOf(await base.getAddress())).to.eventually.equal(0);

    const balance = await blast.balanceOf(await base.getAddress());
    expect(balance.ethBalance).to.be.eq(0);
    expect(balance.usdBalance).to.be.withinPercent(ONE_ETHER * 100n, 0.1);
  });

  it("deposit eth", async () => {
    await setBalance(await base.getAddress(), ONE_ETHER),
    await base.deposit();
    await expect(ethers.provider.getBalance(await base.getAddress())).to.eventually.equal(0);

    const balance = await blast.balanceOf(await base.getAddress());
    expect(balance.ethBalance).to.be.withinPercent(ONE_ETHER, 0.1);
    expect(balance.usdBalance).to.be.eq(0);
  });
});
