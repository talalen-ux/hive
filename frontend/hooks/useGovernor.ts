import { useMemo } from "react";
import { useAccount, useChainId, useReadContracts, useWriteContract } from "wagmi";
import { keccak256, toBytes, type Hex } from "viem";
import { GOVERNOR_ABI } from "@/lib/abis";
import { getAddresses, hasGovernor } from "@/lib/addresses";
import type {
  CommunityProposal,
  Idea,
  IdeaStatus,
  Proposal,
  ProjectStage,
  Task,
  TaskOption,
} from "@/lib/incubator";
import { STAGE_ORDER } from "@/lib/incubator";

/** Per-render fan-out cap. Keeps the eth_call payload bounded as the governor
 *  scales. Beyond this, paginate or upgrade to a subgraph in slice 3.5. */
const MAX_PROPOSAL_READS = 50;
const MAX_TASK_READS = 50;
const MAX_COMMUNITY_READS = 50;

/**
 * Reads on-chain proposals + tasks + community proposals from HiveGovernor
 * and adapts them into the same shapes the rest of the dapp uses. Falls
 * through to the mock store when the governor address is not configured.
 */
export function useGovernorIncubator() {
  const chainId = useChainId();
  const { address: user } = useAccount();
  const enabled = hasGovernor(chainId);
  const a = getAddresses(chainId);
  const governor = a.governor;

  const counts = useReadContracts({
    allowFailure: true,
    query: { enabled, refetchInterval: 12_000 },
    contracts: enabled
      ? [
          { address: governor, abi: GOVERNOR_ABI, functionName: "proposalCount" },
          { address: governor, abi: GOVERNOR_ABI, functionName: "taskCount" },
          { address: governor, abi: GOVERNOR_ABI, functionName: "communityProposalCount" },
        ]
      : [],
  });

  const proposalCount = Math.min(
    Number((counts.data?.[0]?.result as bigint | undefined) ?? 0n),
    MAX_PROPOSAL_READS,
  );
  const taskCount = Math.min(
    Number((counts.data?.[1]?.result as bigint | undefined) ?? 0n),
    MAX_TASK_READS,
  );
  const communityCount = Math.min(
    Number((counts.data?.[2]?.result as bigint | undefined) ?? 0n),
    MAX_COMMUNITY_READS,
  );

  // proposal struct fan-out
  const proposalReads = useReadContracts({
    allowFailure: true,
    query: { enabled: enabled && proposalCount > 0, refetchInterval: 12_000 },
    contracts: enabled
      ? Array.from({ length: proposalCount }, (_, i) => ({
          address: governor,
          abi: GOVERNOR_ABI,
          functionName: "proposals",
          args: [BigInt(i + 1)],
        }) as const)
      : [],
  });

  const proposalMyVoteReads = useReadContracts({
    allowFailure: true,
    query: { enabled: enabled && proposalCount > 0 && !!user, refetchInterval: 12_000 },
    contracts: enabled && user
      ? Array.from({ length: proposalCount }, (_, i) => ({
          address: governor,
          abi: GOVERNOR_ABI,
          functionName: "proposalVotes",
          args: [BigInt(i + 1), user],
        }) as const)
      : [],
  });

  const taskReads = useReadContracts({
    allowFailure: true,
    query: { enabled: enabled && taskCount > 0, refetchInterval: 12_000 },
    contracts: enabled
      ? Array.from({ length: taskCount }, (_, i) => [
          { address: governor, abi: GOVERNOR_ABI, functionName: "tasks", args: [BigInt(i + 1)] } as const,
          { address: governor, abi: GOVERNOR_ABI, functionName: "taskOptions", args: [BigInt(i + 1)] } as const,
        ]).flat()
      : [],
  });

  const taskMyVoteReads = useReadContracts({
    allowFailure: true,
    query: { enabled: enabled && taskCount > 0 && !!user, refetchInterval: 12_000 },
    contracts: enabled && user
      ? Array.from({ length: taskCount }, (_, i) => ({
          address: governor,
          abi: GOVERNOR_ABI,
          functionName: "taskVotes",
          args: [BigInt(i + 1), user],
        }) as const)
      : [],
  });

  const communityReads = useReadContracts({
    allowFailure: true,
    query: { enabled: enabled && communityCount > 0, refetchInterval: 12_000 },
    contracts: enabled
      ? Array.from({ length: communityCount }, (_, i) => ({
          address: governor,
          abi: GOVERNOR_ABI,
          functionName: "communityProposals",
          args: [BigInt(i + 1)],
        }) as const)
      : [],
  });

  const communityMyVoteReads = useReadContracts({
    allowFailure: true,
    query: { enabled: enabled && communityCount > 0 && !!user, refetchInterval: 12_000 },
    contracts: enabled && user
      ? Array.from({ length: communityCount }, (_, i) => ({
          address: governor,
          abi: GOVERNOR_ABI,
          functionName: "communityVotes",
          args: [BigInt(i + 1), user],
        }) as const)
      : [],
  });

  const { ideas, proposals, myVotes } = useMemo(() => {
    const ideas: Idea[] = [];
    const proposals: Proposal[] = [];
    const myVotes: Record<string, string> = {};
    if (!enabled || !proposalReads.data) return { ideas, proposals, myVotes };

    for (let i = 0; i < proposalCount; i++) {
      const propRaw = proposalReads.data[i]?.result;
      if (!propRaw) continue;
      const id = String(i + 1);
      const p = decodeProposal(propRaw);
      const ideaId = `idea-onchain-${id}`;
      const proposalId = `prop-${id}`;
      ideas.push({
        id: ideaId,
        title: p.title,
        description: p.description,
        category: (p.category || "infra") as Idea["category"],
        complexity: p.complexity,
        marketPotential: p.marketPotential,
        buildTime: p.buildTime || "—",
        status: ideaStatusFor(p.status),
        proposalId,
        generatedAt: p.votingStart * 1000,
      });
      proposals.push({
        id: proposalId,
        ideaId,
        votingStart: p.votingStart * 1000,
        votingEnd: p.votingEnd * 1000,
        yes: Number(p.yes / SCALE),
        no: Number(p.no / SCALE),
        abstain: Number(p.abstain / SCALE),
        participants: p.participants,
        threshold: Number(p.threshold / SCALE),
        status: proposalStatusFor(p.status),
      });
      const myChoice = decodeChoice(proposalMyVoteReads.data?.[i]?.result);
      if (myChoice) myVotes[`proposal:${proposalId}`] = myChoice;
    }
    return { ideas, proposals, myVotes };
  }, [enabled, proposalCount, proposalReads.data, proposalMyVoteReads.data]);

  const { tasks, taskMyVotes } = useMemo(() => {
    const tasks: Task[] = [];
    const taskMyVotes: Record<string, string> = {};
    if (!enabled || !taskReads.data) return { tasks, taskMyVotes };

    for (let i = 0; i < taskCount; i++) {
      const taskRaw = taskReads.data[i * 2]?.result;
      const optsRaw = taskReads.data[i * 2 + 1]?.result;
      if (!taskRaw || !optsRaw) continue;
      const id = i + 1;
      const t = decodeTask(taskRaw);
      const opts = (optsRaw as readonly OnchainOption[]).map((o, idx) => ({
        id: String.fromCharCode(65 + idx),
        label: o.label,
        description: o.description,
        votes: Number(o.votes / SCALE),
      }) satisfies TaskOption);
      const taskId = `task-${id}`;
      tasks.push({
        id: taskId,
        projectId: t.projectKey,
        stage: stageFromIndex(t.stage),
        description: t.description,
        options: opts,
        status: taskStatusFor(t.status),
        votingEnd: Number(t.votingEnd) * 1000,
        decidedOption: t.decidedOption ? String.fromCharCode(64 + t.decidedOption) : undefined,
      });
      const myOption = Number(taskMyVoteReads.data?.[i]?.result ?? 0n);
      if (myOption >= 1) taskMyVotes[`task:${taskId}`] = String.fromCharCode(64 + myOption);
    }
    return { tasks, taskMyVotes };
  }, [enabled, taskCount, taskReads.data, taskMyVoteReads.data]);

  const { communityProposals, communityMyVotes } = useMemo(() => {
    const out: CommunityProposal[] = [];
    const myV: Record<string, string> = {};
    if (!enabled || !communityReads.data) return { communityProposals: out, communityMyVotes: myV };

    for (let i = 0; i < communityCount; i++) {
      const raw = communityReads.data[i]?.result;
      if (!raw) continue;
      const id = i + 1;
      const c = decodeCommunityProposal(raw);
      const cid = `comm-onchain-${id}`;
      // projectKey is keccak256 of the FE project id; reverse-mapping
      // happens off-chain. We pass the raw key through; the project page
      // filters by projectKey === keccak(projectId) before rendering.
      out.push({
        id: cid,
        projectId: c.projectKey,
        title: c.title,
        description: c.description,
        submittedBy: c.submitter,
        submittedAt: c.votingStart * 1000,
        votingEnd: c.votingEnd * 1000,
        yes: Number(c.yes / SCALE),
        no: Number(c.no / SCALE),
        abstain: Number(c.abstain / SCALE),
        participants: c.participants,
        threshold: Number(c.threshold / SCALE),
        status: communityStatusFor(c.status),
        becameTaskId: c.becameTaskId > 0n ? `task-${c.becameTaskId}` : undefined,
      });
      const myChoice = decodeChoice(communityMyVoteReads.data?.[i]?.result);
      if (myChoice) myV[`community:${cid}`] = myChoice;
    }
    return { communityProposals: out, communityMyVotes: myV };
  }, [enabled, communityCount, communityReads.data, communityMyVoteReads.data]);

  const merged: Record<string, string> = useMemo(
    () => ({ ...myVotes, ...taskMyVotes, ...communityMyVotes }),
    [myVotes, taskMyVotes, communityMyVotes],
  );

  return {
    enabled,
    isLoading:
      counts.isLoading ||
      proposalReads.isLoading ||
      taskReads.isLoading ||
      communityReads.isLoading,
    refetch: async () => {
      await Promise.all([
        counts.refetch(),
        proposalReads.refetch(),
        taskReads.refetch(),
        communityReads.refetch(),
      ]);
    },
    ideas,
    proposals,
    tasks,
    communityProposals,
    myVotes: merged,
  };
}

export function useGovernorActions() {
  const chainId = useChainId();
  const a = getAddresses(chainId);
  const { writeContractAsync, isPending } = useWriteContract();

  return {
    isPending,
    enabled: a.governor !== "0x0000000000000000000000000000000000000000",
    voteOnProposal: (proposalNumericId: number, choice: 1 | 2 | 3) =>
      writeContractAsync({
        address: a.governor,
        abi: GOVERNOR_ABI,
        functionName: "vote",
        args: [BigInt(proposalNumericId), choice],
      }),
    voteOnTask: (taskNumericId: number, optionIdx: number) =>
      writeContractAsync({
        address: a.governor,
        abi: GOVERNOR_ABI,
        functionName: "voteTask",
        args: [BigInt(taskNumericId), optionIdx],
      }),
    voteOnCommunity: (communityNumericId: number, choice: 1 | 2 | 3) =>
      writeContractAsync({
        address: a.governor,
        abi: GOVERNOR_ABI,
        functionName: "voteCommunity",
        args: [BigInt(communityNumericId), choice],
      }),
    submitCommunity: (params: {
      projectId: string;
      title: string;
      description: string;
      votingEndUnixSec: bigint;
      threshold: bigint;
    }) =>
      writeContractAsync({
        address: a.governor,
        abi: GOVERNOR_ABI,
        functionName: "submitCommunityProposal",
        args: [
          projectKeyOf(params.projectId),
          params.title,
          params.description,
          params.votingEndUnixSec,
          params.threshold,
        ],
      }),
    submitProjectIdea: (params: {
      title: string;
      description: string;
      category: string;
      buildTime: string;
      complexity: number;
      marketPotential: number;
      votingEndUnixSec: bigint;
      threshold: bigint;
    }) =>
      writeContractAsync({
        address: a.governor,
        abi: GOVERNOR_ABI,
        functionName: "createProposal",
        args: [
          params.title,
          params.description,
          params.category,
          params.buildTime,
          params.complexity,
          params.marketPotential,
          params.votingEndUnixSec,
          params.threshold,
        ],
      }),
    submitTask: (params: {
      projectId: string;
      description: string;
      stage: number;
      options: { label: string; description: string }[];
      votingEndUnixSec: bigint;
      threshold: bigint;
    }) =>
      writeContractAsync({
        address: a.governor,
        abi: GOVERNOR_ABI,
        functionName: "createTask",
        args: [
          projectKeyOf(params.projectId),
          params.description,
          params.stage,
          params.options,
          params.votingEndUnixSec,
          params.threshold,
        ],
      }),
    finalizeProposal: (proposalNumericId: number) =>
      writeContractAsync({
        address: a.governor,
        abi: GOVERNOR_ABI,
        functionName: "finalizeProposal",
        args: [BigInt(proposalNumericId)],
      }),
    finalizeTask: (taskNumericId: number) =>
      writeContractAsync({
        address: a.governor,
        abi: GOVERNOR_ABI,
        functionName: "finalizeTask",
        args: [BigInt(taskNumericId)],
      }),
    finalizeCommunity: (communityNumericId: number) =>
      writeContractAsync({
        address: a.governor,
        abi: GOVERNOR_ABI,
        functionName: "finalizeCommunityProposal",
        args: [BigInt(communityNumericId)],
      }),
  };
}

/** keccak256 of a UTF-8 project id — matches the on-chain projectKey. */
export function projectKeyOf(projectId: string): Hex {
  return keccak256(toBytes(projectId));
}

// ─────────────── on-chain decoders ───────────────

const SCALE = 10n ** 18n;

type OnchainProposal = {
  title: string;
  description: string;
  category: string;
  buildTime: string;
  votingStart: bigint;
  votingEnd: bigint;
  yes: bigint;
  no: bigint;
  abstain: bigint;
  threshold: bigint;
  participants: number;
  complexity: number;
  marketPotential: number;
  status: number;
  submitter: `0x${string}`;
};

type OnchainTask = {
  projectKey: `0x${string}`;
  description: string;
  votingStart: bigint;
  votingEnd: bigint;
  threshold: bigint;
  totalVotes: bigint;
  stage: number;
  optionCount: number;
  status: number;
  decidedOption: number;
  submitter: `0x${string}`;
};

type OnchainCommunity = {
  projectKey: `0x${string}`;
  submitter: `0x${string}`;
  title: string;
  description: string;
  votingStart: bigint;
  votingEnd: bigint;
  yes: bigint;
  no: bigint;
  abstain: bigint;
  threshold: bigint;
  participants: number;
  status: number;
  becameTaskId: bigint;
};

type OnchainOption = { label: string; description: string; votes: bigint };

function decodeProposal(raw: unknown) {
  const o = raw as OnchainProposal;
  return {
    title: o.title,
    description: o.description,
    category: o.category,
    buildTime: o.buildTime,
    complexity: o.complexity,
    marketPotential: o.marketPotential,
    votingStart: Number(o.votingStart),
    votingEnd: Number(o.votingEnd),
    yes: o.yes,
    no: o.no,
    abstain: o.abstain,
    threshold: o.threshold,
    participants: Number(o.participants),
    status: o.status,
    submitter: o.submitter,
  };
}

function decodeTask(raw: unknown): OnchainTask {
  return raw as OnchainTask;
}

function decodeCommunityProposal(raw: unknown) {
  const o = raw as OnchainCommunity;
  return {
    projectKey: o.projectKey,
    submitter: o.submitter,
    title: o.title,
    description: o.description,
    votingStart: Number(o.votingStart),
    votingEnd: Number(o.votingEnd),
    yes: o.yes,
    no: o.no,
    abstain: o.abstain,
    threshold: o.threshold,
    participants: Number(o.participants),
    status: o.status,
    becameTaskId: o.becameTaskId,
  };
}

function decodeChoice(raw: unknown): "yes" | "no" | "abstain" | undefined {
  const n = Number(raw ?? 0);
  if (n === 1) return "yes";
  if (n === 2) return "no";
  if (n === 3) return "abstain";
  return undefined;
}

function ideaStatusFor(s: number): IdeaStatus {
  if (s === 1) return "APPROVED";
  if (s === 2) return "REJECTED";
  return "ACTIVE_VOTE";
}

function proposalStatusFor(s: number): Proposal["status"] {
  if (s === 1) return "PASSED";
  if (s === 2) return "REJECTED";
  return "ACTIVE";
}

function taskStatusFor(s: number): Task["status"] {
  if (s === 1) return "DECIDED";
  if (s === 2) return "PENDING";
  return "ACTIVE";
}

function communityStatusFor(s: number): CommunityProposal["status"] {
  if (s === 1) return "PASSED";
  if (s === 2) return "REJECTED";
  return "ACTIVE";
}

function stageFromIndex(i: number): ProjectStage {
  return STAGE_ORDER[i] ?? "INITIATION";
}
