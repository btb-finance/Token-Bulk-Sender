import { ethers, run } from "hardhat";

async function main() {
  const larryTokenAddress = process.env.LARRY_TOKEN_ADDRESS;
  if (!larryTokenAddress) {
    throw new Error("Please set LARRY_TOKEN_ADDRESS in .env file");
  }
  
  console.log("Deploying LarryAirdrop contract...");
  console.log("Larry Token Address:", larryTokenAddress);

  const LarryAirdrop = await ethers.getContractFactory("LarryAirdrop");
  const airdrop = await LarryAirdrop.deploy(larryTokenAddress);

  console.log("LarryAirdrop deploying to:", airdrop.target);
  await airdrop.waitForDeployment();
  const airdropAddress = await airdrop.getAddress();
  console.log("LarryAirdrop deployed to:", airdropAddress);

  // Wait for a few block confirmations
  console.log("Waiting for block confirmations...");
  await ethers.provider.waitForTransaction(airdrop.deploymentTransaction()!.hash, 5);

  // Verify the contract
  console.log("Verifying contract on Optimistic Etherscan...");
  try {
    await run("verify:verify", {
      address: airdropAddress,
      constructorArguments: [larryTokenAddress],
    });
    console.log("Contract verified successfully");
  } catch (error: any) {
    if (error.message.includes("Already Verified")) {
      console.log("Contract already verified");
    } else {
      console.error("Error verifying contract:", error);
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
