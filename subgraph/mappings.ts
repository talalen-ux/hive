import { BigInt, Bytes, ethereum } from "@graphprotocol/graph-ts";
import {
  Staked,
  Unstaked,
} from "../generated/HiveStaking/HiveStaking";
import {
  RewardAdded,
  Claimed,
  Forfeited,
} from "../generated/HiveRewards/HiveRewards";
import {
  Staker,
  StakeEvent,
  UnstakeEvent,
  ClaimEvent,
  RewardEpoch,
  Stats,
} from "../generated/schema";

const STATS_ID = "global";
const BPS = BigInt.fromI32(10_000);
const MIN_LOCK = BigInt.fromI32(86_400);
const MID_LOCK = BigInt.fromI32(86_400 * 3);
const MAX_LOCK = BigInt.fromI32(86_400 * 7);

function getOrCreateStaker(address: Bytes): Staker {
  let id = address.toHexString();
  let s = Staker.load(id);
  if (s == null) {
    s = new Staker(id);
    s.amount = BigInt.zero();
    s.weight = BigInt.zero();
    s.lockEnd = BigInt.zero();
    s.lockDuration = BigInt.zero();
    s.multiplier = 10_000;
    s.totalHiveClaimed = BigInt.zero();
    s.totalEthClaimed = BigInt.zero();
    s.totalForfeitedHive = BigInt.zero();
    s.totalForfeitedEth = BigInt.zero();
    let stats = getStats();
    stats.uniqueStakers = stats.uniqueStakers + 1;
    stats.save();
  }
  return s as Staker;
}

function getStats(): Stats {
  let stats = Stats.load(STATS_ID);
  if (stats == null) {
    stats = new Stats(STATS_ID);
    stats.totalStaked = BigInt.zero();
    stats.totalWeighted = BigInt.zero();
    stats.totalHiveDistributed = BigInt.zero();
    stats.totalEthDistributed = BigInt.zero();
    stats.uniqueStakers = 0;
  }
  return stats as Stats;
}

function multiplierFor(lockDuration: BigInt): i32 {
  if (lockDuration.ge(MAX_LOCK)) return 15_000;
  if (lockDuration.ge(MID_LOCK)) return 12_000;
  if (lockDuration.ge(MIN_LOCK)) return 10_000;
  return 10_000;
}

function eventId(event: ethereum.Event): string {
  return event.transaction.hash.toHexString() + "-" + event.logIndex.toString();
}

export function handleStaked(event: Staked): void {
  let user = getOrCreateStaker(event.params.user);
  let mult = multiplierFor(event.params.lockDuration);
  user.amount = user.amount.plus(event.params.amount);
  user.lockEnd = event.params.lockEnd;
  user.lockDuration = event.params.lockDuration;
  user.multiplier = mult;
  user.weight = user.amount.times(BigInt.fromI32(mult)).div(BPS);
  user.save();

  let ev = new StakeEvent(eventId(event));
  ev.staker = user.id;
  ev.amount = event.params.amount;
  ev.lockDuration = event.params.lockDuration;
  ev.lockEnd = event.params.lockEnd;
  ev.blockNumber = event.block.number;
  ev.timestamp = event.block.timestamp;
  ev.txHash = event.transaction.hash;
  ev.save();

  let stats = getStats();
  stats.totalStaked = stats.totalStaked.plus(event.params.amount);
  stats.totalWeighted = stats.totalWeighted.plus(
    event.params.amount.times(BigInt.fromI32(mult)).div(BPS)
  );
  stats.save();
}

export function handleUnstaked(event: Unstaked): void {
  let user = getOrCreateStaker(event.params.user);
  let prevWeight = user.weight;
  let prevAmount = user.amount;
  user.amount = BigInt.zero();
  user.weight = BigInt.zero();
  user.lockEnd = BigInt.zero();
  user.lockDuration = BigInt.zero();
  user.save();

  let ev = new UnstakeEvent(eventId(event));
  ev.staker = user.id;
  ev.amount = event.params.amount;
  ev.earnedRewards = event.params.earnedRewards;
  ev.blockNumber = event.block.number;
  ev.timestamp = event.block.timestamp;
  ev.txHash = event.transaction.hash;
  ev.save();

  let stats = getStats();
  stats.totalStaked = stats.totalStaked.minus(prevAmount);
  stats.totalWeighted = stats.totalWeighted.minus(prevWeight);
  stats.save();
}

export function handleRewardAdded(event: RewardAdded): void {
  let id = event.block.number.toString() + "-" + event.logIndex.toString();
  let ep = new RewardEpoch(id);
  ep.hiveAdded = event.params.hiveAmount;
  ep.ethAdded = event.params.ethAmount;
  ep.totalWeighted = getStats().totalWeighted;
  ep.blockNumber = event.block.number;
  ep.timestamp = event.block.timestamp;
  ep.save();

  let stats = getStats();
  stats.totalHiveDistributed = stats.totalHiveDistributed.plus(event.params.hiveAmount);
  stats.totalEthDistributed = stats.totalEthDistributed.plus(event.params.ethAmount);
  stats.save();
}

export function handleClaimed(event: Claimed): void {
  let user = getOrCreateStaker(event.params.user);
  user.totalHiveClaimed = user.totalHiveClaimed.plus(event.params.hiveAmount);
  user.totalEthClaimed = user.totalEthClaimed.plus(event.params.ethAmount);
  user.save();

  let ev = new ClaimEvent(eventId(event));
  ev.staker = user.id;
  ev.to = event.params.to;
  ev.hiveAmount = event.params.hiveAmount;
  ev.ethAmount = event.params.ethAmount;
  ev.blockNumber = event.block.number;
  ev.timestamp = event.block.timestamp;
  ev.txHash = event.transaction.hash;
  ev.save();
}

export function handleForfeited(event: Forfeited): void {
  let user = getOrCreateStaker(event.params.user);
  user.totalForfeitedHive = user.totalForfeitedHive.plus(event.params.hiveAmount);
  user.totalForfeitedEth = user.totalForfeitedEth.plus(event.params.ethAmount);
  user.save();
}
