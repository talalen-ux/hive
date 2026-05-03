/**
 * Slice-1 incubator mock data + in-memory store.
 *
 * Replaces an eventual on-chain governor + AI generator service. Every type
 * here mirrors the on-chain shape we'll write in slice 2 so the UI doesn't
 * need to change when we swap the backing store.
 */

export const CATEGORIES = ["consumer", "defi", "infra", "social", "tooling"] as const;
export type Category = (typeof CATEGORIES)[number];
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
  /** Set when this task was promoted from a passed community proposal. */
  fromProposalId?: string;
};

export type CommunityProposal = {
  id: string;
  projectId: string;
  title: string;
  description: string;
  /** Wallet that submitted the proposal. */
  submittedBy: string;
  submittedAt: number;
  votingEnd: number;
  yes: number;
  no: number;
  abstain: number;
  participants: number;
  threshold: number;
  status: "ACTIVE" | "PASSED" | "REJECTED";
  /** Populated when the proposal passes and is promoted to a task. */
  becameTaskId?: string;
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

// Community proposals — submitted by token holders (mock layer until the
// contract grows a non-oracle createProposal path). On pass they are
// promoted to a project task.
const SEED_COMMUNITY_PROPOSALS: CommunityProposal[] = [
  {
    id: "comm-buzz-voice",
    projectId: "proj-buzz",
    title: "Add native voice rooms to v1",
    description:
      "Browser-native voice rooms with token-gated entry. Discord stops being the default; rooms inherit Buzz's reputation graph.",
    submittedBy: synthAddr(11),
    submittedAt: ANCHOR - 18 * HOUR,
    votingEnd: ANCHOR + 6 * HOUR,
    yes: 47_400,
    no: 9_100,
    abstain: 2_300,
    participants: 64,
    threshold: 100_000,
    status: "ACTIVE",
  },
  {
    id: "comm-buzz-mod",
    projectId: "proj-buzz",
    title: "Self-hosted mod nodes per room",
    description:
      "Each major room runs its own mod logic on a small VPS. Not federated — transparent, replaceable, and signed by the room owner.",
    submittedBy: synthAddr(12),
    submittedAt: ANCHOR - 6 * HOUR,
    votingEnd: ANCHOR + 18 * HOUR,
    yes: 12_500,
    no: 6_200,
    abstain: 1_400,
    participants: 19,
    threshold: 100_000,
    status: "ACTIVE",
  },
  {
    id: "comm-meadow-base",
    projectId: "proj-meadow",
    title: "Whitelist Aerodrome on Base for v1 routing",
    description:
      "Highest TVL on an L2 outside Uniswap. v1 launching without it leaves yield on the table.",
    submittedBy: synthAddr(13),
    submittedAt: ANCHOR - 30 * HOUR,
    votingEnd: ANCHOR - 6 * HOUR,
    yes: 142_000,
    no: 16_300,
    abstain: 4_100,
    participants: 89,
    threshold: 100_000,
    status: "PASSED",
    becameTaskId: "task-meadow-aerodrome",
  },
  {
    id: "comm-forager-veto",
    projectId: "proj-drone",
    title: "30-second multisig veto window on every action",
    description:
      "Every agent action queues for 30 seconds before execution; any multisig signer can veto. Predictable safety bar.",
    submittedBy: synthAddr(14),
    submittedAt: ANCHOR - 8 * HOUR,
    votingEnd: ANCHOR + 16 * HOUR,
    yes: 33_700,
    no: 11_400,
    abstain: 6_900,
    participants: 41,
    threshold: 100_000,
    status: "ACTIVE",
  },
];

function synthAddr(i: number): string {
  const hex = (n: number) => n.toString(16).padStart(2, "0");
  let out = "0x";
  for (let j = 0; j < 20; j++) {
    out += hex((i * 41 + j * 17 + 11) & 0xff);
  }
  return out;
}

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
  communityProposals: CommunityProposal[];
  // map of "vote-key" -> the user's choice. vote-key = `${type}:${id}`.
  // For community proposals the key is `community:${id}`.
  myVotes: Record<string, string>;
  /** Wallets whose user-submitted proposals persist across reload. */
  myProposals: string[];
};

const KEY = "hive.incubator.v1";

function freshState(): State {
  return {
    ideas: SEED_IDEAS,
    proposals: SEED_PROPOSALS,
    projects: SEED_PROJECTS,
    tasks: SEED_TASKS,
    swarm: SEED_SWARM,
    communityProposals: SEED_COMMUNITY_PROPOSALS,
    myVotes: {},
    myProposals: [],
  };
}

let state: State = freshState();
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
  if (typeof window !== "undefined") {
    try {
      // Persist user-controlled additions: votes + their submitted proposals.
      // Everything else is seed data and recomputed on reload.
      const userProposals = state.communityProposals.filter((p) =>
        state.myProposals.includes(p.id),
      );
      localStorage.setItem(
        KEY,
        JSON.stringify({
          myVotes: state.myVotes,
          myProposals: state.myProposals,
          userProposals,
        }),
      );
    } catch {}
  }
}

function hydrate() {
  if (typeof window === "undefined") return;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as {
      myVotes?: Record<string, string>;
      myProposals?: string[];
      userProposals?: CommunityProposal[];
    };
    let next = state;
    if (parsed.myVotes) next = { ...next, myVotes: parsed.myVotes };
    if (parsed.myProposals) next = { ...next, myProposals: parsed.myProposals };
    if (parsed.userProposals && parsed.userProposals.length > 0) {
      // Merge user-submitted proposals back in. Existing seed entries with
      // the same id are kept (seed wins) so a stale localStorage doesn't
      // clobber the demo seed.
      const existing = new Set(next.communityProposals.map((p) => p.id));
      const merged = next.communityProposals.concat(
        parsed.userProposals.filter((p) => !existing.has(p.id)),
      );
      next = { ...next, communityProposals: merged };
    }
    state = next;
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
// Community proposals

const COMMUNITY_VOTING_HOURS = 24;
const COMMUNITY_THRESHOLD = 100_000;
const COMMUNITY_PASS_RATIO = 0.6; // 60% YES of (yes + no)

/**
 * Submit a new community proposal scoped to a project. Returns the new
 * proposal's id. Caller should already have checked that `submitter` is a
 * connected wallet — the store does not enforce permissioning since on-chain
 * staker-eligibility lives in the contract layer.
 */
export function submitProposal(input: {
  projectId: string;
  title: string;
  description: string;
  submitter: string;
}): { id: string } | { error: string } {
  const title = input.title.trim();
  const description = input.description.trim();
  if (title.length < 5) return { error: "Title needs at least 5 characters." };
  if (title.length > 80) return { error: "Title must be 80 characters or fewer." };
  if (description.length < 20)
    return { error: "Description needs at least 20 characters." };
  if (description.length > 500)
    return { error: "Description must be 500 characters or fewer." };
  if (!state.projects.find((p) => p.id === input.projectId))
    return { error: "Unknown project." };

  const now = Date.now();
  const id = `comm-user-${now.toString(36)}`;
  const proposal: CommunityProposal = {
    id,
    projectId: input.projectId,
    title,
    description,
    submittedBy: input.submitter,
    submittedAt: now,
    votingEnd: now + COMMUNITY_VOTING_HOURS * HOUR,
    yes: 0,
    no: 0,
    abstain: 0,
    participants: 0,
    threshold: COMMUNITY_THRESHOLD,
    status: "ACTIVE",
  };
  state = {
    ...state,
    communityProposals: [proposal, ...state.communityProposals],
    myProposals: [id, ...state.myProposals],
  };
  emit();
  return { id };
}

export function voteOnCommunityProposal(
  proposalId: string,
  choice: "yes" | "no" | "abstain",
) {
  const key = `community:${proposalId}`;
  if (state.myVotes[key]) return;
  const target = state.communityProposals.find((p) => p.id === proposalId);
  if (!target || target.status !== "ACTIVE") return;
  if (Date.now() >= target.votingEnd) return;

  state = {
    ...state,
    communityProposals: state.communityProposals.map((p) =>
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

/**
 * Walk all ACTIVE community proposals whose voting window has closed and
 * finalise them. Passing proposals are promoted to tasks on their project
 * (status DECIDED, no options — the action item is the description). This
 * is invoked from `useIncubator()` so finalisation happens lazily on the
 * next render after a window closes; no separate scheduler needed.
 */
export function finalizeMaturedCommunityProposals() {
  const now = Date.now();
  const matured = state.communityProposals.filter(
    (p) => p.status === "ACTIVE" && p.votingEnd <= now,
  );
  if (matured.length === 0) return;

  const newTasks: Task[] = [];
  const updatedProposals = state.communityProposals.map((p) => {
    if (p.status !== "ACTIVE" || p.votingEnd > now) return p;
    const total = p.yes + p.no + p.abstain;
    const binary = p.yes + p.no;
    const passes =
      total >= p.threshold &&
      binary > 0 &&
      p.yes / binary >= COMMUNITY_PASS_RATIO;
    if (!passes) return { ...p, status: "REJECTED" as const };

    const project = state.projects.find((pr) => pr.id === p.projectId);
    const stage: ProjectStage = project?.currentStage ?? "INITIATION";
    const taskId = `task-from-${p.id}`;
    newTasks.push({
      id: taskId,
      projectId: p.projectId,
      stage,
      description: p.title,
      options: [],
      status: "DECIDED",
      votingEnd: p.votingEnd,
      fromProposalId: p.id,
    });
    return { ...p, status: "PASSED" as const, becameTaskId: taskId };
  });

  state = {
    ...state,
    communityProposals: updatedProposals,
    tasks: [...state.tasks, ...newTasks],
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

export function communityTotal(p: CommunityProposal): number {
  return p.yes + p.no + p.abstain;
}

export function communityQuorumMet(p: CommunityProposal): boolean {
  return communityTotal(p) >= p.threshold;
}

export function communityPassing(p: CommunityProposal): boolean {
  const binary = p.yes + p.no;
  if (binary === 0) return false;
  return p.yes / binary >= COMMUNITY_PASS_RATIO && communityQuorumMet(p);
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
