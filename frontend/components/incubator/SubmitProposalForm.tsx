import { useState } from "react";
import { useAccount } from "wagmi";
import { motion, AnimatePresence } from "framer-motion";
import { useIncubatorActions } from "@/hooks/useIncubator";

const TITLE_MIN = 5;
const TITLE_MAX = 80;
const DESC_MIN = 20;
const DESC_MAX = 500;

export function SubmitProposalForm({ projectId }: { projectId: string }) {
  const { address } = useAccount();
  const actions = useIncubatorActions();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justSubmitted, setJustSubmitted] = useState(false);

  const titleLeft = TITLE_MAX - title.length;
  const descLeft = DESC_MAX - description.length;
  const valid =
    title.trim().length >= TITLE_MIN &&
    title.length <= TITLE_MAX &&
    description.trim().length >= DESC_MIN &&
    description.length <= DESC_MAX;

  async function onSubmit() {
    if (!address) return;
    setError(null);
    setBusy(true);
    try {
      const result = await actions.submitCommunityProposal({
        projectId,
        title: title.trim(),
        description: description.trim(),
        submitter: address,
      });
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setTitle("");
      setDescription("");
      setJustSubmitted(true);
      setTimeout(() => setJustSubmitted(false), 4000);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  if (!address) {
    return (
      <div className="glass-panel rounded-2xl px-6 py-5 text-center">
        <p className="text-sm text-honey-soft/65">
          Connect a wallet to submit a proposal for this project.
        </p>
      </div>
    );
  }

  return (
    <div className="glass-panel rounded-2xl p-6">
      <div className="flex items-baseline justify-between">
        <div>
          <div className="text-[10px] uppercase tracking-wider2 text-honey-soft/50">
            Submit a proposal
          </div>
          <h3 className="mt-1 text-lg font-light text-honey-soft">
            Suggest the next move
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
          placeholder="Short, opinionated headline."
          className="mt-2 w-full bg-transparent border-b border-honey/15 pb-2 text-honey-soft placeholder:text-honey-soft/25 outline-none transition-colors focus:border-honey/55"
        />
        <div className="mt-1 flex items-center justify-between text-[10px] text-honey-soft/35 numeric">
          <span>{title.trim().length < TITLE_MIN ? `min ${TITLE_MIN}` : ""}</span>
          <span>{titleLeft}</span>
        </div>
      </div>

      <div className="mt-5">
        <label className="block text-[10px] uppercase tracking-wider2 text-honey-soft/55">
          Why
        </label>
        <textarea
          rows={4}
          value={description}
          maxLength={DESC_MAX}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What is the change, and what's the wedge?"
          className="mt-2 w-full resize-none bg-honey/[0.02] border border-honey/15 rounded-xl px-4 py-3 text-sm text-honey-soft placeholder:text-honey-soft/25 outline-none transition-colors focus:border-honey/45"
        />
        <div className="mt-1 flex items-center justify-between text-[10px] text-honey-soft/35 numeric">
          <span>{description.trim().length < DESC_MIN ? `min ${DESC_MIN}` : ""}</span>
          <span>{descLeft}</span>
        </div>
      </div>

      <motion.button
        type="button"
        whileHover={{ y: -1 }}
        whileTap={{ scale: 0.98 }}
        disabled={!valid || busy}
        onClick={onSubmit}
        className="mt-6 w-full rounded-full bg-gradient-to-br from-honey-soft to-honey px-6 py-3 text-[12px] font-medium tracking-wider2 uppercase text-ink shadow-honey hover:shadow-honeyStrong transition-all disabled:opacity-40 disabled:shadow-none"
      >
        {busy ? "Submitting…" : "Submit to swarm"}
      </motion.button>

      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="mt-3 rounded-lg border border-red-400/30 bg-red-400/[0.05] px-3 py-2 text-[11px] text-red-300/80"
          >
            {error}
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
