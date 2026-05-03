import { motion } from "framer-motion";
import { useMemo } from "react";
import Link from "next/link";
import { IdeaFeed } from "@/components/incubator/IdeaFeed";
import { ProposalRow } from "@/components/incubator/ProposalRow";
import { SwarmTable } from "@/components/incubator/SwarmTable";
import { SubmitProjectIdeaForm } from "@/components/incubator/SubmitProjectIdeaForm";
import { useIncubator } from "@/hooks/useIncubator";

export default function IncubatorPage() {
  const state = useIncubator();
  const activeProposals = useMemo(
    () => state.proposals.filter((p) => p.status === "ACTIVE"),
    [state.proposals],
  );
  const ideaById = useMemo(
    () => Object.fromEntries(state.ideas.map((i) => [i.id, i])),
    [state.ideas],
  );

  return (
    <div className="pt-6 sm:pt-12">
      <header className="text-center">
        <p className="text-[11px] uppercase tracking-wider2 text-honey-soft/55">
          Swarm-driven venture studio
        </p>
        <h1 className="mt-3 text-3xl sm:text-5xl font-light tracking-tight text-gradient-honey">
          Hive Incubator
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-sm text-honey-soft/60">
          The hive generates startup ideas. The swarm picks which ones get
          built. Every milestone is a vote.
        </p>
      </header>

      <motion.div
        initial="hidden"
        animate="show"
        variants={{
          hidden: {},
          show: { transition: { staggerChildren: 0.08, delayChildren: 0.2 } },
        }}
        className="mt-12 grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] gap-8"
      >
        <motion.section
          variants={fadeUp}
          className="space-y-4 order-1"
        >
          <SectionHeader
            kicker="AI idea feed"
            title="Triage the swarm's intake"
            note="Drag to vote — left rejects, right sends to a swarm proposal."
          />
          <IdeaFeed />
        </motion.section>

        <motion.section
          variants={fadeUp}
          className="space-y-4 order-2"
        >
          <SectionHeader
            kicker="Active proposals"
            title="Live votes"
            note="60% YES + quorum to pass."
          />
          {activeProposals.length === 0 ? (
            <div className="glass-panel rounded-2xl p-8 text-center text-sm text-honey-soft/60">
              No active proposals. Approve an idea to start one.
            </div>
          ) : (
            <div className="space-y-3">
              {activeProposals.map((p) => {
                const idea = ideaById[p.ideaId];
                if (!idea) return null;
                return <ProposalRow key={p.id} proposal={p} idea={idea} />;
              })}
            </div>
          )}
        </motion.section>
      </motion.div>

      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.55, duration: 0.6 }}
        className="mt-16"
      >
        <SectionHeader
          kicker="Submit a project idea"
          title="Pitch the next build"
          note="Stakers ≥ minProposeStake can submit. 24h vote · 60% YES + quorum to pass."
        />
        <div className="mt-4 max-w-2xl">
          <SubmitProjectIdeaForm />
        </div>
      </motion.section>

      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6, duration: 0.6 }}
        className="mt-16"
      >
        <div className="flex items-end justify-between">
          <SectionHeader
            kicker="Swarm leaderboard"
            title="Most accurate participants"
          />
          <Link
            href="/projects"
            className="text-[11px] uppercase tracking-wider2 text-honey-soft/55 hover:text-honey-soft transition-colors"
          >
            See active projects →
          </Link>
        </div>
        <div className="mt-4">
          <SwarmTable entries={state.swarm} />
        </div>
      </motion.section>
    </div>
  );
}

const fadeUp = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: { duration: 0.55 } },
};

function SectionHeader({
  kicker,
  title,
  note,
}: {
  kicker: string;
  title: string;
  note?: string;
}) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider2 text-honey-soft/50">
        {kicker}
      </div>
      <h2 className="mt-1 text-xl font-light text-honey-soft">{title}</h2>
      {note && (
        <p className="mt-1 text-[12px] text-honey-soft/45">{note}</p>
      )}
    </div>
  );
}
