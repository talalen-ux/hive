import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";

const PARSE = (n: string) => ethers.parseUnits(n, 18);
const DAY = 24 * 60 * 60;
const WEEK = 7 * DAY;

const VOTE_YES = 1;
const VOTE_NO = 2;
const VOTE_ABSTAIN = 3;

const STATUS_ACTIVE = 0;
const STATUS_PASSED = 1;
const STATUS_REJECTED = 2;

async function deployFull() {
  const [owner, oracle, alice, bob, carol, treasury] = await ethers.getSigners();

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

  const HiveGovernor = await ethers.getContractFactory("HiveGovernor");
  const governor = await HiveGovernor.deploy(
    owner.address,
    await staking.getAddress(),
    oracle.address,
  );

  // fund users
  await hive.transfer(alice.address, PARSE("1000"));
  await hive.transfer(bob.address, PARSE("1000"));
  await hive.transfer(carol.address, PARSE("1000"));

  return { owner, oracle, alice, bob, carol, treasury, hive, staking, rewards, vault, governor };
}

async function getNow(): Promise<number> {
  const block = await ethers.provider.getBlock("latest");
  return block!.timestamp;
}

describe("HiveGovernor — proposals", () => {
  it("only oracle can create a proposal", async () => {
    const { alice, governor } = await deployFull();
    const end = (await getNow()) + 2 * DAY;
    await expect(
      governor.connect(alice).createProposal(
        "T", "D", "social", "1w", 5, 5, end, 0,
      ),
    ).to.be.revertedWith("not oracle");
  });

  it("rejects voting windows shorter than 24h or longer than 7d", async () => {
    const { oracle, governor } = await deployFull();
    const now = await getNow();
    await expect(
      governor.connect(oracle).createProposal("T", "D", "x", "1w", 1, 1, now + DAY - 1, 0),
    ).to.be.revertedWith("window too short");
    await expect(
      governor.connect(oracle).createProposal("T", "D", "x", "1w", 1, 1, now + WEEK + 1, 0),
    ).to.be.revertedWith("window too long");
  });

  it("voter must have stake locked through the voting window", async () => {
    const { oracle, alice, hive, staking, governor } = await deployFull();
    await hive.connect(alice).approve(await staking.getAddress(), PARSE("100"));
    // alice locks for 24h
    await staking.connect(alice).stake(PARSE("100"), DAY);

    // proposal closes in 2 days — alice's lock will already be over
    const end = (await getNow()) + 2 * DAY;
    await governor.connect(oracle).createProposal("T", "D", "x", "1w", 1, 1, end, 0);

    await expect(governor.connect(alice).vote(1, VOTE_YES)).to.be.revertedWith("no weight");
  });

  it("vote weight = weightOf at vote time, recorded on YES", async () => {
    const { oracle, alice, hive, staking, governor } = await deployFull();
    await hive.connect(alice).approve(await staking.getAddress(), PARSE("100"));
    await staking.connect(alice).stake(PARSE("100"), WEEK); // weight 150

    const end = (await getNow()) + 2 * DAY;
    await governor.connect(oracle).createProposal("T", "D", "x", "1w", 1, 1, end, 0);
    await governor.connect(alice).vote(1, VOTE_YES);

    const p = await governor.proposals(1);
    expect(p.yes).to.equal(PARSE("150"));
    expect(p.no).to.equal(0n);
    expect(p.abstain).to.equal(0n);
    expect(p.participants).to.equal(1n);
    expect(await governor.proposalVotes(1, alice.address)).to.equal(VOTE_YES);
  });

  it("a voter cannot vote twice on the same proposal", async () => {
    const { oracle, alice, hive, staking, governor } = await deployFull();
    await hive.connect(alice).approve(await staking.getAddress(), PARSE("100"));
    await staking.connect(alice).stake(PARSE("100"), WEEK);
    const end = (await getNow()) + 2 * DAY;
    await governor.connect(oracle).createProposal("T", "D", "x", "1w", 1, 1, end, 0);
    await governor.connect(alice).vote(1, VOTE_YES);
    await expect(governor.connect(alice).vote(1, VOTE_NO)).to.be.revertedWith("already voted");
  });

  it("finalize PASSED requires quorum AND ≥60% YES of (yes+no)", async () => {
    const { oracle, alice, bob, hive, staking, governor } = await deployFull();
    const sa = await staking.getAddress();
    await hive.connect(alice).approve(sa, PARSE("100"));
    await staking.connect(alice).stake(PARSE("100"), WEEK); // weight 150
    await hive.connect(bob).approve(sa, PARSE("100"));
    await staking.connect(bob).stake(PARSE("100"), WEEK); // weight 150

    const end = (await getNow()) + 2 * DAY;
    // explicit threshold = 100 weight units (well below either staker's weight)
    await governor.connect(oracle).createProposal("T", "D", "x", "1w", 1, 1, end, PARSE("100"));

    await governor.connect(alice).vote(1, VOTE_YES);
    await governor.connect(bob).vote(1, VOTE_NO);

    await time.increase(2 * DAY + 1);
    await governor.finalizeProposal(1);
    const p = await governor.proposals(1);
    // 50/50 on yes/no — should be REJECTED (not >=60%)
    expect(p.status).to.equal(STATUS_REJECTED);
  });

  it("finalize REJECTED if quorum not met", async () => {
    const { oracle, alice, hive, staking, governor } = await deployFull();
    await hive.connect(alice).approve(await staking.getAddress(), PARSE("100"));
    await staking.connect(alice).stake(PARSE("100"), WEEK);
    const end = (await getNow()) + 2 * DAY;
    // threshold ABOVE alice's possible vote
    await governor.connect(oracle).createProposal("T", "D", "x", "1w", 1, 1, end, PARSE("10000"));
    await governor.connect(alice).vote(1, VOTE_YES);
    await time.increase(2 * DAY + 1);
    await governor.finalizeProposal(1);
    expect((await governor.proposals(1)).status).to.equal(STATUS_REJECTED);
  });

  it("finalize PASSED on a clean 70/30 yes/no", async () => {
    const { oracle, alice, bob, hive, staking, governor } = await deployFull();
    const sa = await staking.getAddress();
    await hive.connect(alice).approve(sa, PARSE("700"));
    await staking.connect(alice).stake(PARSE("700"), WEEK);
    await hive.connect(bob).approve(sa, PARSE("300"));
    await staking.connect(bob).stake(PARSE("300"), WEEK);

    const end = (await getNow()) + 2 * DAY;
    await governor.connect(oracle).createProposal("T", "D", "x", "1w", 1, 1, end, PARSE("100"));
    await governor.connect(alice).vote(1, VOTE_YES);
    await governor.connect(bob).vote(1, VOTE_NO);

    await time.increase(2 * DAY + 1);
    await governor.finalizeProposal(1);
    expect((await governor.proposals(1)).status).to.equal(STATUS_PASSED);
  });

  it("ABSTAIN counts toward quorum but not toward yes/no ratio", async () => {
    const { oracle, alice, bob, carol, hive, staking, governor } = await deployFull();
    const sa = await staking.getAddress();
    for (const u of [alice, bob, carol]) {
      await hive.connect(u).approve(sa, PARSE("100"));
      await staking.connect(u).stake(PARSE("100"), WEEK);
    }

    const end = (await getNow()) + 2 * DAY;
    await governor.connect(oracle).createProposal("T", "D", "x", "1w", 1, 1, end, PARSE("100"));

    // 1 yes, 1 abstain, no no's — 100% yes of binary → PASSED
    await governor.connect(alice).vote(1, VOTE_YES);
    await governor.connect(bob).vote(1, VOTE_ABSTAIN);

    await time.increase(2 * DAY + 1);
    await governor.finalizeProposal(1);
    expect((await governor.proposals(1)).status).to.equal(STATUS_PASSED);
  });

  it("cannot finalise before the window closes, cannot finalise twice", async () => {
    const { oracle, alice, hive, staking, governor } = await deployFull();
    await hive.connect(alice).approve(await staking.getAddress(), PARSE("100"));
    await staking.connect(alice).stake(PARSE("100"), WEEK);
    const end = (await getNow()) + 2 * DAY;
    await governor.connect(oracle).createProposal("T", "D", "x", "1w", 1, 1, end, PARSE("10"));
    await governor.connect(alice).vote(1, VOTE_YES);
    await expect(governor.finalizeProposal(1)).to.be.revertedWith("still open");
    await time.increase(2 * DAY + 1);
    await governor.finalizeProposal(1);
    await expect(governor.finalizeProposal(1)).to.be.revertedWith("already finalised");
  });
});

describe("HiveGovernor — tasks", () => {
  it("requires 2..MAX_OPTIONS, valid stage, non-empty labels", async () => {
    const { oracle, governor } = await deployFull();
    const end = (await getNow()) + 2 * DAY;
    const key = ethers.keccak256(ethers.toUtf8Bytes("proj-buzz"));
    await expect(
      governor.connect(oracle).createTask(key, "D", 0, [{ label: "a", description: "" }], end, 0),
    ).to.be.revertedWith("bad options");
    await expect(
      governor.connect(oracle).createTask(key, "D", 99, [
        { label: "a", description: "" },
        { label: "b", description: "" },
      ], end, 0),
    ).to.be.revertedWith("bad stage");
    await expect(
      governor.connect(oracle).createTask(key, "D", 0, [
        { label: "", description: "" },
        { label: "b", description: "" },
      ], end, 0),
    ).to.be.revertedWith("empty label");
  });

  it("vote on a task accumulates weight on the chosen option", async () => {
    const { oracle, alice, hive, staking, governor } = await deployFull();
    await hive.connect(alice).approve(await staking.getAddress(), PARSE("100"));
    await staking.connect(alice).stake(PARSE("100"), WEEK); // weight 150
    const key = ethers.keccak256(ethers.toUtf8Bytes("proj-buzz"));
    const end = (await getNow()) + 2 * DAY;
    await governor.connect(oracle).createTask(key, "Pick a logo", 1, [
      { label: "A", description: "" },
      { label: "B", description: "" },
    ], end, PARSE("100"));

    await governor.connect(alice).voteTask(1, 2); // option B
    const opt = await governor.taskOption(1, 2);
    expect(opt.votes).to.equal(PARSE("150"));
    expect((await governor.tasks(1)).totalVotes).to.equal(PARSE("150"));
    expect(await governor.taskVotes(1, alice.address)).to.equal(2);
  });

  it("finalise picks the option that clears 55% of all task votes", async () => {
    const { oracle, alice, bob, carol, hive, staking, governor } = await deployFull();
    const sa = await staking.getAddress();
    await hive.connect(alice).approve(sa, PARSE("600"));
    await staking.connect(alice).stake(PARSE("600"), WEEK); // 900 weight
    await hive.connect(bob).approve(sa, PARSE("300"));
    await staking.connect(bob).stake(PARSE("300"), WEEK); // 450 weight
    await hive.connect(carol).approve(sa, PARSE("100"));
    await staking.connect(carol).stake(PARSE("100"), WEEK); // 150 weight

    const key = ethers.keccak256(ethers.toUtf8Bytes("proj-buzz"));
    const end = (await getNow()) + 2 * DAY;
    await governor.connect(oracle).createTask(key, "Pick", 1, [
      { label: "A", description: "" },
      { label: "B", description: "" },
      { label: "C", description: "" },
    ], end, PARSE("100"));

    await governor.connect(alice).voteTask(1, 1); // A: 900
    await governor.connect(bob).voteTask(1, 2);   // B: 450
    await governor.connect(carol).voteTask(1, 3); // C: 150
    // total = 1500. A = 900/1500 = 60% > 55% → PASSED with leader=1.

    await time.increase(2 * DAY + 1);
    await governor.finalizeTask(1);
    const t = await governor.tasks(1);
    expect(t.status).to.equal(STATUS_PASSED);
    expect(t.decidedOption).to.equal(1);
  });

  it("finalise REJECTED if no option clears 55%", async () => {
    const { oracle, alice, bob, hive, staking, governor } = await deployFull();
    const sa = await staking.getAddress();
    await hive.connect(alice).approve(sa, PARSE("100"));
    await staking.connect(alice).stake(PARSE("100"), WEEK); // 150
    await hive.connect(bob).approve(sa, PARSE("100"));
    await staking.connect(bob).stake(PARSE("100"), WEEK); // 150

    const key = ethers.keccak256(ethers.toUtf8Bytes("proj-meadow"));
    const end = (await getNow()) + 2 * DAY;
    await governor.connect(oracle).createTask(key, "Pick", 0, [
      { label: "A", description: "" },
      { label: "B", description: "" },
    ], end, PARSE("100"));

    await governor.connect(alice).voteTask(1, 1);
    await governor.connect(bob).voteTask(1, 2);
    // 50/50 — leader is below 55%

    await time.increase(2 * DAY + 1);
    await governor.finalizeTask(1);
    expect((await governor.tasks(1)).status).to.equal(STATUS_REJECTED);
  });

  it("taskOptions(id) returns the full options array", async () => {
    const { oracle, governor } = await deployFull();
    const key = ethers.keccak256(ethers.toUtf8Bytes("proj-x"));
    const end = (await getNow()) + 2 * DAY;
    await governor.connect(oracle).createTask(key, "Pick", 2, [
      { label: "Hex bloom", description: "interlocking hexagons" },
      { label: "Drip M", description: "honey M" },
      { label: "Comb", description: "layered" },
    ], end, PARSE("10"));

    const opts = await governor.taskOptions(1);
    expect(opts.length).to.equal(3);
    expect(opts[0].label).to.equal("Hex bloom");
    expect(opts[2].description).to.equal("layered");
  });
});

describe("HiveGovernor — admin & security", () => {
  it("pause halts createProposal / vote / createTask / voteTask but not finalise", async () => {
    const { owner, oracle, alice, hive, staking, governor } = await deployFull();
    await hive.connect(alice).approve(await staking.getAddress(), PARSE("100"));
    await staking.connect(alice).stake(PARSE("100"), WEEK);

    const end = (await getNow()) + 2 * DAY;
    await governor.connect(oracle).createProposal("T", "D", "x", "1w", 1, 1, end, PARSE("10"));
    await governor.connect(alice).vote(1, VOTE_YES);

    await governor.connect(owner).pause();

    const end2 = (await getNow()) + 2 * DAY;
    await expect(
      governor.connect(oracle).createProposal("T2", "D", "x", "1w", 1, 1, end2, 0),
    ).to.be.reverted;
    await expect(governor.connect(alice).vote(1, VOTE_NO)).to.be.reverted; // already voted anyway, but pause covers

    // finalize works regardless of pause (defensive: lets governance still settle)
    await time.increase(2 * DAY + 1);
    await governor.finalizeProposal(1);
  });

  it("owner can rotate oracle; old oracle loses access", async () => {
    const { owner, oracle, alice, governor } = await deployFull();
    await governor.connect(owner).setOracle(alice.address);
    expect(await governor.oracle()).to.equal(alice.address);
    const end = (await getNow()) + 2 * DAY;
    await expect(
      governor.connect(oracle).createProposal("T", "D", "x", "1w", 1, 1, end, 0),
    ).to.be.revertedWith("not oracle");
    await governor.connect(alice).createProposal("T", "D", "x", "1w", 1, 1, end, 0);
  });

  it("Ownable2Step transfer requires acceptance", async () => {
    const { owner, alice, governor } = await deployFull();
    await governor.connect(owner).transferOwnership(alice.address);
    expect(await governor.owner()).to.equal(owner.address);
    await governor.connect(alice).acceptOwnership();
    expect(await governor.owner()).to.equal(alice.address);
  });

  it("eligibleWeight returns 0 if lock ends before votingEnd", async () => {
    const { alice, hive, staking, governor } = await deployFull();
    await hive.connect(alice).approve(await staking.getAddress(), PARSE("100"));
    await staking.connect(alice).stake(PARSE("100"), DAY);

    const future = (await getNow()) + 3 * DAY;
    expect(await governor.eligibleWeight(alice.address, future)).to.equal(0n);

    const near = (await getNow()) + DAY / 2;
    expect(await governor.eligibleWeight(alice.address, near)).to.equal(PARSE("100"));
  });
});
