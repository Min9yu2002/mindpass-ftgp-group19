require("dotenv").config();
require("@nomicfoundation/hardhat-toolbox");

const alchemySepoliaUrl = process.env.ALCHEMY_SEPOLIA_URL || "";
const privateKey = process.env.PRIVATE_KEY || "";

/** @type {import("hardhat/config").HardhatUserConfig} */
module.exports = {
  solidity: "0.8.20",
  networks: {
    sepolia: {
      // Empty string keeps config parsing safe when .env is incomplete.
      url: alchemySepoliaUrl,
      // Only include the deployer key when it is actually configured.
      accounts: privateKey ? [privateKey] : [],
    },
  },
};
