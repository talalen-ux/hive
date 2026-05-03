/**
 * Minimal ABI for HiveGovernor — only the functions the oracle reads or writes.
 * Keep in sync with contracts/HiveGovernor.sol. Field order on struct getters
 * mirrors the Solidity source declaration order (which is also the storage
 * packing order chosen during the security audit).
 */
export const GOVERNOR_ABI = [
  {
    type: "function",
    name: "proposalCount",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "proposals",
    stateMutability: "view",
    inputs: [{ type: "uint256" }],
    outputs: [
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
      { name: "submitter", type: "address" },
    ],
  },
  {
    type: "function",
    name: "createProposal",
    stateMutability: "nonpayable",
    inputs: [
      { name: "title", type: "string" },
      { name: "description", type: "string" },
      { name: "category", type: "string" },
      { name: "buildTime", type: "string" },
      { name: "complexity", type: "uint8" },
      { name: "marketPotential", type: "uint8" },
      { name: "votingEnd", type: "uint64" },
      { name: "threshold", type: "uint128" },
    ],
    outputs: [{ name: "id", type: "uint256" }],
  },
  {
    type: "function",
    name: "oracle",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
  },
  {
    type: "function",
    name: "staking",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
  },
  // ProposalCreated event lets us decode the new proposal id from the receipt.
  {
    type: "event",
    name: "ProposalCreated",
    inputs: [
      { name: "id", type: "uint256", indexed: true },
      { name: "submitter", type: "address", indexed: true },
      { name: "title", type: "string", indexed: false },
      { name: "votingEnd", type: "uint64", indexed: false },
      { name: "threshold", type: "uint128", indexed: false },
    ],
  },
] as const;

/// Minimal HiveStaking view used only by the oracle's pre-flight checks.
export const STAKING_VIEW_ABI = [
  {
    type: "function",
    name: "totalWeighted",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
] as const;
