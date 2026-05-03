import { useState } from "react";
import { useAccount } from "wagmi";
import { motion, AnimatePresence } from "framer-motion";
import { useIncubatorActions } from "@/hooks/useIncubator";
import { CATEGORIES } from "@/lib/incubator";

const TITLE_MIN = 5;
const TITLE_MAX = 80;
const DESC_MIN = 20;
const DESC_MAX = 1024;

/**
 * Lets stakers submit a project idea on-chain — same path as AI-generated
 * ideas (createProposal). The form shape mirrors the AI schema: title,
 * description, category, build time, complexity score, market potential
 * score. Anti-spam: requires governor to be wired and the user to clear
 * minProposeStake (the contract enforces; we surface the revert inline).
 */
export function SubmitProjectIdeaForm() {
  const { address } = useAccount();
  const actions = useIncubatorActions();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<typeof CATEGORIES[number]>("infra");
  const [buildTime, setBuildTime] = useState("3 weeks");
  const [complexity, setComplexity] = useState(5);
  const [market, setMarket] = useState(7);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justSubmitted, setJustSubmitted] = useState(false);

  const valid =
    title.trim().length >= TITLE_MIN &&
    title.trim().length <= TITLE_MAX &&
    description.trim().length >= DESC_MIN &&
    description.trim().length <= DESC_MAX;

  async function onSubmit() {
    setError(null);
    setBusy(true);
    try {
      const res = await actions.submitProjectIdea({
        title: title.trim(),
        description: description.trim(),
        category,
        buildTime: buildTime.trim() || "—",
        complexity,
        marketPotential: market,
      });
      if ("error" in res) {
        setError(res.error);
        return;
      }
      setTitle("");
      setDescription("");
      setJustSubmitted(true);
      setTimeout(() => setJustSubmitted(false), 4000);
    } finally {
      setBusy(false);
    }
  }

  if (!address) {
    return (
      <div className="glass-panel rounded-2xl p-8 text-center">
        <p className="text-sm text-honey-soft/65">
          Connect a wallet to submit a project idea.
        </p>
      </div>
    );
  }

  return (
    <div className="glass-panel rounded-2xl p-6">
      <div className="flex items-baseline justify-between">
        <div>
          <div className="text-[10px] uppercase tracking-wider2 text-honey-soft/50">
            Submit a project idea
          </div>
          <h3 className="mt-1 text-lg font-light text-honey-soft">
            Pitch a new build
          </h3>
        </div>
        <div className="text-[10px] uppercase tracking-wider2 text-honey-soft/45 numeric">
          24h vote · 60% to pass
        </div>
      </div>

      <div className="mt-5">
        <label className="block text-[10px] uppercase tracking-wider2 text-honey-soft/55">
          Title
        </label>
        <input
          type="text"
          value={title}
          maxLength={TITLE_MAX}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Short, brandable name."
          className="mt-2 w-full bg-transparent border-b border-honey/15 pb-2 text-honey-soft placeholder:text-honey-soft/25 outline-none transition-colors focus:border-honey/55"
        />
      </div>

      <div className="mt-4">
        <label className="block text-[10px] uppercase tracking-wider2 text-honey-soft/55">
          Description
        </label>
        <textarea
          rows={3}
          value={description}
          maxLength={DESC_MAX}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="One or two sentences. Lead with the wedge."
          className="mt-2 w-full resize-none bg-honey/[0.02] border border-honey/15 rounded-xl px-4 py-3 text-sm text-honey-soft placeholder:text-honey-soft/25 outline-none transition-colors focus:border-honey/45"
        />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <div>
          <label className="block text-[10px] uppercase tracking-wider2 text-honey-soft/55">
            Category
          </label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as typeof CATEGORIES[number])}
            className="mt-2 w-full bg-honey/[0.02] border border-honey/15 rounded-xl px-3 py-2 text-sm text-honey-soft outline-none focus:border-honey/45"
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-[10px] uppercase tracking-wider2 text-honey-soft/55">
            Build time
          </label>
          <input
            type="text"
            value={buildTime}
            maxLength={32}
            onChange={(e) => setBuildTime(e.target.value)}
            placeholder="3 weeks"
            className="mt-2 w-full bg-honey/[0.02] border border-honey/15 rounded-xl px-3 py-2 text-sm text-honey-soft placeholder:text-honey-soft/25 outline-none focus:border-honey/45"
          />
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <ScoreSlider label="Complexity" value={complexity} onChange={setComplexity} />
        <ScoreSlider label="Market" value={market} onChange={setMarket} />
      </div>

      <motion.button
        type="button"
        whileHover={{ y: -1 }}
        whileTap={{ scale: 0.98 }}
        disabled={!valid || busy}
        onClick={onSubmit}
        className="mt-6 w-full rounded-full bg-gradient-to-br from-honey-soft to-honey px-6 py-3 text-[12px] font-medium tracking-wider2 uppercase text-ink shadow-honey hover:shadow-honeyStrong transition-all disabled:opacity-40 disabled:shadow-none"
      >
        {busy ? "Submitting…" : "Submit idea"}
      </motion.button>

      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="mt-3 rounded-lg border border-red-400/30 bg-red-400/[0.05] px-3 py-2 text-[11px] text-red-300/80"
          >
            {error.length > 200 ? `${error.slice(0, 200)}…` : error}
          </motion.div>
        )}
        {justSubmitted && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="mt-3 rounded-lg border border-honey/30 bg-honey/[0.05] px-3 py-2 text-[11px] text-honey-soft/85"
          >
            Submitted · voting opens for 24h.
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ScoreSlider({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="text-[10px] uppercase tracking-wider2 text-honey-soft/55">{label}</span>
        <span className="text-sm text-honey-soft numeric">{value}<span className="text-[10px] text-honey-soft/40">/10</span></span>
      </div>
      <input
        type="range"
        min={1}
        max={10}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-2 w-full accent-honey"
      />
    </div>
  );
}
