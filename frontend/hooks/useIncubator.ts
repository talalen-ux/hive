import { useEffect, useMemo, useSyncExternalStore } from "react";
import {
  approveIdea as mockApproveIdea,
  ensureHydrated,
  finalizeMaturedCommunityProposals,
  getState,
  rejectIdea as mockRejectIdea,
  subscribe,
  voteOnProposal as mockVoteOnProposal,
  voteOnTask as mockVoteOnTask,
  submitProposal as mockSubmitProposal,
  voteOnCommunityProposal as mockVoteOnCommunity,
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

  // Lazy maturation: every render past a closed voting window finalises any
  // community proposal whose deadline has elapsed (no scheduler needed).
  useEffect(() => {
    finalizeMaturedCommunityProposals();
  }, [mock]);

  return useMemo(() => {
    if (!onchain.enabled) return mock;
    return {
      ...mock,
      ideas: onchain.ideas.length > 0 ? onchain.ideas : mock.ideas,
      proposals: onchain.proposals.length > 0 ? onchain.proposals : mock.proposals,
      tasks: onchain.tasks.length > 0 ? onchain.tasks : mock.tasks,
      // On-chain community proposals carry a keccak'd projectKey rather
      // than the FE project id. The project detail page does its own
      // keccak match, so we just append. Mock entries (with FE project
      // ids like "proj-buzz") still render alongside.
      communityProposals: [
        ...mock.communityProposals,
        ...onchain.communityProposals,
      ],
      myVotes: { ...mock.myVotes, ...onchain.myVotes },
    };
  }, [
    mock,
    onchain.enabled,
    onchain.ideas,
    onchain.proposals,
    onchain.tasks,
    onchain.communityProposals,
    onchain.myVotes,
  ]);
}

// ────────── stable tick clock for countdowns ──────────
//
// Module-scoped subscribers and a single setInterval. `useSyncExternalStore`
// requires `subscribe` to have stable identity across renders — the previous
// implementation created a fresh closure on every render, which tore down and
// re-armed the interval continuously and caused hard-to-trace re-render
// storms once enough Countdown components mounted.

const tickListeners = new Set<() => void>();
let tickTimer: ReturnType<typeof setInterval> | null = null;
let tickNow = 0;

function ensureTickRunning() {
  if (tickTimer !== null) return;
  // Single 1Hz interval shared by every subscriber. A monotonic counter
  // (rather than Date.now()) makes the snapshot strictly increasing so React
  // always reads a different value and never gets fooled into bailing out.
  tickTimer = setInterval(() => {
    tickNow += 1;
    tickListeners.forEach((l) => l());
  }, 1000);
}

function tickSubscribe(cb: () => void): () => void {
  tickListeners.add(cb);
  ensureTickRunning();
  return () => {
    tickListeners.delete(cb);
    if (tickListeners.size === 0 && tickTimer !== null) {
      clearInterval(tickTimer);
      tickTimer = null;
    }
  };
}
const getTickSnapshot = () => tickNow;
const getTickServerSnapshot = () => 0;

/** Re-render every second so consumers (Countdown) refresh smoothly. */
export function useTick() {
  return useSyncExternalStore(tickSubscribe, getTickSnapshot, getTickServerSnapshot);
}

/**
 * Action layer the UI components call into. When the governor is configured
 * on the connected chain, these dispatch on-chain transactions; otherwise
 * they fall back to the local mock store. Mock-mode IDs (e.g. `prop-idea-1`)
 * never go on-chain — the parser short-circuits and we route them to the
 * mock store transparently.
 */
export function useIncubatorActions() {
  const gov = useGovernorActions();

  return {
    isPending: gov.isPending,
    onchain: gov.enabled,

    voteOnProposal: async (proposalId: string, choice: "yes" | "no" | "abstain") => {
      const n = onchainIdOrNull(proposalId, "prop");
      if (gov.enabled && n !== null) {
        const code = choice === "yes" ? 1 : choice === "no" ? 2 : 3;
        await gov.voteOnProposal(n, code as 1 | 2 | 3);
      } else {
        mockVoteOnProposal(proposalId, choice);
      }
    },
    voteOnTask: async (taskId: string, optionLetter: string) => {
      const n = onchainIdOrNull(taskId, "task");
      if (gov.enabled && n !== null) {
        const optIdx = optionLetter.charCodeAt(0) - 64; // "A" → 1
        await gov.voteOnTask(n, optIdx);
      } else {
        mockVoteOnTask(taskId, optionLetter);
      }
    },
    finalizeProposal: async (proposalId: string) => {
      const n = onchainIdOrNull(proposalId, "prop");
      if (!gov.enabled || n === null) return;
      await gov.finalizeProposal(n);
    },
    finalizeTask: async (taskId: string) => {
      const n = onchainIdOrNull(taskId, "task");
      if (!gov.enabled || n === null) return;
      await gov.finalizeTask(n);
    },
    approveIdea: (ideaId: string) => mockApproveIdea(ideaId),
    rejectIdea: (ideaId: string) => mockRejectIdea(ideaId),

    /**
     * Submit a community proposal. On-chain when the governor is wired AND
     * the user has at least minProposeStake of HIVE staked (the contract
     * enforces this — we surface the revert as a returned error rather
     * than throw out of the action layer). Falls back to mock store.
     *
     * Voting window is fixed at 24h and threshold at 1 wei (the contract
     * just requires non-zero); production governance would tune both off
     * the live totalStaked.
     */
    submitCommunityProposal: async (input: {
      projectId: string;
      title: string;
      description: string;
      submitter: string;
    }): Promise<{ id: string } | { error: string }> => {
      if (gov.enabled) {
        const votingEnd = BigInt(Math.floor(Date.now() / 1000) + 24 * 60 * 60 + 5 * 60);
        try {
          await gov.submitCommunity({
            projectId: input.projectId,
            title: input.title,
            description: input.description,
            votingEndUnixSec: votingEnd,
            threshold: 1n,
          });
          return { id: "onchain" };
        } catch (e) {
          return { error: e instanceof Error ? e.message : String(e) };
        }
      }
      return mockSubmitProposal(input);
    },
    voteOnCommunityProposal: async (id: string, choice: "yes" | "no" | "abstain") => {
      const n = onchainCommunityIdOrNull(id);
      if (gov.enabled && n !== null) {
        const code = choice === "yes" ? 1 : choice === "no" ? 2 : 3;
        await gov.voteOnCommunity(n, code as 1 | 2 | 3);
      } else {
        mockVoteOnCommunity(id, choice);
      }
    },
    finalizeCommunity: async (id: string) => {
      const n = onchainCommunityIdOrNull(id);
      if (!gov.enabled || n === null) return;
      await gov.finalizeCommunity(n);
    },

    /**
     * Submit a project idea (community-callable). Goes on-chain via
     * createProposal when the governor is wired and the user clears the
     * minProposeStake bar. No mock fallback for now — community ideas
     * land in the same on-chain proposals map as AI-generated ones.
     */
    submitProjectIdea: async (params: {
      title: string;
      description: string;
      category: string;
      buildTime: string;
      complexity: number;
      marketPotential: number;
    }): Promise<{ ok: true } | { error: string }> => {
      if (!gov.enabled) {
        return { error: "Governor not configured on this chain." };
      }
      const votingEnd = BigInt(Math.floor(Date.now() / 1000) + 24 * 60 * 60 + 5 * 60);
      try {
        await gov.submitProjectIdea({
          ...params,
          votingEndUnixSec: votingEnd,
          threshold: 1n,
        });
        return { ok: true };
      } catch (e) {
        return { error: e instanceof Error ? e.message : String(e) };
      }
    },

    /**
     * Submit a multi-option task (community-callable). Used for naming
     * votes (Buzz / Hum / Comb) and any other A/B/C-style decision.
     */
    submitTask: async (params: {
      projectId: string;
      description: string;
      stage: number;
      options: { label: string; description: string }[];
    }): Promise<{ ok: true } | { error: string }> => {
      if (!gov.enabled) {
        return { error: "Governor not configured on this chain." };
      }
      if (params.options.length < 2) {
        return { error: "Need at least two options." };
      }
      const votingEnd = BigInt(Math.floor(Date.now() / 1000) + 24 * 60 * 60 + 5 * 60);
      try {
        await gov.submitTask({
          ...params,
          votingEndUnixSec: votingEnd,
          threshold: 1n,
        });
        return { ok: true };
      } catch (e) {
        return { error: e instanceof Error ? e.message : String(e) };
      }
    },
  };
}

/**
 * Returns the numeric on-chain id for a `prop-N` / `task-N` string, or null
 * if the id is mock-only (e.g. `prop-idea-3` synthesised by `approveIdea` in
 * the local store). Components stay agnostic — they just call into actions
 * with whatever id they have.
 */
function onchainIdOrNull(id: string, prefix: "prop" | "task"): number | null {
  const m = new RegExp(`^${prefix}-(\\d+)$`).exec(id);
  return m ? Number(m[1]) : null;
}

function onchainCommunityIdOrNull(id: string): number | null {
  const m = /^comm-onchain-(\d+)$/.exec(id);
  return m ? Number(m[1]) : null;
}
