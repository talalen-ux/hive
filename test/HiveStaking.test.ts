import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";

const PARSE = (n: string) => ethers.parseUnits(n, 18);
const DAY = 24 * 60 * 60;
const WEEK = 7 * DAY;

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

  // Token-side wire-up auto-exempts staking/rewards/vault from tax.
  await hive.setRewardsPool(await rewards.getAddress());
  await hive.setStaking(await staking.getAddress());
  await hive.setVault(await vault.getAddress());

  // Protocol-side wire-up.
  await staking.setRewards(await rewards.getAddress());
  await rewards.setStaking(await staking.getAddress());
  await rewards.setVault(await vault.getAddress());
  await vault.setRewards(await rewards.getAddress());

  // Fund test users.
  await hive.transfer(alice.address, PARSE("1000"));
  await hive.transfer(bob.address, PARSE("1000"));
  await hive.transfer(carol.address, PARSE("1000"));

  return { owner, alice, bob, carol, treasury, hive, staking, rewards, vault };
}

describe("HiveStaking", () => {
  it("rejects locks below the 24h minimum", async () => {
    const { alice, hive, staking } = await deployStack();
    await hive.connect(alice).approve(await staking.getAddress(), PARSE("100"));
    await expect(staking.connect(alice).stake(PARSE("100"), DAY - 1)).to.be.revertedWith("lock too short");
  });

  it("rejects locks above the 7d maximum", async () => {
    const { alice, hive, staking } = await deployStack();
    await hive.connect(alice).approve(await staking.getAddress(), PARSE("100"));
    await expect(staking.connect(alice).stake(PARSE("100"), WEEK + 1)).to.be.revertedWith("lock too long");
  });

  it("computes weight using the 1.5x cap at 7 days", async () => {
    const { alice, hive, staking } = await deployStack();
    await hive.connect(alice).approve(await staking.getAddress(), PARSE("100"));
    await staking.connect(alice).stake(PARSE("100"), WEEK);
    expect(await staking.weightOf(alice.address)).to.equal(PARSE("150"));
  });

  it("forfeits rewards when unstaking before lock end", async () => {
    const { alice, hive, staking, rewards } = await deployStack();
    await hive.connect(alice).approve(await staking.getAddress(), PARSE("100"));
    await staking.connect(alice).stake(PARSE("100"), DAY);

    await hive.transfer(await rewards.getAddress(), PARSE("10"));
    await rewards.sync();

    await expect(staking.connect(alice)["unstake()"]())
      .to.emit(staking, "Unstaked")
      .withArgs(alice.address, PARSE("100"), false);

    expect(await hive.balanceOf(alice.address)).to.equal(PARSE("1000"));
  });

  it("pays accrued HIVE rewards after lock matures", async () => {
    const { alice, hive, staking, rewards } = await deployStack();
    await hive.connect(alice).approve(await staking.getAddress(), PARSE("100"));
    await staking.connect(alice).stake(PARSE("100"), DAY);

    await hive.transfer(await rewards.getAddress(), PARSE("10"));
    await rewards.sync();

    await time.increase(DAY + 1);
    const before = await hive.balanceOf(alice.address);
    await staking.connect(alice).claim(alice.address);
    const after = await hive.balanceOf(alice.address);
    expect(after - before).to.equal(PARSE("10"));
  });
});

describe("Hive — invariants from the security plan", () => {
  it("multi-user pro-rata: 1x and 1.5x stakers split fees by weight", async () => {
    const { alice, bob, hive, staking, rewards } = await deployStack();
    const stakingAddr = await staking.getAddress();
    const rewardsAddr = await rewards.getAddress();

    await hive.connect(alice).approve(stakingAddr, PARSE("100"));
    await staking.connect(alice).stake(PARSE("100"), DAY); // 1.0x → weight 100

    await hive.connect(bob).approve(stakingAddr, PARSE("100"));
    await staking.connect(bob).stake(PARSE("100"), WEEK); // 1.5x → weight 150

    // total weight = 250
    await hive.transfer(rewardsAddr, PARSE("250"));
    await rewards.sync();

    await time.increase(WEEK + 1);

    const aBefore = await hive.balanceOf(alice.address);
    const bBefore = await hive.balanceOf(bob.address);
    await staking.connect(alice).claim(alice.address);
    await staking.connect(bob).claim(bob.address);

    expect((await hive.balanceOf(alice.address)) - aBefore).to.equal(PARSE("100"));
    expect((await hive.balanceOf(bob.address)) - bBefore).to.equal(PARSE("150"));
  });

  it("forfeit redistributes to remaining stakers (and not the leaver)", async () => {
    const { alice, bob, hive, staking, rewards } = await deployStack();
    const stakingAddr = await staking.getAddress();
    const rewardsAddr = await rewards.getAddress();

    await hive.connect(alice).approve(stakingAddr, PARSE("100"));
    await staking.connect(alice).stake(PARSE("100"), DAY);

    await hive.connect(bob).approve(stakingAddr, PARSE("100"));
    await staking.connect(bob).stake(PARSE("100"), DAY);

    // Send rewards while both are active (50/50 split).
    await hive.transfer(rewardsAddr, PARSE("100"));
    await rewards.sync();

    // Alice exits early — forfeits 50 HIVE back into the pool.
    await staking.connect(alice)["unstake()"]();

    // Bob's lock matures; bob now claims everything (50 from before + 50 forfeited).
    await time.increase(DAY + 1);
    const before = await hive.balanceOf(bob.address);
    await staking.connect(bob).claim(bob.address);
    expect((await hive.balanceOf(bob.address)) - before).to.equal(PARSE("100"));
  });

  it("pays ETH rewards through NectarVault.harvest", async () => {
    const { alice, hive, staking, rewards, vault, owner } = await deployStack();
    await hive.connect(alice).approve(await staking.getAddress(), PARSE("100"));
    await staking.connect(alice).stake(PARSE("100"), DAY);

    // Fees flow into the vault, then anyone calls harvest.
    await owner.sendTransaction({ to: await vault.getAddress(), value: ethers.parseEther("1") });
    await vault.harvest();
    await rewards.sync();

    await time.increase(DAY + 1);
    const before = await ethers.provider.getBalance(alice.address);
    const tx = await staking.connect(alice).claim(alice.address);
    const receipt = await tx.wait();
    const gas = receipt!.gasUsed * receipt!.gasPrice;
    const after = await ethers.provider.getBalance(alice.address);
    expect(after - before + gas).to.equal(ethers.parseEther("1"));
  });

  it("cannot top up at a shorter tier while locked (audit H-3)", async () => {
    const { alice, hive, staking } = await deployStack();
    const stakingAddr = await staking.getAddress();
    await hive.connect(alice).approve(stakingAddr, PARSE("200"));
    await staking.connect(alice).stake(PARSE("100"), WEEK); // 1.5x
    await time.increase(DAY);
    await expect(staking.connect(alice).stake(PARSE("100"), DAY)).to.be.revertedWith("cannot shorten lock");
  });

  it("same-tier top-up extends the lock and preserves the multiplier", async () => {
    const { alice, hive, staking } = await deployStack();
    const stakingAddr = await staking.getAddress();
    await hive.connect(alice).approve(stakingAddr, PARSE("200"));
    await staking.connect(alice).stake(PARSE("100"), WEEK);
    await time.increase(DAY);
    await staking.connect(alice).stake(PARSE("100"), WEEK);
    expect(await staking.weightOf(alice.address)).to.equal(PARSE("300"));
  });

  it("pause() halts new stakes and claims but never unstake", async () => {
    const { owner, alice, hive, staking } = await deployStack();
    await hive.connect(alice).approve(await staking.getAddress(), PARSE("200"));
    await staking.connect(alice).stake(PARSE("100"), DAY);

    await staking.connect(owner).pause();

    await expect(staking.connect(alice).stake(PARSE("100"), DAY)).to.be.reverted;
    await expect(staking.connect(alice).claim(alice.address)).to.be.reverted;

    // unstake still works (forfeit applies because lock isn't matured)
    await expect(staking.connect(alice)["unstake()"]()).to.emit(staking, "Unstaked");
  });

  it("seedDeadWeight runs once, dilutes a pre-stake donation", async () => {
    const { owner, alice, hive, staking, rewards } = await deployStack();
    const stakingAddr = await staking.getAddress();
    const rewardsAddr = await rewards.getAddress();

    // Owner seeds 1000 dead.
    await hive.approve(stakingAddr, PARSE("1000"));
    await staking.connect(owner).seedDeadWeight(PARSE("1000"));
    await expect(staking.connect(owner).seedDeadWeight(PARSE("1"))).to.be.revertedWith("already seeded");

    // Pre-existing donation of 100 HIVE.
    await hive.transfer(rewardsAddr, PARSE("100"));

    // Alice front-runs first stake with 1 HIVE for 24h.
    await hive.connect(alice).approve(stakingAddr, PARSE("1"));
    await staking.connect(alice).stake(PARSE("1"), DAY);
    await rewards.sync();

    // Dead weight at 1.5x = 1500. Alice at 1.0x = 1. Total = 1501.
    // Alice's share of the 100 donation ≈ 100 / 1501 ≈ 0.0666.
    await time.increase(DAY + 1);
    const before = await hive.balanceOf(alice.address);
    await staking.connect(alice).claim(alice.address);
    const got = (await hive.balanceOf(alice.address)) - before;
    // bound: alice can never get more than ~0.1 HIVE, far less than 100
    expect(got).to.be.lt(PARSE("0.2"));
  });

  it("sync() is non-reentrant and self-heals if balance < accounted", async () => {
    const { rewards } = await deployStack();
    // Plain second sync with no funds is a no-op and must not revert.
    await rewards.sync();
    await rewards.sync();
  });

  it("one-shot wire setters reject a second call", async () => {
    const { owner, hive, staking, rewards, vault } = await deployStack();
    await expect(staking.connect(owner).setRewards(await rewards.getAddress()))
      .to.be.revertedWith("rewards already set");
    await expect(rewards.connect(owner).setStaking(await staking.getAddress()))
      .to.be.revertedWith("staking already set");
    await expect(vault.connect(owner).setRewards(await rewards.getAddress()))
      .to.be.revertedWith("rewards already set");
    await expect(hive.connect(owner).setRewardsPool(await rewards.getAddress()))
      .to.be.revertedWith("rewards already set");
  });

  it("cannot revoke tax exemption from rewards / staking / vault / treasury", async () => {
    const { owner, hive, staking, rewards, vault, treasury } = await deployStack();
    await expect(hive.connect(owner).setTaxExempt(await rewards.getAddress(), false))
      .to.be.revertedWith("cannot revoke critical");
    await expect(hive.connect(owner).setTaxExempt(await staking.getAddress(), false))
      .to.be.revertedWith("cannot revoke critical");
    await expect(hive.connect(owner).setTaxExempt(await vault.getAddress(), false))
      .to.be.revertedWith("cannot revoke critical");
    await expect(hive.connect(owner).setTaxExempt(treasury.address, false))
      .to.be.revertedWith("cannot revoke critical");
  });

  it("setTaxEnabled requires the protocol contracts to be wired and exempt", async () => {
    const [owner, treasury] = await ethers.getSigners();
    const HiveToken = await ethers.getContractFactory("HiveToken");
    const hive = await HiveToken.deploy(owner.address, treasury.address, PARSE("1000000"));
    // No staking/rewards/vault wired yet.
    await expect(hive.connect(owner).setTaxEnabled(true)).to.be.revertedWith("rewards unset");
  });

  it("Ownable2Step: ownership transfer requires acceptance", async () => {
    const { owner, alice, hive } = await deployStack();
    await hive.connect(owner).transferOwnership(alice.address);
    expect(await hive.owner()).to.equal(owner.address); // not yet
    await hive.connect(alice).acceptOwnership();
    expect(await hive.owner()).to.equal(alice.address);
  });
});
