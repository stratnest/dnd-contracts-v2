async function main() {
  const Contract = await ethers.getContractFactory('Collector');
  const contract = await Contract.deploy(
    '0x8f7492DE823025b4CfaAB1D34c58963F2af5DEDA',
    [
      '0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1',
      '0x4200000000000000000000000000000000000006'
    ]
  );
  await contract.waitForDeployment();
  console.log("Deployed at:", await contract.getAddress());
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
