import { AnimatePresence, motion } from "framer-motion";
import { useMemo } from "react";
import { IdeaCard } from "./IdeaCard";
import { useIncubator, useIncubatorActions } from "@/hooks/useIncubator";

export function IdeaFeed() {
  const state = useIncubator();
  const actions = useIncubatorActions();
  const queue = useMemo(
    () => state.ideas.filter((i) => i.status === "PENDING"),
    [state.ideas],
  );

  if (queue.length === 0) {
    return (
      <div className="glass-panel rounded-2xl p-10 text-center">
        <p className="text-sm text-honey-soft/65">
          The queue is empty. The next AI cycle starts soon.
        </p>
        <p className="mt-2 text-[10px] uppercase tracking-wider2 text-honey-soft/40 numeric">
          Next gen · ~17 min
        </p>
      </div>
    );
  }

  // show top of stack + a peek of the next 2 cards behind
  const stack = queue.slice(0, 3);

  return (
    <div className="relative h-[560px] sm:h-[600px]">
      <AnimatePresence>
        {stack.map((idea, i) => {
          const top = stack.length - 1 - i; // top of stack last in DOM
          const isTop = idea.id === stack[0].id;
          return (
            <motion.div
              key={idea.id}
              className="absolute inset-x-0 top-0 mx-auto"
              initial={{ opacity: 0, y: 24, scale: 0.92 }}
              animate={{
                opacity: 1,
                y: i * 14,
                scale: 1 - i * 0.04,
              }}
              exit={{ opacity: 0, x: 320, rotate: 8, transition: { duration: 0.35 } }}
              transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
              style={{ pointerEvents: isTop ? "auto" : "none" }}
            >
              <IdeaCard
                idea={idea}
                onApprove={() => actions.approveIdea(idea.id)}
                onReject={() => actions.rejectIdea(idea.id)}
                z={top}
              />
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
