import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";

const PARSE = (n: string) => ethers.parseUnits(n, 18);
const DAY = 24 * 60 * 60;
const WEEK = 7 * DAY;

const VOTE_YES = 1;
const VOTE_NO = 2;
const VOTE_ABSTAIN = 3;

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
  // Wire vote-freeze hook.
  await staking.setGovernor(await governor.getAddress());

  await hive.transfer(alice.address, PARSE("1000"));
  await hive.transfer(bob.address, PARSE("1000"));
  await hive.transfer(carol.address, PARSE("1000"));

  return { owner, oracle, alice, bob, carol, treasury, hive, staking, rewards, vault, governor };
}

async function getNow(): Promise<number> {
  const block = await ethers.provider.getBlock("latest");
  return block!.timestamp;
}

const KEY = (s: string) => ethers.keccak256(ethers.toUtf8Bytes(s));

describe("HiveGovernor — proposals", () => {
  it("only oracle can create a proposal", async () => {
    const { alice, governor } = await deployFull();
    const end = (await getNow()) + 2 * DAY;
    await expect(
      governor.connect(alice).createProposal("T", "D", "social", "1w", 5, 5, end, PARSE("100")),
    ).to.be.revertedWithCustomError(governor, "NotOracle");
  });

  it("rejects threshold == 0 (audit H-G2)", async () => {
    const { oracle, governor } = await deployFull();
    const end = (await getNow()) + 2 * DAY;
    await expect(
      governor.connect(oracle).createProposal("T", "D", "x", "1w", 1, 1, end, 0),
    ).to.be.revertedWithCustomError(governor, "ThresholdRequired");
  });

  it("rejects voting windows shorter than 24h or longer than 7d", async () => {
    const { oracle, governor } = await deployFull();
    const now = await getNow();
    await expect(
      governor.connect(oracle).createProposal("T", "D", "x", "1w", 1, 1, now + DAY - 1, PARSE("10")),
    ).to.be.revertedWithCustomError(governor, "WindowTooShort");
    await expect(
      governor.connect(oracle).createProposal("T", "D", "x", "1w", 1, 1, now + WEEK + 1, PARSE("10")),
    ).to.be.revertedWithCustomError(governor, "WindowTooLong");
  });

  it("bounds free-form string fields (audit M-G3)", async () => {
    const { oracle, governor } = await deployFull();
    const end = (await getNow()) + 2 * DAY;
    const longCat = "x".repeat(33);
    const longBuild = "x".repeat(33);
    const longTitle = "x".repeat(81);
    await expect(
      governor.connect(oracle).createProposal("T", "D", longCat, "1w", 1, 1, end, PARSE("10")),
    ).to.be.revertedWithCustomError(governor, "CategoryTooLong");
    await expect(
      governor.connect(oracle).createProposal("T", "D", "social", longBuild, 1, 1, end, PARSE("10")),
    ).to.be.revertedWithCustomError(governor, "BuildTimeTooLong");
    await expect(
      governor.connect(oracle).createProposal(longTitle, "D", "x", "1w", 1, 1, end, PARSE("10")),
    ).to.be.revertedWithCustomError(governor, "TitleTooLong");
  });

  it("voter must have stake locked through the voting window", async () => {
    const { oracle, alice, hive, staking, governor } = await deployFull();
    await hive.connect(alice).approve(await staking.getAddress(), PARSE("100"));
    await staking.connect(alice).stake(PARSE("100"), DAY);
    const end = (await getNow()) + 2 * DAY;
    await governor.connect(oracle).createProposal("T", "D", "x", "1w", 1, 1, end, PARSE("10"));
    await expect(governor.connect(alice).vote(1, VOTE_YES))
      .to.be.revertedWithCustomError(governor, "NoWeight");
  });

  it("vote weight = weightOf at vote time, recorded on YES", async () => {
    const { oracle, alice, hive, staking, governor } = await deployFull();
    await hive.connect(alice).approve(await staking.getAddress(), PARSE("100"));
    await staking.connect(alice).stake(PARSE("100"), WEEK); // weight 150
    const end = (await getNow()) + 2 * DAY;
    await governor.connect(oracle).createProposal("T", "D", "x", "1w", 1, 1, end, PARSE("10"));
    await governor.connect(alice).vote(1, VOTE_YES);
    const p = await governor.proposals(1);
    expect(p.yes).to.equal(PARSE("150"));
    expect(p.participants).to.equal(1n);
  });

  it("voting freezes the staker's unstake until votingEnd (audit H-G1)", async () => {
    const { oracle, alice, hive, staking, governor } = await deployFull();
    await hive.connect(alice).approve(await staking.getAddress(), PARSE("100"));
    await staking.connect(alice).stake(PARSE("100"), WEEK);
    const end = (await getNow()) + 2 * DAY;
    await governor.connect(oracle).createProposal("T", "D", "x", "1w", 1, 1, end, PARSE("10"));
    await governor.connect(alice).vote(1, VOTE_YES);

    // voteFreezeUntil[alice] should be set to votingEnd.
    expect(await staking.voteFreezeUntil(alice.address)).to.be.gte(BigInt(end));

    // Alice cannot unstake while the vote is open.
    await expect(staking.connect(alice)["unstake()"]())
      .to.be.revertedWithCustomError(staking, "VoteFreezeActive");

    // After vote closes, unstake works.
    await time.increase(2 * DAY + 1);
    await expect(staking.connect(alice)["unstake()"]()).to.emit(staking, "Unstaked");
  });

  it("a voter cannot vote twice on the same proposal", async () => {
    const { oracle, alice, hive, staking, governor } = await deployFull();
    await hive.connect(alice).approve(await staking.getAddress(), PARSE("100"));
    await staking.connect(alice).stake(PARSE("100"), WEEK);
    const end = (await getNow()) + 2 * DAY;
    await governor.connect(oracle).createProposal("T", "D", "x", "1w", 1, 1, end, PARSE("10"));
    await governor.connect(alice).vote(1, VOTE_YES);
    await expect(governor.connect(alice).vote(1, VOTE_NO))
      .to.be.revertedWithCustomError(governor, "AlreadyVoted");
  });

  it("finalize PASSED requires quorum AND ≥60% YES of (yes+no)", async () => {
    const { oracle, alice, bob, hive, staking, governor } = await deployFull();
    const sa = await staking.getAddress();
    await hive.connect(alice).approve(sa, PARSE("100"));
    await staking.connect(alice).stake(PARSE("100"), WEEK);
    await hive.connect(bob).approve(sa, PARSE("100"));
    await staking.connect(bob).stake(PARSE("100"), WEEK);

    const end = (await getNow()) + 2 * DAY;
    await governor.connect(oracle).createProposal("T", "D", "x", "1w", 1, 1, end, PARSE("100"));
    await governor.connect(alice).vote(1, VOTE_YES);
    await governor.connect(bob).vote(1, VOTE_NO);

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
    const { oracle, alice, bob, hive, staking, governor } = await deployFull();
    const sa = await staking.getAddress();
    for (const u of [alice, bob]) {
      await hive.connect(u).approve(sa, PARSE("100"));
      await staking.connect(u).stake(PARSE("100"), WEEK);
    }
    const end = (await getNow()) + 2 * DAY;
    await governor.connect(oracle).createProposal("T", "D", "x", "1w", 1, 1, end, PARSE("100"));
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
    await expect(governor.finalizeProposal(1))
      .to.be.revertedWithCustomError(governor, "VotingStillOpen");
    await time.increase(2 * DAY + 1);
    await governor.finalizeProposal(1);
    await expect(governor.finalizeProposal(1))
      .to.be.revertedWithCustomError(governor, "NotActive");
  });
});

describe("HiveGovernor — tasks", () => {
  it("rejects 1-option tasks, > MAX_OPTIONS, invalid stage, empty/long labels", async () => {
    const { oracle, governor } = await deployFull();
    const end = (await getNow()) + 2 * DAY;
    const key = KEY("proj-buzz");
    await expect(
      governor.connect(oracle).createTask(key, "D", 0, [{ label: "a", description: "" }], end, PARSE("10")),
    ).to.be.revertedWithCustomError(governor, "TooFewOptions");
    await expect(
      governor.connect(oracle).createTask(key, "D", 99, [
        { label: "a", description: "" },
        { label: "b", description: "" },
      ], end, PARSE("10")),
    ).to.be.revertedWithCustomError(governor, "BadStage");
    await expect(
      governor.connect(oracle).createTask(key, "D", 0, [
        { label: "", description: "" },
        { label: "b", description: "" },
      ], end, PARSE("10")),
    ).to.be.revertedWithCustomError(governor, "OptionLabelEmpty");
  });

  it("rejects duplicate option labels (audit M-G4)", async () => {
    const { oracle, governor } = await deployFull();
    const end = (await getNow()) + 2 * DAY;
    await expect(
      governor.connect(oracle).createTask(KEY("p"), "Pick", 0, [
        { label: "Same", description: "" },
        { label: "Same", description: "different desc" },
      ], end, PARSE("10")),
    ).to.be.revertedWithCustomError(governor, "DuplicateOption");
  });

  it("rejects bytes32(0) projectKey", async () => {
    const { oracle, governor } = await deployFull();
    const end = (await getNow()) + 2 * DAY;
    await expect(
      governor.connect(oracle).createTask(ethers.ZeroHash, "Pick", 0, [
        { label: "A", description: "" },
        { label: "B", description: "" },
      ], end, PARSE("10")),
    ).to.be.revertedWithCustomError(governor, "ProjectKeyZero");
  });

  it("vote on a task accumulates weight on the chosen option", async () => {
    const { oracle, alice, hive, staking, governor } = await deployFull();
    await hive.connect(alice).approve(await staking.getAddress(), PARSE("100"));
    await staking.connect(alice).stake(PARSE("100"), WEEK);
    const end = (await getNow()) + 2 * DAY;
    await governor.connect(oracle).createTask(KEY("proj-buzz"), "Pick a logo", 1, [
      { label: "A", description: "" },
      { label: "B", description: "" },
    ], end, PARSE("100"));

    await governor.connect(alice).voteTask(1, 2);
    const opt = await governor.taskOption(1, 2);
    expect(opt.votes).to.equal(PARSE("150"));
    expect((await governor.tasks(1)).totalVotes).to.equal(PARSE("150"));
  });

  it("finalise picks the option that clears 55% of all task votes", async () => {
    const { oracle, alice, bob, carol, hive, staking, governor } = await deployFull();
    const sa = await staking.getAddress();
    await hive.connect(alice).approve(sa, PARSE("600"));
    await staking.connect(alice).stake(PARSE("600"), WEEK); // 900
    await hive.connect(bob).approve(sa, PARSE("300"));
    await staking.connect(bob).stake(PARSE("300"), WEEK); // 450
    await hive.connect(carol).approve(sa, PARSE("100"));
    await staking.connect(carol).stake(PARSE("100"), WEEK); // 150

    const end = (await getNow()) + 2 * DAY;
    await governor.connect(oracle).createTask(KEY("proj-buzz"), "Pick", 1, [
      { label: "A", description: "" },
      { label: "B", description: "" },
      { label: "C", description: "" },
    ], end, PARSE("100"));

    await governor.connect(alice).voteTask(1, 1); // A: 900
    await governor.connect(bob).voteTask(1, 2);   // B: 450
    await governor.connect(carol).voteTask(1, 3); // C: 150

    await time.increase(2 * DAY + 1);
    await governor.finalizeTask(1);
    const t = await governor.tasks(1);
    expect(t.status).to.equal(STATUS_PASSED);
    expect(t.decidedOption).to.equal(1);
  });

  it("finalise REJECTED on a tie at the top (audit M-G2 task)", async () => {
    const { oracle, alice, bob, hive, staking, governor } = await deployFull();
    const sa = await staking.getAddress();
    await hive.connect(alice).approve(sa, PARSE("100"));
    await staking.connect(alice).stake(PARSE("100"), WEEK);
    await hive.connect(bob).approve(sa, PARSE("100"));
    await staking.connect(bob).stake(PARSE("100"), WEEK);

    const end = (await getNow()) + 2 * DAY;
    await governor.connect(oracle).createTask(KEY("proj-meadow"), "Pick", 0, [
      { label: "A", description: "" },
      { label: "B", description: "" },
    ], end, PARSE("100"));

    await governor.connect(alice).voteTask(1, 1);
    await governor.connect(bob).voteTask(1, 2);

    await time.increase(2 * DAY + 1);
    await governor.finalizeTask(1);
    const t = await governor.tasks(1);
    expect(t.status).to.equal(STATUS_REJECTED);
    expect(t.decidedOption).to.equal(0);
  });

  it("taskOption(0) reverts (audit L-G3)", async () => {
    const { oracle, governor } = await deployFull();
    const end = (await getNow()) + 2 * DAY;
    await governor.connect(oracle).createTask(KEY("proj-x"), "Pick", 2, [
      { label: "A", description: "" },
      { label: "B", description: "" },
    ], end, PARSE("10"));
    await expect(governor.taskOption(1, 0))
      .to.be.revertedWithCustomError(governor, "BadOption");
  });
});

describe("HiveGovernor — admin & 2-step oracle rotation", () => {
  it("proposeOracle waits ORACLE_ROTATION_DELAY before acceptOracleRotation", async () => {
    const { owner, oracle, alice, governor } = await deployFull();
    await governor.connect(owner).proposeOracle(alice.address);
    expect(await governor.pendingOracle()).to.equal(alice.address);

    // Cannot accept immediately.
    await expect(governor.connect(owner).acceptOracleRotation())
      .to.be.revertedWithCustomError(governor, "RotationCooldown");

    // After cooldown, accept succeeds.
    await time.increase(24 * 60 * 60 + 1);
    await governor.connect(owner).acceptOracleRotation();
    expect(await governor.oracle()).to.equal(alice.address);

    // Old oracle now lacks access.
    const end = (await getNow()) + 2 * DAY;
    await expect(
      governor.connect(oracle).createProposal("T", "D", "x", "1w", 1, 1, end, PARSE("10")),
    ).to.be.revertedWithCustomError(governor, "NotOracle");
  });

  it("cancelOracleRotation aborts a pending rotation", async () => {
    const { owner, alice, oracle, governor } = await deployFull();
    await governor.connect(owner).proposeOracle(alice.address);
    await governor.connect(owner).cancelOracleRotation();
    expect(await governor.pendingOracle()).to.equal(ethers.ZeroAddress);

    // Old oracle still works.
    const end = (await getNow()) + 2 * DAY;
    await governor.connect(oracle).createProposal("T", "D", "x", "1w", 1, 1, end, PARSE("10"));
  });

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
      governor.connect(oracle).createProposal("T2", "D", "x", "1w", 1, 1, end2, PARSE("10")),
    ).to.be.reverted;

    // Finalize after pause + window close — should still work.
    await time.increase(2 * DAY + 1);
    await governor.finalizeProposal(1);
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
