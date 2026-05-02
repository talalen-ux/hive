import { useMemo } from "react";
import { useAccount, useChainId, useReadContract, useReadContracts, useWriteContract } from "wagmi";
import { type Address } from "viem";
import { GOVERNOR_ABI } from "@/lib/abis";
import { getAddresses, hasGovernor } from "@/lib/addresses";
import type {
  Idea,
  IdeaStatus,
  Proposal,
  ProjectStage,
  Task,
  TaskOption,
} from "@/lib/incubator";
import { STAGE_ORDER } from "@/lib/incubator";

/**
 * Reads on-chain proposals + tasks from HiveGovernor and adapts them into the
 * same shape the rest of the dapp uses. Falls through to the mock store when
 * the governor address is not configured for the current chain.
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
        ]
      : [],
  });

  const proposalCount = Number((counts.data?.[0]?.result as bigint | undefined) ?? 0n);
  const taskCount = Number((counts.data?.[1]?.result as bigint | undefined) ?? 0n);

  const proposalIds = useMemo(
    () => Array.from({ length: proposalCount }, (_, i) => BigInt(i + 1)),
    [proposalCount],
  );
  const taskIds = useMemo(
    () => Array.from({ length: taskCount }, (_, i) => BigInt(i + 1)),
    [taskCount],
  );

  // batched reads — for each proposal pull (struct, myVote)
  const proposalReads = useReadContracts({
    allowFailure: true,
    query: { enabled: enabled && proposalCount > 0, refetchInterval: 12_000 },
    contracts: enabled
      ? proposalIds.flatMap((id) => [
          { address: governor, abi: GOVERNOR_ABI, functionName: "proposals", args: [id] } as const,
          {
            address: governor,
            abi: GOVERNOR_ABI,
            functionName: "proposalVotes",
            args: [id, (user ?? "0x0000000000000000000000000000000000000000") as Address],
          } as const,
        ])
      : [],
  });

  const taskReads = useReadContracts({
    allowFailure: true,
    query: { enabled: enabled && taskCount > 0, refetchInterval: 12_000 },
    contracts: enabled
      ? taskIds.flatMap((id) => [
          { address: governor, abi: GOVERNOR_ABI, functionName: "tasks", args: [id] } as const,
          { address: governor, abi: GOVERNOR_ABI, functionName: "taskOptions", args: [id] } as const,
          {
            address: governor,
            abi: GOVERNOR_ABI,
            functionName: "taskVotes",
            args: [id, (user ?? "0x0000000000000000000000000000000000000000") as Address],
          } as const,
        ])
      : [],
  });

  const { ideas, proposals, myVotes } = useMemo(() => {
    const ideas: Idea[] = [];
    const proposals: Proposal[] = [];
    const myVotes: Record<string, string> = {};
    if (!enabled || !proposalReads.data) return { ideas, proposals, myVotes };

    for (let i = 0; i < proposalCount; i++) {
      const propRaw = proposalReads.data[i * 2]?.result;
      const myRaw = proposalReads.data[i * 2 + 1]?.result;
      if (!propRaw) continue;
      const id = String(i + 1);
      const p = decodeProposal(propRaw);
      const ideaId = `idea-${id}`;
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
      const myChoice = decodeChoice(myRaw);
      if (myChoice) myVotes[`proposal:${proposalId}`] = myChoice;
    }
    return { ideas, proposals, myVotes };
  }, [enabled, proposalCount, proposalReads.data]);

  const { tasks, taskMyVotes } = useMemo(() => {
    const tasks: Task[] = [];
    const taskMyVotes: Record<string, string> = {};
    if (!enabled || !taskReads.data) return { tasks, taskMyVotes };

    for (let i = 0; i < taskCount; i++) {
      const taskRaw = taskReads.data[i * 3]?.result;
      const optsRaw = taskReads.data[i * 3 + 1]?.result;
      const myRaw = taskReads.data[i * 3 + 2]?.result;
      if (!taskRaw || !optsRaw) continue;
      const id = i + 1;
      const t = decodeTask(taskRaw);
      const opts = (optsRaw as readonly OnchainOption[]).map((o, idx) => ({
        id: String.fromCharCode(65 + idx), // 1 → "A", 2 → "B"
        label: o.label,
        description: o.description,
        votes: Number(o.votes / SCALE),
      }) satisfies TaskOption);
      const taskId = `task-${id}`;
      tasks.push({
        id: taskId,
        projectId: t.projectKey, // FE side maps key → seeded project
        stage: stageFromIndex(t.stage),
        description: t.description,
        options: opts,
        status: taskStatusFor(t.status),
        votingEnd: Number(t.votingEnd) * 1000,
        decidedOption: t.decidedOption ? String.fromCharCode(64 + t.decidedOption) : undefined,
      });
      const myOption = Number(myRaw ?? 0n);
      if (myOption >= 1) taskMyVotes[`task:${taskId}`] = String.fromCharCode(64 + myOption);
    }
    return { tasks, taskMyVotes };
  }, [enabled, taskCount, taskReads.data]);

  const merged: Record<string, string> = useMemo(
    () => ({ ...myVotes, ...taskMyVotes }),
    [myVotes, taskMyVotes],
  );

  return {
    enabled,
    isLoading: counts.isLoading || proposalReads.isLoading || taskReads.isLoading,
    refetch: async () => {
      await Promise.all([counts.refetch(), proposalReads.refetch(), taskReads.refetch()]);
    },
    ideas,
    proposals,
    tasks,
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
  };
}

// ─────────────── on-chain decoders ───────────────

const SCALE = 10n ** 18n; // weight is 18-decimal HIVE units

type OnchainProposal = {
  title: string;
  description: string;
  category: string;
  buildTime: string;
  complexity: number;
  marketPotential: number;
  votingStart: bigint;
  votingEnd: bigint;
  yes: bigint;
  no: bigint;
  abstain: bigint;
  threshold: bigint;
  participants: number;
  status: number;
};

type OnchainTask = {
  projectKey: `0x${string}`;
  description: string;
  stage: number;
  votingStart: bigint;
  votingEnd: bigint;
  threshold: bigint;
  totalVotes: bigint;
  optionCount: number;
  status: number;
  decidedOption: number;
};

type OnchainOption = { label: string; description: string; votes: bigint };

function decodeProposal(raw: unknown): {
  title: string;
  description: string;
  category: string;
  buildTime: string;
  complexity: number;
  marketPotential: number;
  votingStart: number;
  votingEnd: number;
  yes: bigint;
  no: bigint;
  abstain: bigint;
  threshold: bigint;
  participants: number;
  status: number;
} {
  if (Array.isArray(raw)) {
    const [
      title, description, category, buildTime,
      complexity, marketPotential, votingStart, votingEnd,
      yes, no, abstain, threshold, participants, status,
    ] = raw as [
      string, string, string, string,
      number, number, bigint, bigint,
      bigint, bigint, bigint, bigint, number, number,
    ];
    return {
      title, description, category, buildTime,
      complexity, marketPotential,
      votingStart: Number(votingStart), votingEnd: Number(votingEnd),
      yes, no, abstain, threshold,
      participants: Number(participants), status,
    };
  }
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
  };
}

function decodeTask(raw: unknown): OnchainTask {
  if (Array.isArray(raw)) {
    const [
      projectKey, description, stage, votingStart, votingEnd,
      threshold, totalVotes, optionCount, status, decidedOption,
    ] = raw as [
      `0x${string}`, string, number, bigint, bigint,
      bigint, bigint, number, number, number,
    ];
    return {
      projectKey, description, stage,
      votingStart, votingEnd, threshold, totalVotes,
      optionCount, status, decidedOption,
    };
  }
  return raw as OnchainTask;
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

function stageFromIndex(i: number): ProjectStage {
  return STAGE_ORDER[i] ?? "INITIATION";
}
