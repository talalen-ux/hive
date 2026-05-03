/// Trimmed ABIs covering only what the dApp actually calls / reads.
/// Keep in sync with `contracts/`. Field order on struct getters mirrors the
/// Solidity source declaration order.

export const HIVE_TOKEN_ABI = [
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ name: "account", type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "allowance", stateMutability: "view", inputs: [{ name: "owner", type: "address" }, { name: "spender", type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "approve", stateMutability: "nonpayable", inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }], outputs: [{ type: "bool" }] },
  { type: "function", name: "decimals", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
  { type: "function", name: "symbol", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
] as const;

// HiveStaking v2 — no locks. weightOf = amount. unstake(uint256) takes a
// partial amount; unstakeAll() exits the full position. voteFreezeUntil
// blocks unstake while the user has open votes.
export const STAKING_ABI = [
  { type: "function", name: "stake", stateMutability: "nonpayable", inputs: [{ name: "amount", type: "uint256" }], outputs: [] },
  { type: "function", name: "unstake", stateMutability: "nonpayable", inputs: [{ name: "amount", type: "uint256" }], outputs: [] },
  { type: "function", name: "unstakeAll", stateMutability: "nonpayable", inputs: [], outputs: [] },
  { type: "function", name: "claim", stateMutability: "nonpayable", inputs: [{ name: "to", type: "address" }], outputs: [{ type: "uint256" }, { type: "uint256" }] },
  { type: "function", name: "stakes", stateMutability: "view", inputs: [{ name: "user", type: "address" }], outputs: [
    { name: "amount", type: "uint128" },
    { name: "firstStakeAt", type: "uint64" },
  ] },
  { type: "function", name: "totalStaked", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "totalWeighted", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "effectiveWeighted", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "weightOf", stateMutability: "view", inputs: [{ name: "user", type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "voteFreezeUntil", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "uint64" }] },
  { type: "function", name: "pendingHive", stateMutability: "view", inputs: [{ name: "user", type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "pendingEth", stateMutability: "view", inputs: [{ name: "user", type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "event", name: "Staked", inputs: [
    { name: "user", type: "address", indexed: true },
    { name: "amount", type: "uint256", indexed: false },
    { name: "newAmount", type: "uint256", indexed: false },
  ] },
  { type: "event", name: "Unstaked", inputs: [
    { name: "user", type: "address", indexed: true },
    { name: "amount", type: "uint256", indexed: false },
    { name: "newAmount", type: "uint256", indexed: false },
  ] },
] as const;

export const REWARDS_ABI = [
  { type: "function", name: "pendingHive", stateMutability: "view", inputs: [{ name: "user", type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "pendingEth", stateMutability: "view", inputs: [{ name: "user", type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "totalHiveDistributed", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "totalEthDistributed", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "pendingPoolHive", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "pendingPoolEth", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "lastPayoutAt", stateMutability: "view", inputs: [], outputs: [{ type: "uint64" }] },
] as const;

export const VAULT_ABI = [
  { type: "function", name: "harvest", stateMutability: "nonpayable", inputs: [], outputs: [] },
] as const;

export const GOVERNOR_ABI = [
  { type: "function", name: "proposalCount", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "taskCount", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "communityProposalCount", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "minProposeStake", stateMutability: "view", inputs: [], outputs: [{ type: "uint128" }] },
  { type: "function", name: "canPropose", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "bool" }] },
  { type: "function", name: "proposals", stateMutability: "view", inputs: [{ type: "uint256" }], outputs: [
    { name: "title", type: "string" },
    { name: "description", type: "string" },
    { name: "category", type: "string" },
    { name: "buildTime", type: "string" },
    { name: "votingStart", type: "uint64" },
    { name: "votingEnd", type: "uint64" },
    { name: "yes", type: "uint128" },
    { name: "no", type: "uint128" },
    { name: "abstain", type: "uint128" },
    { name: "threshold", type: "uint128" },
    { name: "participants", type: "uint32" },
    { name: "complexity", type: "uint8" },
    { name: "marketPotential", type: "uint8" },
    { name: "status", type: "uint8" },
  ] },
  { type: "function", name: "proposalVotes", stateMutability: "view",
    inputs: [{ name: "id", type: "uint256" }, { name: "voter", type: "address" }],
    outputs: [{ type: "uint8" }] },
  { type: "function", name: "communityProposals", stateMutability: "view", inputs: [{ type: "uint256" }], outputs: [
    { name: "projectKey", type: "bytes32" },
    { name: "submitter", type: "address" },
    { name: "title", type: "string" },
    { name: "description", type: "string" },
    { name: "votingStart", type: "uint64" },
    { name: "votingEnd", type: "uint64" },
    { name: "yes", type: "uint128" },
    { name: "no", type: "uint128" },
    { name: "abstain", type: "uint128" },
    { name: "threshold", type: "uint128" },
    { name: "participants", type: "uint32" },
    { name: "status", type: "uint8" },
    { name: "becameTaskId", type: "uint256" },
  ] },
  { type: "function", name: "communityVotes", stateMutability: "view",
    inputs: [{ name: "id", type: "uint256" }, { name: "voter", type: "address" }],
    outputs: [{ type: "uint8" }] },
  { type: "function", name: "tasks", stateMutability: "view", inputs: [{ type: "uint256" }], outputs: [
    { name: "projectKey", type: "bytes32" },
    { name: "description", type: "string" },
    { name: "votingStart", type: "uint64" },
    { name: "votingEnd", type: "uint64" },
    { name: "threshold", type: "uint128" },
    { name: "totalVotes", type: "uint128" },
    { name: "stage", type: "uint8" },
    { name: "optionCount", type: "uint8" },
    { name: "status", type: "uint8" },
    { name: "decidedOption", type: "uint8" },
  ] },
  { type: "function", name: "taskOptions", stateMutability: "view", inputs: [{ type: "uint256" }], outputs: [
    { type: "tuple[]", components: [
      { name: "label", type: "string" },
      { name: "description", type: "string" },
      { name: "votes", type: "uint128" },
    ] },
  ] },
  { type: "function", name: "taskVotes", stateMutability: "view",
    inputs: [{ name: "id", type: "uint256" }, { name: "voter", type: "address" }],
    outputs: [{ type: "uint8" }] },
  { type: "function", name: "vote", stateMutability: "nonpayable",
    inputs: [{ name: "id", type: "uint256" }, { name: "choice", type: "uint8" }], outputs: [] },
  { type: "function", name: "voteTask", stateMutability: "nonpayable",
    inputs: [{ name: "id", type: "uint256" }, { name: "option", type: "uint8" }], outputs: [] },
  { type: "function", name: "voteCommunity", stateMutability: "nonpayable",
    inputs: [{ name: "id", type: "uint256" }, { name: "choice", type: "uint8" }], outputs: [] },
  { type: "function", name: "submitCommunityProposal", stateMutability: "nonpayable",
    inputs: [
      { name: "projectKey", type: "bytes32" },
      { name: "title", type: "string" },
      { name: "description", type: "string" },
      { name: "votingEnd", type: "uint64" },
      { name: "threshold", type: "uint128" },
    ], outputs: [{ name: "id", type: "uint256" }] },
  { type: "function", name: "finalizeProposal", stateMutability: "nonpayable",
    inputs: [{ name: "id", type: "uint256" }], outputs: [] },
  { type: "function", name: "finalizeTask", stateMutability: "nonpayable",
    inputs: [{ name: "id", type: "uint256" }], outputs: [] },
  { type: "function", name: "finalizeCommunityProposal", stateMutability: "nonpayable",
    inputs: [{ name: "id", type: "uint256" }], outputs: [] },
] as const;
