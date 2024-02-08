async function main() {
  const Contract = await ethers.getContractFactory('TestToken');
  const contract = await Contract.deploy(process.env.SYMBOL, process.env.DECIMALS);
  await contract.waitForDeployment();
  console.log("Deployed at:", await contract.getAddress());
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
