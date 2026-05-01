import { ethers } from "hardhat";

/**
 * Deploys the full Hive stack and wires the contracts together.
 *
 * Order matters:
 *   1. HiveToken      — needs treasury address
 *   2. HiveStaking    — needs HIVE
 *   3. HiveRewards    — needs HIVE
 *   4. NectarVault    — needs HIVE
 *   5. Wire-up        — set rewards on staking, set staking+vault on rewards,
 *                       set rewards on vault, set rewardsPool on token.
 *
 * Mainnet checklist before running:
 *   - PRIVATE_KEY + RPC_URL exported
 *   - TREASURY env var set to a multisig you control
 *   - INITIAL_SUPPLY set (default 100M HIVE)
 */
async function main() {
  const [deployer] = await ethers.getSigners();
  const treasury = process.env.TREASURY ?? deployer.address;
  const initialSupply = ethers.parseUnits(process.env.INITIAL_SUPPLY ?? "100000000", 18);

  console.log("Deployer:", deployer.address);
  console.log("Treasury:", treasury);
  console.log("Initial supply:", ethers.formatUnits(initialSupply, 18), "HIVE");

  const HiveToken = await ethers.getContractFactory("HiveToken");
  const hive = await HiveToken.deploy(deployer.address, treasury, initialSupply);
  await hive.waitForDeployment();
  console.log("HiveToken:", await hive.getAddress());

  const HiveStaking = await ethers.getContractFactory("HiveStaking");
  const staking = await HiveStaking.deploy(deployer.address, await hive.getAddress());
  await staking.waitForDeployment();
  console.log("HiveStaking:", await staking.getAddress());

  const HiveRewards = await ethers.getContractFactory("HiveRewards");
  const rewards = await HiveRewards.deploy(deployer.address, await hive.getAddress());
  await rewards.waitForDeployment();
  console.log("HiveRewards:", await rewards.getAddress());

  const NectarVault = await ethers.getContractFactory("NectarVault");
  const vault = await NectarVault.deploy(deployer.address, await hive.getAddress());
  await vault.waitForDeployment();
  console.log("NectarVault:", await vault.getAddress());

  console.log("\nWiring contracts...");
  await (await staking.setRewards(await rewards.getAddress())).wait();
  await (await rewards.setStaking(await staking.getAddress())).wait();
  await (await rewards.setVault(await vault.getAddress())).wait();
  await (await vault.setRewards(await rewards.getAddress())).wait();
  await (await hive.setRewardsPool(await rewards.getAddress())).wait();

  console.log("\n✅ Hive stack deployed and wired.");
  console.log("Next steps:");
  console.log("  1. Fund the LP (scripts/seedLiquidity.ts)");
  console.log("  2. setTaxedPair(<UniswapV2Pair>, true) on HiveToken once the pool exists");
  console.log("  3. setTaxEnabled(true) when ready to flip tax on");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
