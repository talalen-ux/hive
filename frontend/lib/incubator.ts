/**
 * Slice-1 incubator mock data + in-memory store.
 *
 * Replaces an eventual on-chain governor + AI generator service. Every type
 * here mirrors the on-chain shape we'll write in slice 2 so the UI doesn't
 * need to change when we swap the backing store.
 */

export type Category = "consumer" | "defi" | "infra" | "social" | "tooling";
export type IdeaStatus = "PENDING" | "ACTIVE_VOTE" | "APPROVED" | "REJECTED";
export type ProjectStage =
  | "INITIATION"
  | "IDENTITY"
  | "WEBSITE_V1"
  | "PRODUCT_DESIGN"
  | "LAUNCH";

export const STAGE_ORDER: ProjectStage[] = [
  "INITIATION",
  "IDENTITY",
  "WEBSITE_V1",
  "PRODUCT_DESIGN",
  "LAUNCH",
];

export const STAGE_LABEL: Record<ProjectStage, string> = {
  INITIATION: "Initiation",
  IDENTITY: "Identity",
  WEBSITE_V1: "Website V1",
  PRODUCT_DESIGN: "Product Design",
  LAUNCH: "Launch",
};

export type Idea = {
  id: string;
  title: string;
  description: string;
  category: Category;
  complexity: number;
  marketPotential: number;
  buildTime: string;
  status: IdeaStatus;
  proposalId?: string;
  generatedAt: number;
};

export type Proposal = {
  id: string;
  ideaId: string;
  votingStart: number;
  votingEnd: number;
  yes: number;
  no: number;
  abstain: number;
  participants: number;
  threshold: number;
  status: "ACTIVE" | "PASSED" | "REJECTED";
};

export type TaskOption = {
  id: string;
  label: string;
  description: string;
  votes: number;
};

export type Task = {
  id: string;
  projectId: string;
  stage: ProjectStage;
  description: string;
  options: TaskOption[];
  status: "ACTIVE" | "DECIDED" | "PENDING";
  votingEnd: number;
  decidedOption?: string;
};

export type StageEntry = {
  stage: ProjectStage;
  status: "DONE" | "ACTIVE" | "PENDING";
  completedAt?: number;
};

export type Project = {
  id: string;
  name: string;
  ideaId: string;
  tagline: string;
  category: Category;
  currentStage: ProjectStage;
  stages: StageEntry[];
  startedAt: number;
};

export type SwarmEntry = {
  address: string;
  votesCast: number;
  accuracy: number;
  influence: number;
  rank: number;
};

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

// Build a deterministic timestamp anchor so the initial render is stable
// across SSR and client rehydration. Real time-since-now is computed on
// the client using a separate clock.
const ANCHOR = 1_777_000_000_000;

const SEED_IDEAS: Idea[] = [
  {
    id: "idea-1",
    title: "HiveSocial",
    description:
      "Token-gated social graph for crypto communities. Reputation is on-chain, posts are signed, mods are staked.",
    category: "social",
    complexity: 7,
    marketPotential: 9,
    buildTime: "3 weeks",
    status: "ACTIVE_VOTE",
    proposalId: "prop-1",
    generatedAt: ANCHOR - 6 * HOUR,
  },
  {
    id: "idea-2",
    title: "Pollen",
    description:
      "Permissionless yield router that batches dust positions across L2s into a single auto-compounded vault.",
    category: "defi",
    complexity: 8,
    marketPotential: 8,
    buildTime: "5 weeks",
    status: "ACTIVE_VOTE",
    proposalId: "prop-2",
    generatedAt: ANCHOR - 4 * HOUR,
  },
  {
    id: "idea-3",
    title: "Comb",
    description:
      "Hex-based on-chain knowledge map. Stake to publish a node; truth surfaces by stake-weighted endorsements.",
    category: "tooling",
    complexity: 6,
    marketPotential: 7,
    buildTime: "4 weeks",
    status: "ACTIVE_VOTE",
    proposalId: "prop-3",
    generatedAt: ANCHOR - 2 * HOUR,
  },
  {
    id: "idea-4",
    title: "Drone",
    description:
      "Autonomous agent runtime tethered to a multisig. Token holders vote on tools the agent may invoke.",
    category: "infra",
    complexity: 9,
    marketPotential: 8,
    buildTime: "6 weeks",
    status: "PENDING",
    generatedAt: ANCHOR - 1 * HOUR,
  },
  {
    id: "idea-5",
    title: "Nectar Notes",
    description:
      "Crypto-native journaling app with AI summaries. Notes hashed on-chain, optional public publish.",
    category: "consumer",
    complexity: 4,
    marketPotential: 6,
    buildTime: "2 weeks",
    status: "PENDING",
    generatedAt: ANCHOR - 30 * 60 * 1000,
  },
  {
    id: "idea-6",
    title: "Apiary",
    description:
      "Cooperative venture studio frame: small teams pitch in, tokens stake conviction, the swarm picks winners.",
    category: "infra",
    complexity: 8,
    marketPotential: 9,
    buildTime: "5 weeks",
    status: "PENDING",
    generatedAt: ANCHOR - 15 * 60 * 1000,
  },
  {
    id: "idea-7",
    title: "Royal Jelly",
    description:
      "Long-only memecoin index with anti-rug filter — only tokens with >7d staked liquidity by Hive members.",
    category: "defi",
    complexity: 5,
    marketPotential: 7,
    buildTime: "3 weeks",
    status: "PENDING",
    generatedAt: ANCHOR - 5 * 60 * 1000,
  },
];

const SEED_PROPOSALS: Proposal[] = [
  {
    id: "prop-1",
    ideaId: "idea-1",
    votingStart: ANCHOR - 6 * HOUR,
    votingEnd: ANCHOR + 18 * HOUR,
    yes: 184_500,
    no: 41_200,
    abstain: 9_800,
    participants: 312,
    threshold: 100_000,
    status: "ACTIVE",
  },
  {
    id: "prop-2",
    ideaId: "idea-2",
    votingStart: ANCHOR - 4 * HOUR,
    votingEnd: ANCHOR + 20 * HOUR,
    yes: 92_400,
    no: 78_900,
    abstain: 14_300,
    participants: 198,
    threshold: 100_000,
    status: "ACTIVE",
  },
  {
    id: "prop-3",
    ideaId: "idea-3",
    votingStart: ANCHOR - 2 * HOUR,
    votingEnd: ANCHOR + 46 * HOUR,
    yes: 51_600,
    no: 12_700,
    abstain: 4_200,
    participants: 121,
    threshold: 100_000,
    status: "ACTIVE",
  },
];

const SEED_PROJECTS: Project[] = [
  {
    id: "proj-buzz",
    name: "Buzz",
    ideaId: "idea-launched-1",
    tagline: "On-chain telegram for the swarm.",
    category: "social",
    currentStage: "WEBSITE_V1",
    stages: [
      { stage: "INITIATION", status: "DONE", completedAt: ANCHOR - 12 * DAY },
      { stage: "IDENTITY", status: "DONE", completedAt: ANCHOR - 6 * DAY },
      { stage: "WEBSITE_V1", status: "ACTIVE" },
      { stage: "PRODUCT_DESIGN", status: "PENDING" },
      { stage: "LAUNCH", status: "PENDING" },
    ],
    startedAt: ANCHOR - 14 * DAY,
  },
  {
    id: "proj-meadow",
    name: "Meadow",
    ideaId: "idea-launched-2",
    tagline: "Yield aggregator with hex-shaped vaults.",
    category: "defi",
    currentStage: "IDENTITY",
    stages: [
      { stage: "INITIATION", status: "DONE", completedAt: ANCHOR - 4 * DAY },
      { stage: "IDENTITY", status: "ACTIVE" },
      { stage: "WEBSITE_V1", status: "PENDING" },
      { stage: "PRODUCT_DESIGN", status: "PENDING" },
      { stage: "LAUNCH", status: "PENDING" },
    ],
    startedAt: ANCHOR - 5 * DAY,
  },
  {
    id: "proj-drone",
    name: "Forager",
    ideaId: "idea-launched-3",
    tagline: "Onchain agent that hunts opportunity for the hive.",
    category: "infra",
    currentStage: "PRODUCT_DESIGN",
    stages: [
      { stage: "INITIATION", status: "DONE", completedAt: ANCHOR - 22 * DAY },
      { stage: "IDENTITY", status: "DONE", completedAt: ANCHOR - 16 * DAY },
      { stage: "WEBSITE_V1", status: "DONE", completedAt: ANCHOR - 8 * DAY },
      { stage: "PRODUCT_DESIGN", status: "ACTIVE" },
      { stage: "LAUNCH", status: "PENDING" },
    ],
    startedAt: ANCHOR - 24 * DAY,
  },
];

const SEED_TASKS: Task[] = [
  {
    id: "task-buzz-web-direction",
    projectId: "proj-buzz",
    stage: "WEBSITE_V1",
    description: "Pick the visual direction for buzz.xyz",
    options: [
      { id: "A", label: "Editorial / serif", description: "Calm, paper-like reading-first feed.", votes: 18_300 },
      { id: "B", label: "Dense terminal", description: "Mono, green-on-black, density-maxing.", votes: 31_500 },
      { id: "C", label: "Honey glass", description: "Soft amber glass, motion-heavy, premium.", votes: 27_900 },
    ],
    status: "ACTIVE",
    votingEnd: ANCHOR + 14 * HOUR,
  },
  {
    id: "task-buzz-copy",
    projectId: "proj-buzz",
    stage: "WEBSITE_V1",
    description: "Choose the homepage tagline",
    options: [
      { id: "A", label: '"Where the swarm talks."', description: "Identity-first.", votes: 9_300 },
      { id: "B", label: '"Crypto-native group chat."', description: "Functional.", votes: 14_100 },
      { id: "C", label: '"Telegram, but you actually own it."', description: "Pointed.", votes: 22_700 },
    ],
    status: "ACTIVE",
    votingEnd: ANCHOR + 38 * HOUR,
  },
  {
    id: "task-meadow-logo",
    projectId: "proj-meadow",
    stage: "IDENTITY",
    description: "Pick the Meadow mark",
    options: [
      { id: "A", label: "Hex bloom", description: "Interlocking hexagons.", votes: 12_400 },
      { id: "B", label: "Drip serif M", description: "Honey-drip serif M.", votes: 8_200 },
      { id: "C", label: "Comb gradient", description: "Layered comb gradient.", votes: 17_800 },
    ],
    status: "ACTIVE",
    votingEnd: ANCHOR + 22 * HOUR,
  },
  {
    id: "task-forager-priority",
    projectId: "proj-drone",
    stage: "PRODUCT_DESIGN",
    description: "What ships in v1?",
    options: [
      { id: "A", label: "Read-only research agent", description: "Summaries + alerts only.", votes: 11_900 },
      { id: "B", label: "Trading agent w/ multisig veto", description: "Live trades behind multisig.", votes: 9_400 },
      { id: "C", label: "Governance agent", description: "Votes on behalf of stakers.", votes: 6_700 },
    ],
    status: "ACTIVE",
    votingEnd: ANCHOR + 30 * HOUR,
  },
];

const SEED_SWARM: SwarmEntry[] = Array.from({ length: 12 }, (_, i) => {
  const r = (n: number) => ((Math.sin(i * 73 + n) + 1) / 2);
  const address =
    "0x" +
    Array.from({ length: 20 }, (__, j) =>
      ((i * 41 + j * 17 + 11) & 0xff).toString(16).padStart(2, "0"),
    ).join("");
  return {
    address,
    votesCast: 80 + Math.round(r(1) * 220),
    accuracy: Math.round((0.55 + r(2) * 0.4) * 100),
    influence: Math.round(50 + r(3) * 950) * 10,
    rank: i + 1,
  };
}).sort((a, b) => b.influence - a.influence)
  .map((e, i) => ({ ...e, rank: i + 1 }));

// ──────────────────────────────────────────────────────────────────────────
// External store (useSyncExternalStore-compatible)

type State = {
  ideas: Idea[];
  proposals: Proposal[];
  projects: Project[];
  tasks: Task[];
  swarm: SwarmEntry[];
  // map of "vote-key" -> the user's choice. vote-key = `${type}:${id}`.
  myVotes: Record<string, string>;
};

const KEY = "hive.incubator.v1";

function freshState(): State {
  return {
    ideas: SEED_IDEAS,
    proposals: SEED_PROPOSALS,
    projects: SEED_PROJECTS,
    tasks: SEED_TASKS,
    swarm: SEED_SWARM,
    myVotes: {},
  };
}

let state: State = freshState();
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
  if (typeof window !== "undefined") {
    try {
      // Persist only the user's votes — seed data is recomputed on reload.
      localStorage.setItem(KEY, JSON.stringify({ myVotes: state.myVotes }));
    } catch {}
  }
}

function hydrate() {
  if (typeof window === "undefined") return;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as { myVotes?: Record<string, string> };
    if (parsed.myVotes) state = { ...state, myVotes: parsed.myVotes };
  } catch {}
}

let hydrated = false;
export function ensureHydrated() {
  if (hydrated) return;
  hydrated = true;
  hydrate();
}

export function getState(): State {
  return state;
}

export function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

// ──────────────────────────────────────────────────────────────────────────
// Mutations

const VOTING_POWER = 5_000; // mock voting power per swipe

export function voteOnProposal(
  proposalId: string,
  choice: "yes" | "no" | "abstain",
) {
  const key = `proposal:${proposalId}`;
  if (state.myVotes[key]) return;
  state = {
    ...state,
    proposals: state.proposals.map((p) =>
      p.id !== proposalId
        ? p
        : {
            ...p,
            yes: p.yes + (choice === "yes" ? VOTING_POWER : 0),
            no: p.no + (choice === "no" ? VOTING_POWER : 0),
            abstain: p.abstain + (choice === "abstain" ? VOTING_POWER : 0),
            participants: p.participants + 1,
          },
    ),
    myVotes: { ...state.myVotes, [key]: choice },
  };
  emit();
}

export function rejectIdea(ideaId: string) {
  const key = `idea:${ideaId}`;
  if (state.myVotes[key]) return;
  state = {
    ...state,
    ideas: state.ideas.map((i) =>
      i.id !== ideaId ? i : { ...i, status: "REJECTED" as const },
    ),
    myVotes: { ...state.myVotes, [key]: "reject" },
  };
  emit();
}

export function approveIdea(ideaId: string) {
  // Promotes a PENDING idea into ACTIVE_VOTE with a fresh proposal.
  const idea = state.ideas.find((i) => i.id === ideaId);
  if (!idea || idea.status !== "PENDING") return;
  const propId = `prop-${ideaId}`;
  const now = Date.now();
  const newProposal: Proposal = {
    id: propId,
    ideaId,
    votingStart: now,
    votingEnd: now + 24 * HOUR,
    yes: 0,
    no: 0,
    abstain: 0,
    participants: 0,
    threshold: 100_000,
    status: "ACTIVE",
  };
  state = {
    ...state,
    ideas: state.ideas.map((i) =>
      i.id !== ideaId ? i : { ...i, status: "ACTIVE_VOTE", proposalId: propId },
    ),
    proposals: [newProposal, ...state.proposals],
    myVotes: { ...state.myVotes, [`idea:${ideaId}`]: "approve" },
  };
  emit();
}

export function voteOnTask(taskId: string, optionId: string) {
  const key = `task:${taskId}`;
  if (state.myVotes[key]) return;
  state = {
    ...state,
    tasks: state.tasks.map((t) =>
      t.id !== taskId
        ? t
        : {
            ...t,
            options: t.options.map((o) =>
              o.id !== optionId ? o : { ...o, votes: o.votes + VOTING_POWER },
            ),
          },
    ),
    myVotes: { ...state.myVotes, [key]: optionId },
  };
  emit();
}

// ──────────────────────────────────────────────────────────────────────────
// Helpers

export function totalVotes(p: Proposal): number {
  return p.yes + p.no + p.abstain;
}

export function quorumMet(p: Proposal): boolean {
  return totalVotes(p) >= p.threshold;
}

export function passing(p: Proposal): boolean {
  const t = totalVotes(p);
  if (t === 0) return false;
  return p.yes / t >= 0.6 && quorumMet(p);
}

export function fmtAddress(a: string) {
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

export function fmtNum(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

export function categoryAccent(c: Category): string {
  // returns a tailwind background class hint
  switch (c) {
    case "consumer":
      return "from-honey-soft/40 to-honey/20";
    case "defi":
      return "from-honey/40 to-honey-dark/30";
    case "infra":
      return "from-honey-glow/30 to-honey/20";
    case "social":
      return "from-honey-soft/40 to-honey-glow/20";
    case "tooling":
      return "from-honey-dark/30 to-honey/15";
  }
}
