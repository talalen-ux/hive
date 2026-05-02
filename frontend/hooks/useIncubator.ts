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
    return {
      ...mock,
      ideas: onchain.ideas.length > 0 ? onchain.ideas : mock.ideas,
      proposals: onchain.proposals.length > 0 ? onchain.proposals : mock.proposals,
      tasks: onchain.tasks.length > 0 ? onchain.tasks : mock.tasks,
      myVotes: { ...mock.myVotes, ...onchain.myVotes },
    };
  }, [mock, onchain.enabled, onchain.ideas, onchain.proposals, onchain.tasks, onchain.myVotes]);
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
