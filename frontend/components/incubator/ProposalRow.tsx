import { useState } from "react";
import { motion } from "framer-motion";
import {
  fmtNum,
  passing,
  quorumMet,
  totalVotes,
  type Idea,
  type Proposal,
} from "@/lib/incubator";
import { useIncubator, useIncubatorActions } from "@/hooks/useIncubator";
import { Countdown } from "./Countdown";

export function ProposalRow({
  proposal,
  idea,
}: {
  proposal: Proposal;
  idea: Idea;
}) {
  const state = useIncubator();
  const actions = useIncubatorActions();
  const [busy, setBusy] = useState<string | null>(null);
  const myChoice = state.myVotes[`proposal:${proposal.id}`];

  const [error, setError] = useState<string | null>(null);

  async function cast(choice: "yes" | "no" | "abstain") {
    setBusy(choice);
    setError(null);
    try {
      await actions.voteOnProposal(proposal.id, choice);
    } catch (e) {
      // surface tx rejections / on-chain reverts inline rather than throwing
      // an unhandled rejection out of the click handler
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg.length > 120 ? msg.slice(0, 120) + "…" : msg);
    } finally {
      setBusy(null);
    }
  }

  const total = totalVotes(proposal);
  const yesPct = total > 0 ? proposal.yes / total : 0;
  const noPct = total > 0 ? proposal.no / total : 0;
  const passPct = Math.min(1, total / proposal.threshold);

  return (
    <motion.div
      whileHover={{ y: -2 }}
      className="glass-panel rounded-2xl p-6 transition-shadow hover:shadow-honey"
    >
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider2 text-honey-soft/50">
            <span>{idea.category}</span>
            <span>·</span>
            <span>{idea.buildTime}</span>
          </div>
          <h3 className="mt-1 text-xl font-light text-honey-soft">
            {idea.title}
          </h3>
          <p className="mt-1 text-sm text-honey-soft/65 line-clamp-2">
            {idea.description}
          </p>
        </div>
        <div className="text-right shrink-0">
          <div className="text-[10px] uppercase tracking-wider2 text-honey-soft/50">
            Closes in
          </div>
          <div className="mt-1 text-honey-soft numeric">
            <Countdown end={proposal.votingEnd} />
          </div>
        </div>
      </div>

      {/* yes/no bar */}
      <div className="mt-5">
        <div className="flex h-2 overflow-hidden rounded-full bg-honey/10">
          <motion.div
            className="bg-gradient-to-r from-honey to-honey-glow"
            initial={{ width: 0 }}
            animate={{ width: `${yesPct * 100}%` }}
            transition={{ duration: 0.7, ease: "easeOut" }}
          />
          <motion.div
            className="bg-honey-soft/15"
            initial={{ width: 0 }}
            animate={{ width: `${noPct * 100}%` }}
            transition={{ duration: 0.7, ease: "easeOut" }}
          />
        </div>
        <div className="mt-2 flex items-center justify-between text-[11px] text-honey-soft/55 numeric">
          <span>
            <span className="text-honey-soft">Yes</span>{" "}
            {fmtNum(proposal.yes)} ({(yesPct * 100).toFixed(0)}%)
          </span>
          <span>
            <span className="text-honey-soft/65">No</span>{" "}
            {fmtNum(proposal.no)} ({(noPct * 100).toFixed(0)}%)
          </span>
        </div>
      </div>

      {/* quorum strip */}
      <div className="mt-4">
        <div className="flex items-center justify-between text-[10px] uppercase tracking-wider2 text-honey-soft/50">
          <span>Quorum {quorumMet(proposal) ? "met" : "pending"}</span>
          <span className="numeric">
            {fmtNum(total)} / {fmtNum(proposal.threshold)}
          </span>
        </div>
        <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-honey/5">
          <motion.div
            className="h-full bg-honey/40"
            initial={{ width: 0 }}
            animate={{ width: `${passPct * 100}%` }}
            transition={{ duration: 0.7, ease: "easeOut" }}
          />
        </div>
      </div>

      {/* vote buttons */}
      <div className="mt-5 flex items-center gap-2">
        {(["yes", "no", "abstain"] as const).map((c) => {
          const active = myChoice === c;
          return (
            <motion.button
              key={c}
              whileHover={{ y: -1 }}
              whileTap={{ scale: 0.97 }}
              disabled={!!myChoice || !!busy}
              onClick={() => cast(c)}
              className={`flex-1 rounded-full px-4 py-2 text-[11px] uppercase tracking-wider2 transition-all ${
                active
                  ? "bg-gradient-to-br from-honey-soft to-honey text-ink shadow-honey"
                  : myChoice
                  ? "border border-honey/10 text-honey-soft/35"
                  : "border border-honey/20 text-honey-soft/75 hover:border-honey/45 hover:text-honey-soft"
              }`}
            >
              {busy === c ? "…" : c}
            </motion.button>
          );
        })}
      </div>

      {myChoice && !error && (
        <div className="mt-3 text-center text-[10px] uppercase tracking-wider2 text-honey-soft/50">
          {passing(proposal) ? "Currently passing" : "Currently below threshold"}
        </div>
      )}
      {error && (
        <div className="mt-3 rounded-lg border border-red-400/30 bg-red-400/[0.04] px-3 py-2 text-[11px] text-red-300/80">
          {error}
        </div>
      )}
    </motion.div>
  );
}
