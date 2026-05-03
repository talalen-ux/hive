import Link from "next/link";
import { motion } from "framer-motion";
import type { ReactNode } from "react";

export default function DocsPage() {
  return (
    <div className="pt-6 sm:pt-12">
      <header className="text-center">
        <p className="text-[11px] uppercase tracking-wider2 text-honey-soft/55">
          How the hive works
        </p>
        <h1 className="mt-3 text-3xl sm:text-5xl font-light tracking-tight text-gradient-honey">
          Hive Docs
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-sm text-honey-soft/60">
          A short, complete guide to staking, proposing, voting, and earning
          inside the Hive.
        </p>
      </header>

      <motion.div
        initial="hidden"
        animate="show"
        variants={{
          hidden: {},
          show: { transition: { staggerChildren: 0.05, delayChildren: 0.1 } },
        }}
        className="mt-12 grid grid-cols-1 lg:grid-cols-[220px_minmax(0,1fr)] gap-8"
      >
        {/* Sidebar TOC */}
        <motion.aside variants={fadeUp} className="lg:sticky lg:top-24 lg:self-start">
          <nav className="glass-panel rounded-2xl p-4">
            <div className="text-[10px] uppercase tracking-wider2 text-honey-soft/45 px-2 pb-2">
              Sections
            </div>
            <ul className="space-y-1 text-[13px]">
              <TocLink href="#what">What is Hive</TocLink>
              <TocLink href="#stake">Stake to participate</TocLink>
              <TocLink href="#propose">Propose</TocLink>
              <TocLink href="#vote">Vote</TocLink>
              <TocLink href="#tasks">Tasks &amp; naming</TocLink>
              <TocLink href="#rewards">Rewards</TocLink>
              <TocLink href="#roles">Roles</TocLink>
              <TocLink href="#security">Security</TocLink>
              <TocLink href="#glossary">Glossary</TocLink>
            </ul>
          </nav>
        </motion.aside>

        <motion.div variants={fadeUp} className="space-y-10">
          <Section id="what" title="What is Hive">
            <p>
              Hive is a decentralised, AI-driven venture studio. Token holders
              stake <Mono>$HIVE</Mono> to participate in governance, vote on
              startup ideas, and collectively build them through a
              milestone-based pipeline from concept to launch. Rewards land
              when projects ship.
            </p>
            <p>
              The system has three on-chain artefacts: <Em>idea proposals</Em>{" "}
              (project pitches), <Em>community proposals</Em> (project-scoped
              suggestions), and <Em>multi-option tasks</Em> (A/B/C decisions
              for live projects — naming, design, copy). Anyone with stake can
              participate.
            </p>
          </Section>

          <Section id="stake" title="Stake to participate">
            <ul className="list-disc list-inside space-y-2 marker:text-honey-soft/40">
              <li>
                Stake any amount of <Mono>$HIVE</Mono>. No locks, no minimum,
                no tiers.
              </li>
              <li>
                Unstake any amount, any time. Exception: while you have an
                open governance vote, your stake is <Em>frozen</Em> until that
                vote closes — same wallet, same amount, just unmovable.
              </li>
              <li>
                Voting weight = staked HIVE, 1:1.
              </li>
              <li>
                Stake is your entry ticket. <Em>No stake → no voting, no
                proposing.</Em>
              </li>
            </ul>
            <Callout>
              The minimum to <Em>submit</Em> a proposal/task is{" "}
              <Mono>minProposeStake</Mono> (default 100 HIVE, owner-tunable).
              Voting itself has no minimum — any positive stake counts.
            </Callout>
          </Section>

          <Section id="propose" title="Propose">
            <p>Three kinds of proposals, all on-chain:</p>

            <Sub title="1. Idea proposals — pitch a new project">
              <p>
                Submitted by either the AI scout (oracle) or any staker
                clearing <Mono>minProposeStake</Mono>. Carries a title,
                description, category, build-time estimate, and 1–10
                complexity / market scores.
              </p>
              <p>
                Vote rules: 60% YES of (yes + no) + quorum to pass. On pass,
                the project <Em>auto-registers on-chain</Em> with the
                submitter as initial owner — your project key is now real
                and tasks can target it.
              </p>
              <p>
                The dapp distinguishes AI vs community provenance by
                comparing <Mono>proposals(id).submitter</Mono> to the
                live oracle address.
              </p>
            </Sub>

            <Sub title="2. Community proposals — change a live project">
              <p>
                Project-scoped yes/no/abstain proposal. "Buzz should support
                voice rooms in v1." Same submission gate
                (<Mono>≥ minProposeStake</Mono>), same vote rules. On pass,
                the proposal is <Em>auto-promoted</Em> to a task on the
                project (the action item <Em>is</Em> the description) so the
                lineage stays visible.
              </p>
              <p>
                The target project must be registered on-chain. Submitting a
                proposal for an unknown project key reverts with{" "}
                <Mono>UnknownProject</Mono>.
              </p>
            </Sub>

            <Sub title="3. Multi-option tasks — A/B/C decisions">
              <p>
                For naming votes ("Buzz / Hum / Comb"), design direction,
                copy choices — anything multi-choice. 2–5 options, each with
                a short label and optional one-liner description.
              </p>
              <p>
                Pass: the leading option clears 55% of all task votes (ties
                ⇒ no decision).
              </p>
            </Sub>
          </Section>

          <Section id="vote" title="Vote">
            <ul className="list-disc list-inside space-y-2 marker:text-honey-soft/40">
              <li>One vote per proposal/task; you can't change your mind.</li>
              <li>
                Voting freezes your stake until the vote closes. The freeze
                is the <Em>only</Em> defence against
                "vote-and-walk-with-principal" now that there are no locks.
              </li>
              <li>
                After the window closes, anyone calls <Mono>finalize…</Mono>{" "}
                to settle the result. Permissionless, gas paid by the caller.
              </li>
            </ul>
          </Section>

          <Section id="tasks" title="Tasks &amp; naming">
            <p>
              Once a project is registered, anyone clearing{" "}
              <Mono>minProposeStake</Mono> can submit multi-option tasks for
              it. The canonical use case is <Em>naming</Em> — pitch 2–5
              candidates, the swarm picks the leader.
            </p>
            <p>
              Auto-promoted tasks (from passed community proposals) live in
              the same task map but carry no options — they're "decided"
              action items the team takes from there. Their{" "}
              <Mono>submitter</Mono> field preserves the original
              proposer, not the finaliser, so credit is end-to-end.
            </p>
          </Section>

          <Section id="rewards" title="Rewards">
            <p>
              Rewards are not streamed continuously. They arrive when{" "}
              <Em>projects launch.</Em>
            </p>
            <ol className="list-decimal list-inside space-y-2 marker:text-honey-soft/40">
              <li>
                Fees, tax, and treasury contributions accumulate inside the{" "}
                <Mono>HiveRewards</Mono> contract as a pending pool.
              </li>
              <li>
                When a project hits LAUNCH, the multisig calls{" "}
                <Mono>distributeLaunchPool(hiveAmt, ethAmt)</Mono> to
                advance the per-staker accumulator by an explicit chunk.
              </li>
              <li>
                Stakers' pending balances grow proportional to their stake.
                Claim anytime via <Mono>claim()</Mono>.
              </li>
            </ol>
            <Callout>
              Stakers who arrive <Em>after</Em> a launch don't back-claim
              past payouts — the MasterChef accumulator only credits stakes
              that were live at distribution time.
            </Callout>
          </Section>

          <Section id="roles" title="Roles">
            <Sub title="Stakers">
              Anyone holding <Mono>$HIVE</Mono>. Vote, propose, claim.
              That's it.
            </Sub>
            <Sub title="Oracle">
              The AI scout. Generates project ideas and posts them on-chain
              via <Mono>createProposal</Mono>. Can be rotated through a
              24h-cooldown 2-step transfer for safety.
            </Sub>
            <Sub title="Multisig owner">
              Manages governance parameters (<Mono>minProposeStake</Mono>,
              pause/unpause), registers legacy projects, advances project
              stages, and triggers launch payouts. <Em>Cannot move user
              funds, cannot override votes, cannot mint tokens.</Em>
            </Sub>
          </Section>

          <Section id="security" title="Security">
            <p>
              The system is built around a few simple invariants and a
              handful of guarded operational actions. Highlights:
            </p>
            <ul className="list-disc list-inside space-y-2 marker:text-honey-soft/40">
              <li>
                <Em>No admin override of votes.</Em> Once cast, votes are
                immutable; finalisation is permissionless.
              </li>
              <li>
                <Em>No upgradeability.</Em> Contracts are immutable —
                migration would mean a redeploy.
              </li>
              <li>
                <Em>One-shot wire setters.</Em> The protocol contracts wire
                each other once at deploy and can't be redirected.
              </li>
              <li>
                <Em>Vote freeze.</Em> Stops a flash-borrow / vote-then-walk
                attack at the source — your stake is locked through every
                vote you cast.
              </li>
              <li>
                <Em>Project registry.</Em> Tasks and community proposals can
                only target a real, registered project. Off-target grief is
                rejected at the contract level.
              </li>
            </ul>
            <p>
              Full threat model + every audit finding lives in{" "}
              <a
                href="https://github.com/talalen-ux/hive/blob/main/docs/SECURITY.md"
                target="_blank"
                rel="noreferrer"
                className="text-honey-soft underline underline-offset-2 decoration-honey/30 hover:decoration-honey-soft"
              >
                docs/SECURITY.md
              </a>
              .
            </p>
            <Callout>
              Known residual risk: launch-payout sandwich. With no minimum
              stake duration, an attacker can stake right before a payout
              and unstake right after, capturing pro-rata share. Mitigation
              is operational — multisig announces every payout 24h+ in
              advance so legitimate stakers join early and snake actors get
              noticed.
            </Callout>
          </Section>

          <Section id="glossary" title="Glossary">
            <Term term="HIVE">The protocol token. ERC-20.</Term>
            <Term term="Weight / voting power">Your staked amount, 1:1.</Term>
            <Term term="Vote freeze">
              Temporary unstake block while you have at least one open vote.
              Lifts the moment the latest open vote closes.
            </Term>
            <Term term="minProposeStake">
              Minimum stake to submit a proposal or task. Anti-spam.
              Owner-tunable.
            </Term>
            <Term term="Quorum / threshold">
              Minimum total weight needed for a vote to count toward a pass.
              Below it, the proposal REJECTS regardless of yes/no ratio.
            </Term>
            <Term term="Pass">
              60% YES of (yes+no) for proposals; 55% leader of all task
              votes for tasks (ties = no decision).
            </Term>
            <Term term="Launch payout">
              Explicit reward release triggered when a project ships. The
              only path through which stakers earn.
            </Term>
            <Term term="DEAD seed">
              A permanent, unclaimable stake registered to{" "}
              <Mono>0x…dEaD</Mono> at deploy. Defeats the first-staker
              donation sandwich on the rewards accumulator.
            </Term>
          </Section>

          <div className="text-center pt-4">
            <Link
              href="/stake"
              className="inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-honey-soft to-honey px-6 py-3 text-[12px] font-medium tracking-wider2 uppercase text-ink shadow-honey hover:shadow-honeyStrong transition-all"
            >
              Enter the Hive
              <span aria-hidden>→</span>
            </Link>
          </div>
        </motion.div>
      </motion.div>
    </div>
  );
}

const fadeUp = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.55 } },
};

function TocLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <li>
      <a
        href={href}
        className="block rounded-lg px-2 py-1 text-honey-soft/65 hover:bg-honey/[0.04] hover:text-honey-soft transition-colors"
      >
        {children}
      </a>
    </li>
  );
}

function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-28">
      <h2 className="text-2xl font-light text-honey-soft">{title}</h2>
      <div className="mt-4 glass-panel rounded-2xl p-6 sm:p-7 space-y-4 text-sm leading-relaxed text-honey-soft/80">
        {children}
      </div>
    </section>
  );
}

function Sub({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-honey/10 bg-honey/[0.02] px-5 py-4 space-y-3">
      <div className="text-[10px] uppercase tracking-wider2 text-honey-soft/50">
        {title}
      </div>
      <div className="text-[13.5px] leading-relaxed text-honey-soft/80 space-y-3">
        {children}
      </div>
    </div>
  );
}

function Term({ term, children }: { term: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-[180px_1fr] gap-3 items-baseline">
      <div className="text-[12px] uppercase tracking-wider2 text-honey-soft/65">
        {term}
      </div>
      <div className="text-[13.5px] text-honey-soft/80">{children}</div>
    </div>
  );
}

function Callout({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl border border-honey/25 bg-honey/[0.04] px-4 py-3 text-[13px] text-honey-soft/85">
      {children}
    </div>
  );
}

function Em({ children }: { children: ReactNode }) {
  return <span className="text-honey-soft">{children}</span>;
}

function Mono({ children }: { children: ReactNode }) {
  return (
    <code className="rounded bg-honey/[0.06] px-1.5 py-0.5 text-[12.5px] text-honey-soft numeric">
      {children}
    </code>
  );
}
