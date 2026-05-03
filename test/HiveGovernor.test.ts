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

const MIN_PROPOSE_STAKE = PARSE("100");

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
    MIN_PROPOSE_STAKE,
  );
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

describe("HiveGovernor — idea proposals (oracle or staker)", () => {
  it("non-staker non-oracle is rejected", async () => {
    const { alice, governor } = await deployFull();
    const end = (await getNow()) + 2 * DAY;
    await expect(
      governor.connect(alice).createProposal("T", "Long enough description here.", "social", "1w", 5, 5, end, PARSE("100")),
    ).to.be.revertedWithCustomError(governor, "InsufficientStakeToPropose");
  });

  it("staker with >= minProposeStake can submit a project idea", async () => {
    const { alice, hive, staking, governor } = await deployFull();
    await hive.connect(alice).approve(await staking.getAddress(), PARSE("100"));
    await staking.connect(alice).stake(PARSE("100"));

    const end = (await getNow()) + 2 * DAY;
    await governor
      .connect(alice)
      .createProposal("Pollen", "Permissionless yield router for L2 dust positions.", "defi", "5 weeks", 7, 8, end, PARSE("10"));

    const p = await governor.proposals(1);
    expect(p.title).to.equal("Pollen");
    expect(p.submitter).to.equal(alice.address);
  });

  it("AI proposal records oracle as submitter", async () => {
    const { oracle, governor } = await deployFull();
    const end = (await getNow()) + 2 * DAY;
    await governor.connect(oracle).createProposal("AI idea", "AI-generated description here.", "infra", "3 weeks", 5, 5, end, PARSE("10"));
    expect((await governor.proposals(1)).submitter).to.equal(oracle.address);
  });

  it("vote weight = stake amount; vote-once; freeze blocks unstake", async () => {
    const { oracle, alice, hive, staking, governor } = await deployFull();
    await hive.connect(alice).approve(await staking.getAddress(), PARSE("100"));
    await staking.connect(alice).stake(PARSE("100"));

    const end = (await getNow()) + 2 * DAY;
    await governor.connect(oracle).createProposal("T", "D", "x", "1w", 1, 1, end, PARSE("10"));
    await governor.connect(alice).vote(1, VOTE_YES);

    const p = await governor.proposals(1);
    expect(p.yes).to.equal(PARSE("100"));

    // freeze prevents unstake until votingEnd
    await expect(staking.connect(alice).unstakeAll())
      .to.be.revertedWithCustomError(staking, "VoteFreezeActive");

    await expect(governor.connect(alice).vote(1, VOTE_NO))
      .to.be.revertedWithCustomError(governor, "AlreadyVoted");

    await time.increase(2 * DAY + 1);
    await expect(staking.connect(alice).unstakeAll()).to.emit(staking, "Unstaked");
  });

  it("voter must hold a positive stake", async () => {
    const { oracle, alice, governor } = await deployFull();
    const end = (await getNow()) + 2 * DAY;
    await governor.connect(oracle).createProposal("T", "D", "x", "1w", 1, 1, end, PARSE("10"));
    await expect(governor.connect(alice).vote(1, VOTE_YES))
      .to.be.revertedWithCustomError(governor, "NoWeight");
  });

  it("clean 70/30 yes/no => PASSED", async () => {
    const { oracle, alice, bob, hive, staking, governor } = await deployFull();
    const sa = await staking.getAddress();
    await hive.connect(alice).approve(sa, PARSE("700"));
    await staking.connect(alice).stake(PARSE("700"));
    await hive.connect(bob).approve(sa, PARSE("300"));
    await staking.connect(bob).stake(PARSE("300"));

    const end = (await getNow()) + 2 * DAY;
    await governor.connect(oracle).createProposal("T", "D", "x", "1w", 1, 1, end, PARSE("100"));
    await governor.connect(alice).vote(1, VOTE_YES);
    await governor.connect(bob).vote(1, VOTE_NO);

    await time.increase(2 * DAY + 1);
    await governor.finalizeProposal(1);
    expect((await governor.proposals(1)).status).to.equal(STATUS_PASSED);
  });
});

describe("HiveGovernor — community proposals (stakers)", () => {
  it("rejects submitter with stake < minProposeStake", async () => {
    const { alice, hive, staking, governor } = await deployFull();
    await hive.connect(alice).approve(await staking.getAddress(), PARSE("99"));
    await staking.connect(alice).stake(PARSE("99"));
    const end = (await getNow()) + 2 * DAY;
    await expect(
      governor
        .connect(alice)
        .submitCommunityProposal(KEY("p"), "Voice rooms", "Browser-native voice in v1.", end, PARSE("10")),
    ).to.be.revertedWithCustomError(governor, "InsufficientStakeToPropose");
  });

  it("staker with >= minProposeStake can submit + vote", async () => {
    const { alice, hive, staking, governor } = await deployFull();
    await hive.connect(alice).approve(await staking.getAddress(), PARSE("150"));
    await staking.connect(alice).stake(PARSE("150"));

    const end = (await getNow()) + 2 * DAY;
    await governor
      .connect(alice)
      .submitCommunityProposal(KEY("p-buzz"), "Voice rooms", "Browser-native voice in v1.", end, PARSE("100"));

    await governor.connect(alice).voteCommunity(1, VOTE_YES);
    const c = await governor.communityProposals(1);
    expect(c.yes).to.equal(PARSE("150"));
    expect(c.submitter).to.equal(alice.address);
  });

  it("auto-promotes to a task on PASS", async () => {
    const { alice, bob, hive, staking, governor } = await deployFull();
    const sa = await staking.getAddress();
    await hive.connect(alice).approve(sa, PARSE("700"));
    await staking.connect(alice).stake(PARSE("700"));
    await hive.connect(bob).approve(sa, PARSE("300"));
    await staking.connect(bob).stake(PARSE("300"));

    const end = (await getNow()) + 2 * DAY;
    await governor
      .connect(alice)
      .submitCommunityProposal(KEY("p-buzz"), "Voice rooms", "Browser-native voice in v1.", end, PARSE("100"));
    await governor.connect(alice).voteCommunity(1, VOTE_YES);
    await governor.connect(bob).voteCommunity(1, VOTE_NO);

    await time.increase(2 * DAY + 1);
    await governor.finalizeCommunityProposal(1);

    const c = await governor.communityProposals(1);
    expect(c.status).to.equal(STATUS_PASSED);
    expect(c.becameTaskId).to.not.equal(0n);

    const t = await governor.tasks(c.becameTaskId);
    expect(t.status).to.equal(STATUS_PASSED);
    expect(t.description).to.equal("Voice rooms");
    expect(t.optionCount).to.equal(0);
  });

  it("REJECTED community proposal does not produce a task", async () => {
    const { alice, bob, hive, staking, governor } = await deployFull();
    const sa = await staking.getAddress();
    await hive.connect(alice).approve(sa, PARSE("100"));
    await staking.connect(alice).stake(PARSE("100"));
    await hive.connect(bob).approve(sa, PARSE("700"));
    await staking.connect(bob).stake(PARSE("700"));

    const end = (await getNow()) + 2 * DAY;
    await governor
      .connect(alice)
      .submitCommunityProposal(KEY("p"), "Voice rooms", "Browser-native voice in v1.", end, PARSE("100"));
    await governor.connect(alice).voteCommunity(1, VOTE_YES);
    await governor.connect(bob).voteCommunity(1, VOTE_NO);

    const taskCountBefore = await governor.taskCount();
    await time.increase(2 * DAY + 1);
    await governor.finalizeCommunityProposal(1);
    expect((await governor.communityProposals(1)).status).to.equal(STATUS_REJECTED);
    expect(await governor.taskCount()).to.equal(taskCountBefore);
  });
});

describe("HiveGovernor — multi-option tasks (oracle or staker)", () => {
  it("non-staker non-oracle is rejected", async () => {
    const { alice, governor } = await deployFull();
    const end = (await getNow()) + 2 * DAY;
    await expect(
      governor.connect(alice).createTask(KEY("p"), "Pick a name", 0, [
        { label: "Buzz", description: "" },
        { label: "Hum", description: "" },
      ], end, PARSE("10")),
    ).to.be.revertedWithCustomError(governor, "InsufficientStakeToPropose");
  });

  it("staker can submit a naming task", async () => {
    const { alice, hive, staking, governor } = await deployFull();
    await hive.connect(alice).approve(await staking.getAddress(), PARSE("150"));
    await staking.connect(alice).stake(PARSE("150"));

    const end = (await getNow()) + 2 * DAY;
    await governor.connect(alice).createTask(KEY("proj-buzz"), "Pick a name", 0, [
      { label: "Buzz", description: "" },
      { label: "Hum", description: "" },
      { label: "Comb", description: "" },
    ], end, PARSE("10"));

    const t = await governor.tasks(1);
    expect(t.optionCount).to.equal(3);
    expect(t.submitter).to.equal(alice.address);
  });
});

describe("HiveGovernor — admin", () => {
  it("setMinProposeStake updates the bar", async () => {
    const { owner, alice, hive, staking, governor } = await deployFull();
    await hive.connect(alice).approve(await staking.getAddress(), PARSE("50"));
    await staking.connect(alice).stake(PARSE("50"));

    // initially blocked at 100 HIVE
    const end = (await getNow()) + 2 * DAY;
    await expect(
      governor.connect(alice).submitCommunityProposal(KEY("p"), "T", "Long enough description here.", end, PARSE("10")),
    ).to.be.revertedWithCustomError(governor, "InsufficientStakeToPropose");

    // owner lowers bar to 10 HIVE
    await governor.connect(owner).setMinProposeStake(PARSE("10"));
    await governor
      .connect(alice)
      .submitCommunityProposal(KEY("p"), "T", "Long enough description here.", end, PARSE("10"));
    expect(await governor.communityProposalCount()).to.equal(1n);
  });

  it("Ownable2Step transfer requires acceptance", async () => {
    const { owner, alice, governor } = await deployFull();
    await governor.connect(owner).transferOwnership(alice.address);
    expect(await governor.owner()).to.equal(owner.address);
    await governor.connect(alice).acceptOwnership();
    expect(await governor.owner()).to.equal(alice.address);
  });
});
