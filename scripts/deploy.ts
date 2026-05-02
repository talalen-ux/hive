import { ethers } from "hardhat";

/**
 * Deploys the full Hive stack and wires the contracts together.
 *
 * Order matters:
 *   1. HiveToken      — needs treasury address
 *   2. HiveStaking    — needs HIVE
 *   3. HiveRewards    — needs HIVE
 *   4. NectarVault    — needs HIVE
 *   5. Tax-exempt staking/rewards/vault on the token (defence-in-depth so a
 *      future setTaxEnabled(true) cannot drain the protocol contracts).
 *   6. Wire one-shot setters: rewards on staking, staking+vault on rewards,
 *      rewards on vault, rewardsPool/staking/vault on token.
 *   7. Seed dead weight on staking (MINIMUM_LIQUIDITY pattern; defeats the
 *      first-staker donation sandwich on the rewards accumulator).
 *
 * Mainnet checklist before running:
 *   - PRIVATE_KEY + RPC_URL exported
 *   - TREASURY env var = 24h-timelocked multisig you control
 *   - INITIAL_SUPPLY (default 100M HIVE)
 *   - DEAD_SEED HIVE units (default 1000)
 *   - ORACLE (default deployer) — EOA authorised to create governor
 *     proposals/tasks; the AI generator backend will rotate into this role.
 *
 * After this script:
 *   - Seed Uniswap V2 liquidity (scripts/seedLiquidity.ts)
 *   - setTaxedPair(<UniswapV2Pair>, true) on HiveToken once the pool exists
 *   - setTaxEnabled(true) when ready to flip tax on
 *   - transferOwnership(timelock) on each contract; multisig calls
 *     acceptOwnership() (Ownable2Step)
 */
async function main() {
  const [deployer] = await ethers.getSigners();
  const treasury = process.env.TREASURY ?? deployer.address;
  const initialSupply = ethers.parseUnits(process.env.INITIAL_SUPPLY ?? "100000000", 18);
  const deadSeed = ethers.parseUnits(process.env.DEAD_SEED ?? "1000", 18);
  const oracle = process.env.ORACLE ?? deployer.address;

  console.log("Deployer:", deployer.address);
  console.log("Treasury:", treasury);
  console.log("Oracle:  ", oracle);
  console.log("Initial supply:", ethers.formatUnits(initialSupply, 18), "HIVE");
  console.log("Dead seed:    ", ethers.formatUnits(deadSeed, 18), "HIVE");

  const HiveToken = await ethers.getContractFactory("HiveToken");
  const hive = await HiveToken.deploy(deployer.address, treasury, initialSupply);
  await hive.waitForDeployment();
  const hiveAddr = await hive.getAddress();
  console.log("HiveToken:  ", hiveAddr);

  const HiveStaking = await ethers.getContractFactory("HiveStaking");
  const staking = await HiveStaking.deploy(deployer.address, hiveAddr);
  await staking.waitForDeployment();
  const stakingAddr = await staking.getAddress();
  console.log("HiveStaking:", stakingAddr);

  const HiveRewards = await ethers.getContractFactory("HiveRewards");
  const rewards = await HiveRewards.deploy(deployer.address, hiveAddr);
  await rewards.waitForDeployment();
  const rewardsAddr = await rewards.getAddress();
  console.log("HiveRewards:", rewardsAddr);

  const NectarVault = await ethers.getContractFactory("NectarVault");
  const vault = await NectarVault.deploy(deployer.address, hiveAddr);
  await vault.waitForDeployment();
  const vaultAddr = await vault.getAddress();
  console.log("NectarVault:", vaultAddr);

  console.log("\nWiring contracts (one-shot setters)...");
  // Token-side wire-up. setRewardsPool / setStaking / setVault auto-exempt
  // their argument from tax — see HiveToken.
  await (await hive.setRewardsPool(rewardsAddr)).wait();
  await (await hive.setStaking(stakingAddr)).wait();
  await (await hive.setVault(vaultAddr)).wait();

  // Wire the protocol contracts together.
  await (await staking.setRewards(rewardsAddr)).wait();
  await (await rewards.setStaking(stakingAddr)).wait();
  await (await rewards.setVault(vaultAddr)).wait();
  await (await vault.setRewards(rewardsAddr)).wait();

  console.log("Seeding dead weight...");
  await (await hive.approve(stakingAddr, deadSeed)).wait();
  await (await staking.seedDeadWeight(deadSeed)).wait();

  const HiveGovernor = await ethers.getContractFactory("HiveGovernor");
  const governor = await HiveGovernor.deploy(deployer.address, stakingAddr, oracle);
  await governor.waitForDeployment();
  const governorAddr = await governor.getAddress();
  console.log("HiveGovernor:", governorAddr);

  console.log("\n✅ Hive stack deployed and wired.");
  console.log("Next steps:");
  console.log("  1. scripts/seedLiquidity.ts — fund the Uniswap V2 pool");
  console.log("  2. hive.setTaxedPair(<pair>, true)");
  console.log("  3. hive.setTaxEnabled(true)");
  console.log("  4. transferOwnership(timelock) on hive/staking/rewards/vault");
  console.log("  5. timelock-multisig acceptOwnership() on each (Ownable2Step)");
  console.log("\nFrontend env vars to set:");
  const network = await ethers.provider.getNetwork();
  const suffix = network.chainId === 1n ? "MAINNET" : "SEPOLIA";
  console.log(`  NEXT_PUBLIC_HIVE_${suffix}=${hiveAddr}`);
  console.log(`  NEXT_PUBLIC_STAKING_${suffix}=${stakingAddr}`);
  console.log(`  NEXT_PUBLIC_REWARDS_${suffix}=${rewardsAddr}`);
  console.log(`  NEXT_PUBLIC_VAULT_${suffix}=${vaultAddr}`);
  console.log(`  NEXT_PUBLIC_GOVERNOR_${suffix}=${governorAddr}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
