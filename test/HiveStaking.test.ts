import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";

const PARSE = (n: string) => ethers.parseUnits(n, 18);
const DAY = 24 * 60 * 60;

async function deployStack() {
  const [owner, alice, bob, treasury] = await ethers.getSigners();

  const HiveToken = await ethers.getContractFactory("HiveToken");
  const hive = await HiveToken.deploy(owner.address, treasury.address, PARSE("100000000"));

  const HiveStaking = await ethers.getContractFactory("HiveStaking");
  const staking = await HiveStaking.deploy(owner.address, await hive.getAddress());

  const HiveRewards = await ethers.getContractFactory("HiveRewards");
  const rewards = await HiveRewards.deploy(owner.address, await hive.getAddress());

  const NectarVault = await ethers.getContractFactory("NectarVault");
  const vault = await NectarVault.deploy(owner.address, await hive.getAddress());

  await staking.setRewards(await rewards.getAddress());
  await rewards.setStaking(await staking.getAddress());
  await rewards.setVault(await vault.getAddress());
  await vault.setRewards(await rewards.getAddress());
  await hive.setRewardsPool(await rewards.getAddress());

  // fund alice & bob
  await hive.transfer(alice.address, PARSE("1000"));
  await hive.transfer(bob.address, PARSE("1000"));

  return { owner, alice, bob, treasury, hive, staking, rewards, vault };
}

describe("HiveStaking", () => {
  it("rejects locks below the 24h minimum", async () => {
    const { alice, hive, staking } = await deployStack();
    await hive.connect(alice).approve(await staking.getAddress(), PARSE("100"));
    await expect(staking.connect(alice).stake(PARSE("100"), DAY - 1)).to.be.revertedWith("lock too short");
  });

  it("computes weight using the 1.5x cap at 7 days", async () => {
    const { alice, hive, staking } = await deployStack();
    await hive.connect(alice).approve(await staking.getAddress(), PARSE("100"));
    await staking.connect(alice).stake(PARSE("100"), 7 * DAY);
    expect(await staking.weightOf(alice.address)).to.equal(PARSE("150"));
  });

  it("forfeits rewards when unstaking before lock end", async () => {
    const { alice, bob, hive, staking, rewards } = await deployStack();
    const stakingAddr = await staking.getAddress();
    const rewardsAddr = await rewards.getAddress();

    await hive.connect(alice).approve(stakingAddr, PARSE("100"));
    await staking.connect(alice).stake(PARSE("100"), DAY);

    // simulate fees arriving directly into rewards
    await hive.transfer(rewardsAddr, PARSE("10"));
    await rewards.sync();

    // alice bails immediately — earned=false, balance returned in full but rewards forfeited
    await expect(staking.connect(alice).unstake())
      .to.emit(staking, "Unstaked")
      .withArgs(alice.address, PARSE("100"), false);

    expect(await hive.balanceOf(alice.address)).to.equal(PARSE("1000"));
  });

  it("pays accrued HIVE rewards after lock matures", async () => {
    const { alice, hive, staking, rewards } = await deployStack();
    const stakingAddr = await staking.getAddress();
    const rewardsAddr = await rewards.getAddress();

    await hive.connect(alice).approve(stakingAddr, PARSE("100"));
    await staking.connect(alice).stake(PARSE("100"), DAY);

    await hive.transfer(rewardsAddr, PARSE("10"));
    await rewards.sync();

    await time.increase(DAY + 1);
    const before = await hive.balanceOf(alice.address);
    await staking.connect(alice).claim(alice.address);
    const after = await hive.balanceOf(alice.address);
    expect(after - before).to.equal(PARSE("10"));
  });
});
