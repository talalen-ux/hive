import { useEffect, useMemo, useSyncExternalStore } from "react";
import {
  approveIdea as mockApproveIdea,
  ensureHydrated,
  getState,
  rejectIdea as mockRejectIdea,
  subscribe,
  voteOnProposal as mockVoteOnProposal,
  voteOnTask as mockVoteOnTask,
} from "@/lib/incubator";
import {
  useGovernorActions,
  useGovernorIncubator,
} from "./useGovernor";

export function useIncubator() {
  useEffect(() => {
    ensureHydrated();
  }, []);
  const mock = useSyncExternalStore(subscribe, getState, getState);
  const onchain = useGovernorIncubator();

  return useMemo(() => {
    if (!onchain.enabled) return mock;

    // Merge: keep mock projects + swarm (still off-chain in slice 2);
    // override ideas/proposals/tasks with on-chain values.
    return {
      ...mock,
      ideas: onchain.ideas.length > 0 ? onchain.ideas : mock.ideas,
      proposals: onchain.proposals.length > 0 ? onchain.proposals : mock.proposals,
      tasks: onchain.tasks.length > 0 ? onchain.tasks : mock.tasks,
      myVotes: { ...mock.myVotes, ...onchain.myVotes },
    };
  }, [mock, onchain.enabled, onchain.ideas, onchain.proposals, onchain.tasks, onchain.myVotes]);
}

/** Re-render every `intervalMs` so countdowns refresh smoothly. */
export function useTick(intervalMs = 1000) {
  const subscribe_ = (cb: () => void) => {
    const id = setInterval(cb, intervalMs);
    return () => clearInterval(id);
  };
  return useSyncExternalStore(
    subscribe_,
    () => Date.now(),
    () => 0,
  );
}

/**
 * Action layer the UI components call into. When the governor is configured
 * on the connected chain, these dispatch on-chain transactions; otherwise
 * they fall back to the local mock store so the experience works offline.
 */
export function useIncubatorActions() {
  const gov = useGovernorActions();

  return {
    isPending: gov.isPending,
    onchain: gov.enabled,

    voteOnProposal: async (proposalId: string, choice: "yes" | "no" | "abstain") => {
      if (gov.enabled) {
        const n = parseProposalId(proposalId);
        const code = choice === "yes" ? 1 : choice === "no" ? 2 : 3;
        await gov.voteOnProposal(n, code as 1 | 2 | 3);
      } else {
        mockVoteOnProposal(proposalId, choice);
      }
    },
    voteOnTask: async (taskId: string, optionLetter: string) => {
      if (gov.enabled) {
        const n = parseTaskId(taskId);
        const optIdx = optionLetter.charCodeAt(0) - 64; // "A" → 1
        await gov.voteOnTask(n, optIdx);
      } else {
        mockVoteOnTask(taskId, optionLetter);
      }
    },
    finalizeProposal: async (proposalId: string) => {
      if (!gov.enabled) return; // no-op in mock mode
      await gov.finalizeProposal(parseProposalId(proposalId));
    },
    finalizeTask: async (taskId: string) => {
      if (!gov.enabled) return;
      await gov.finalizeTask(parseTaskId(taskId));
    },
    approveIdea: (ideaId: string) => mockApproveIdea(ideaId),
    rejectIdea: (ideaId: string) => mockRejectIdea(ideaId),
  };
}

function parseProposalId(id: string): number {
  const m = /^prop-(\d+)$/.exec(id);
  if (!m) throw new Error(`bad on-chain proposal id: ${id}`);
  return Number(m[1]);
}

function parseTaskId(id: string): number {
  const m = /^task-(\d+)$/.exec(id);
  if (!m) throw new Error(`bad on-chain task id: ${id}`);
  return Number(m[1]);
}
