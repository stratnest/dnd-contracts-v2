async function main() {
  console.log("Preparing upgrade of", process.env.ADDRESS);

  let implementationAddress = await upgrades.erc1967.getImplementationAddress(process.env.ADDRESS);
  console.log("Original implementation address:", implementationAddress);

  const DeltaNeutralDollar2 = await ethers.getContractFactory('DeltaNeutralDollar2');
  const deltaNeutralDollar2 = await upgrades.upgradeProxy(process.env.ADDRESS, DeltaNeutralDollar2);
  await deltaNeutralDollar2.waitForDeployment();

  implementationAddress = await upgrades.erc1967.getImplementationAddress(process.env.ADDRESS);
  console.log("Upgraded implementation address:", implementationAddress);
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });

