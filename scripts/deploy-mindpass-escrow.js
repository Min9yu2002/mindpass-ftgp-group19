require("dotenv").config();
const hre = require("hardhat");

async function main() {
  const subsidyTreasury = process.env.SUBSIDY_TREASURY_ADDRESS;
  const protocolTreasury = process.env.PROTOCOL_TREASURY_ADDRESS;

  if (!subsidyTreasury) {
    throw new Error("Missing SUBSIDY_TREASURY_ADDRESS in .env");
  }

  if (!protocolTreasury) {
    throw new Error("Missing PROTOCOL_TREASURY_ADDRESS in .env");
  }

  const MindPassEscrow = await hre.ethers.getContractFactory("MindPassEscrow");
  const escrow = await MindPassEscrow.deploy(subsidyTreasury, protocolTreasury);
  await escrow.waitForDeployment();

  const deployedAddress = await escrow.getAddress();

  console.log("MindPassEscrow deployed to:", deployedAddress);
  console.log("SUBSIDY_TREASURY_ADDRESS:", subsidyTreasury);
  console.log("PROTOCOL_TREASURY_ADDRESS:", protocolTreasury);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});