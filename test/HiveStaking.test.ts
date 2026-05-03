import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";

const PARSE = (n: string) => ethers.parseUnits(n, 18);

async function deployStack() {
  const [owner, alice, bob, carol, treasury] = await ethers.getSigners();

  const HiveToken = await ethers.getContractFactory("HiveToken");
  const hive = await HiveToken.deploy(owner.address, treasury.address, PARSE("100000000"));

  const HiveStaking = await ethers.getContractFactory("HiveStaking");
  const staking = await HiveStaking.deploy(owner.address, await hive.getAddress());

  const HiveRewards = await ethers.getContractFactory("HiveRewards");
  const rewards = await HiveRewards.deploy(owner.address, await hive.getAddress());

  const NectarVault = await ethers.getContractFactory("NectarVault");
  const vault = await NectarVault.deploy(owner.address, await hive.getAddress());

  await hive.setRewardsPool(await rewards.getAddress());
  await hive.setStaking(await staking.getAddress());
  await hive.setVault(await vault.getAddress());

  await staking.setRewards(await rewards.getAddress());
  await rewards.setStaking(await staking.getAddress());
  await rewards.setVault(await vault.getAddress());
  await vault.setRewards(await rewards.getAddress());

  await hive.transfer(alice.address, PARSE("1000"));
  await hive.transfer(bob.address, PARSE("1000"));
  await hive.transfer(carol.address, PARSE("1000"));

  return { owner, alice, bob, carol, treasury, hive, staking, rewards, vault };
}

describe("HiveStaking — no-lock model", () => {
  it("any positive amount can be staked; weightOf == amount", async () => {
    const { alice, hive, staking } = await deployStack();
    await hive.connect(alice).approve(await staking.getAddress(), PARSE("100"));
    await staking.connect(alice).stake(PARSE("100"));
    expect(await staking.weightOf(alice.address)).to.equal(PARSE("100"));
  });

  it("rejects amount = 0", async () => {
    const { alice, staking } = await deployStack();
    await expect(staking.connect(alice).stake(0))
      .to.be.revertedWithCustomError(staking, "AmountZero");
  });

  it("partial unstake reduces stake by exactly the requested amount", async () => {
    const { alice, hive, staking } = await deployStack();
    const stakingAddr = await staking.getAddress();
    await hive.connect(alice).approve(stakingAddr, PARSE("500"));
    await staking.connect(alice).stake(PARSE("500"));

    await staking.connect(alice).unstake(PARSE("200"));
    expect(await staking.weightOf(alice.address)).to.equal(PARSE("300"));
    expect(await hive.balanceOf(alice.address)).to.equal(PARSE("700")); // 1000 - 500 + 200
  });

  it("unstakeAll exits the full position", async () => {
    const { alice, hive, staking } = await deployStack();
    const stakingAddr = await staking.getAddress();
    await hive.connect(alice).approve(stakingAddr, PARSE("500"));
    await staking.connect(alice).stake(PARSE("500"));
    await staking.connect(alice).unstakeAll();
    expect(await staking.weightOf(alice.address)).to.equal(0n);
    expect(await hive.balanceOf(alice.address)).to.equal(PARSE("1000"));
  });

  it("topping up an existing stake keeps firstStakeAt; full exit resets it", async () => {
    const { alice, hive, staking } = await deployStack();
    const stakingAddr = await staking.getAddress();
    await hive.connect(alice).approve(stakingAddr, PARSE("400"));
    await staking.connect(alice).stake(PARSE("100"));
    const firstAt = await staking.firstStakeAt(alice.address);
    expect(firstAt).to.be.gt(0n);
    await time.increase(60);
    await staking.connect(alice).stake(PARSE("100"));
    expect(await staking.firstStakeAt(alice.address)).to.equal(firstAt); // preserved
    await staking.connect(alice).unstakeAll();
    expect(await staking.firstStakeAt(alice.address)).to.equal(0n);
    await staking.connect(alice).stake(PARSE("100"));
    expect(await staking.firstStakeAt(alice.address)).to.be.gt(firstAt);
  });

  it("cannot unstake more than staked", async () => {
    const { alice, hive, staking } = await deployStack();
    const stakingAddr = await staking.getAddress();
    await hive.connect(alice).approve(stakingAddr, PARSE("100"));
    await staking.connect(alice).stake(PARSE("100"));
    await expect(staking.connect(alice).unstake(PARSE("101")))
      .to.be.revertedWithCustomError(staking, "InsufficientStake");
  });
});

describe("HiveRewards — launch-only distribution", () => {
  it("pays accrued HIVE rewards after a launch payout", async () => {
    const { owner, alice, hive, staking, rewards } = await deployStack();
    await hive.connect(alice).approve(await staking.getAddress(), PARSE("100"));
    await staking.connect(alice).stake(PARSE("100"));

    // multisig moves funds into the rewards contract and distributes
    await hive.transfer(await rewards.getAddress(), PARSE("10"));
    await rewards.connect(owner).distributeLaunchPool(PARSE("10"), 0);

    const before = await hive.balanceOf(alice.address);
    await staking.connect(alice).claim(alice.address);
    const after = await hive.balanceOf(alice.address);
    expect(after - before).to.equal(PARSE("10"));
  });

  it("multi-user pro-rata: 1:3 split by stake", async () => {
    const { owner, alice, bob, hive, staking, rewards } = await deployStack();
    const sa = await staking.getAddress();
    await hive.connect(alice).approve(sa, PARSE("100"));
    await staking.connect(alice).stake(PARSE("100"));
    await hive.connect(bob).approve(sa, PARSE("300"));
    await staking.connect(bob).stake(PARSE("300"));

    await hive.transfer(await rewards.getAddress(), PARSE("400"));
    await rewards.connect(owner).distributeLaunchPool(PARSE("400"), 0);

    const aB = await hive.balanceOf(alice.address);
    const bB = await hive.balanceOf(bob.address);
    await staking.connect(alice).claim(alice.address);
    await staking.connect(bob).claim(bob.address);

    expect((await hive.balanceOf(alice.address)) - aB).to.equal(PARSE("100"));
    expect((await hive.balanceOf(bob.address)) - bB).to.equal(PARSE("300"));
  });

  it("post-distribute stakers do not back-claim previous payouts", async () => {
    const { owner, alice, bob, hive, staking, rewards } = await deployStack();
    const sa = await staking.getAddress();
    await hive.connect(alice).approve(sa, PARSE("100"));
    await staking.connect(alice).stake(PARSE("100"));

    await hive.transfer(await rewards.getAddress(), PARSE("100"));
    await rewards.connect(owner).distributeLaunchPool(PARSE("100"), 0);

    // bob arrives AFTER the distribute — should not get a slice
    await hive.connect(bob).approve(sa, PARSE("100"));
    await staking.connect(bob).stake(PARSE("100"));

    const bB = await hive.balanceOf(bob.address);
    await staking.connect(bob).claim(bob.address);
    expect((await hive.balanceOf(bob.address)) - bB).to.equal(0n);
  });

  it("distributeLaunchPool reverts if asked to release more than the pending pool", async () => {
    const { owner, alice, hive, staking, rewards } = await deployStack();
    await hive.connect(alice).approve(await staking.getAddress(), PARSE("100"));
    await staking.connect(alice).stake(PARSE("100"));
    await hive.transfer(await rewards.getAddress(), PARSE("10"));
    await expect(rewards.connect(owner).distributeLaunchPool(PARSE("11"), 0))
      .to.be.revertedWithCustomError(rewards, "InsufficientPending");
  });

  it("distributeLaunchPool reverts when no stakers exist", async () => {
    const { owner, hive, rewards } = await deployStack();
    await hive.transfer(await rewards.getAddress(), PARSE("10"));
    await expect(rewards.connect(owner).distributeLaunchPool(PARSE("10"), 0))
      .to.be.revertedWithCustomError(rewards, "AmountZero"); // totalW==0 path
  });

  it("ETH distribution flows through NectarVault.harvest + distributeLaunchPool", async () => {
    const { owner, alice, hive, staking, rewards, vault } = await deployStack();
    await hive.connect(alice).approve(await staking.getAddress(), PARSE("100"));
    await staking.connect(alice).stake(PARSE("100"));

    await owner.sendTransaction({ to: await vault.getAddress(), value: ethers.parseEther("1") });
    await vault.harvest();
    await rewards.connect(owner).distributeLaunchPool(0, ethers.parseEther("1"));

    const before = await ethers.provider.getBalance(alice.address);
    const tx = await staking.connect(alice).claim(alice.address);
    const receipt = await tx.wait();
    const gas = receipt!.gasUsed * receipt!.gasPrice;
    const after = await ethers.provider.getBalance(alice.address);
    expect(after - before + gas).to.equal(ethers.parseEther("1"));
  });
});

describe("HiveStaking — admin + dead-seed", () => {
  it("seedDeadWeight runs once", async () => {
    const { owner, hive, staking } = await deployStack();
    const stakingAddr = await staking.getAddress();
    await hive.approve(stakingAddr, PARSE("1000"));
    await staking.connect(owner).seedDeadWeight(PARSE("1000"));
    await expect(staking.connect(owner).seedDeadWeight(PARSE("1")))
      .to.be.revertedWithCustomError(staking, "AlreadySeeded");
    expect(await staking.totalStaked()).to.equal(PARSE("1000"));
    expect(await staking.effectiveWeighted()).to.equal(0n);
  });

  it("Ownable2Step + one-shot setRewards/setGovernor", async () => {
    const { owner, alice, hive, staking, rewards } = await deployStack();
    await expect(staking.connect(owner).setRewards(await rewards.getAddress()))
      .to.be.revertedWithCustomError(staking, "RewardsAlreadySet");
    await expect(staking.connect(owner).setGovernor(alice.address))
      .to.not.be.reverted;
    await expect(staking.connect(owner).setGovernor(alice.address))
      .to.be.revertedWithCustomError(staking, "GovernorAlreadySet");
  });

  it("NectarVault.harvest no-ops cleanly when nothing pending", async () => {
    const { vault } = await deployStack();
    await expect(vault.harvest()).to.not.emit(vault, "Harvested");
  });
});
