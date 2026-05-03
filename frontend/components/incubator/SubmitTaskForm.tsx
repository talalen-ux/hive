import { useState } from "react";
import { useAccount } from "wagmi";
import { motion, AnimatePresence } from "framer-motion";
import { useIncubatorActions } from "@/hooks/useIncubator";
import { STAGE_LABEL, STAGE_ORDER } from "@/lib/incubator";

const DESC_MIN = 5;
const DESC_MAX = 256;
const LABEL_MIN = 1;
const LABEL_MAX = 64;
const OPT_DESC_MAX = 256;
const MAX_OPTIONS = 5;

/**
 * Multi-option task submission. Used for naming votes
 * (Buzz / Hum / Comb / …) and any other A/B/C-style decision tied to a
 * project's stage.
 *
 * Uses HiveGovernor.createTask which is open to oracle OR any wallet
 * with weight >= minProposeStake.
 */
export function SubmitTaskForm({ projectId }: { projectId: string }) {
  const { address } = useAccount();
  const actions = useIncubatorActions();

  const [description, setDescription] = useState("Pick a name");
  const [stageIdx, setStageIdx] = useState(0);
  const [options, setOptions] = useState<{ label: string; description: string }[]>([
    { label: "", description: "" },
    { label: "", description: "" },
  ]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justSubmitted, setJustSubmitted] = useState(false);

  const validOptions = options.filter((o) => o.label.trim().length >= LABEL_MIN);
  const valid =
    description.trim().length >= DESC_MIN &&
    description.trim().length <= DESC_MAX &&
    validOptions.length >= 2 &&
    validOptions.length <= MAX_OPTIONS;

  function setOption(i: number, key: "label" | "description", v: string) {
    const next = options.slice();
    next[i] = { ...next[i], [key]: v };
    setOptions(next);
  }
  function addOption() {
    if (options.length >= MAX_OPTIONS) return;
    setOptions([...options, { label: "", description: "" }]);
  }
  function removeOption(i: number) {
    if (options.length <= 2) return;
    setOptions(options.filter((_, j) => j !== i));
  }

  async function onSubmit() {
    setError(null);
    setBusy(true);
    try {
      const cleaned = options
        .map((o) => ({ label: o.label.trim(), description: o.description.trim() }))
        .filter((o) => o.label.length > 0);
      const res = await actions.submitTask({
        projectId,
        description: description.trim(),
        stage: stageIdx,
        options: cleaned,
      });
      if ("error" in res) {
        setError(res.error);
        return;
      }
      setDescription("Pick a name");
      setOptions([
        { label: "", description: "" },
        { label: "", description: "" },
      ]);
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
          Connect a wallet to propose a multi-option task.
        </p>
      </div>
    );
  }

  return (
    <div className="glass-panel rounded-2xl p-6">
      <div className="flex items-baseline justify-between">
        <div>
          <div className="text-[10px] uppercase tracking-wider2 text-honey-soft/50">
            Submit a multi-option task
          </div>
          <h3 className="mt-1 text-lg font-light text-honey-soft">
            Names, designs, choices
          </h3>
        </div>
        <div className="text-[10px] uppercase tracking-wider2 text-honey-soft/45 numeric">
          24h vote · 55% leader
        </div>
      </div>

      <div className="mt-5 grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3">
        <div>
          <label className="block text-[10px] uppercase tracking-wider2 text-honey-soft/55">
            Question
          </label>
          <input
            type="text"
            value={description}
            maxLength={DESC_MAX}
            onChange={(e) => setDescription(e.target.value)}
            className="mt-2 w-full bg-transparent border-b border-honey/15 pb-2 text-honey-soft outline-none transition-colors focus:border-honey/55"
          />
        </div>
        <div>
          <label className="block text-[10px] uppercase tracking-wider2 text-honey-soft/55">
            Stage
          </label>
          <select
            value={stageIdx}
            onChange={(e) => setStageIdx(Number(e.target.value))}
            className="mt-2 bg-honey/[0.02] border border-honey/15 rounded-xl px-3 py-2 text-sm text-honey-soft outline-none focus:border-honey/45"
          >
            {STAGE_ORDER.map((s, i) => (
              <option key={s} value={i}>{STAGE_LABEL[s]}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="mt-5 space-y-2">
        <label className="block text-[10px] uppercase tracking-wider2 text-honey-soft/55">
          Options ({validOptions.length}/{MAX_OPTIONS})
        </label>
        {options.map((o, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="grid h-6 w-6 place-items-center rounded-full border border-honey/25 text-[10px] text-honey-soft/65 numeric">
              {String.fromCharCode(65 + i)}
            </span>
            <input
              type="text"
              value={o.label}
              maxLength={LABEL_MAX}
              onChange={(e) => setOption(i, "label", e.target.value)}
              placeholder={`Option ${String.fromCharCode(65 + i)}`}
              className="flex-1 bg-transparent border-b border-honey/15 pb-1 text-sm text-honey-soft placeholder:text-honey-soft/25 outline-none focus:border-honey/55"
            />
            <input
              type="text"
              value={o.description}
              maxLength={OPT_DESC_MAX}
              onChange={(e) => setOption(i, "description", e.target.value)}
              placeholder="Optional one-liner"
              className="flex-[2] bg-transparent border-b border-honey/10 pb-1 text-[12px] text-honey-soft/65 placeholder:text-honey-soft/20 outline-none focus:border-honey/45"
            />
            <button
              type="button"
              disabled={options.length <= 2}
              onClick={() => removeOption(i)}
              className="text-[14px] text-honey-soft/35 hover:text-honey-soft disabled:opacity-30"
              title="Remove"
            >
              ×
            </button>
          </div>
        ))}
        {options.length < MAX_OPTIONS && (
          <button
            type="button"
            onClick={addOption}
            className="text-[11px] uppercase tracking-wider2 text-honey-soft/55 hover:text-honey-soft"
          >
            + add option
          </button>
        )}
      </div>

      <motion.button
        type="button"
        whileHover={{ y: -1 }}
        whileTap={{ scale: 0.98 }}
        disabled={!valid || busy}
        onClick={onSubmit}
        className="mt-6 w-full rounded-full bg-gradient-to-br from-honey-soft to-honey px-6 py-3 text-[12px] font-medium tracking-wider2 uppercase text-ink shadow-honey hover:shadow-honeyStrong transition-all disabled:opacity-40 disabled:shadow-none"
      >
        {busy ? "Submitting…" : "Submit task"}
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
