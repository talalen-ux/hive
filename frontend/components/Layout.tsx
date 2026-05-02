import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/router";
import type { ReactNode } from "react";
import { HoneycombBackground } from "./HoneycombBackground";
import { PollenParticles } from "./PollenParticles";
import { Nav } from "./Nav";
import { PreviewBanner } from "./PreviewBanner";

export function Layout({ children }: { children: ReactNode }) {
  const { pathname } = useRouter();
  return (
    <>
      <HoneycombBackground />
      <PollenParticles />
      <Nav />
      <PreviewBanner />
      <AnimatePresence mode="wait">
        <motion.main
          key={pathname}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
          className="relative z-10 mx-auto w-full max-w-6xl px-6 pb-24"
        >
          {children}
        </motion.main>
      </AnimatePresence>
    </>
  );
}
