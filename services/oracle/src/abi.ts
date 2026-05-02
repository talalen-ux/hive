/**
 * Minimal ABI for HiveGovernor — only the functions the oracle reads or writes.
 * Keep in sync with contracts/HiveGovernor.sol.
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
      { name: "complexity", type: "uint8" },
      { name: "marketPotential", type: "uint8" },
      { name: "votingStart", type: "uint64" },
      { name: "votingEnd", type: "uint64" },
      { name: "yes", type: "uint128" },
      { name: "no", type: "uint128" },
      { name: "abstain", type: "uint128" },
      { name: "threshold", type: "uint128" },
      { name: "participants", type: "uint32" },
      { name: "status", type: "uint8" },
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
] as const;
