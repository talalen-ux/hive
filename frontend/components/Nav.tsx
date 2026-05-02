import Link from "next/link";
import { useRouter } from "next/router";
import { motion } from "framer-motion";
import { ConnectButton } from "./ConnectButton";

const ITEMS = [
  { href: "/", label: "Hive" },
  { href: "/stake", label: "Enter" },
  { href: "/incubator", label: "Build" },
  { href: "/projects", label: "Projects" },
  { href: "/rewards", label: "Nectar" },
  { href: "/leaderboard", label: "Queens" },
  { href: "/map", label: "Map" },
];

export function Nav() {
  const { pathname } = useRouter();
  return (
    <header className="relative z-20 mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
      <Link href="/" className="group flex items-center gap-3">
        <HexMark />
        <span className="text-xs uppercase tracking-wider2 text-honey-soft/80 group-hover:text-honey-soft transition-colors">
          Hive
        </span>
      </Link>

      <nav className="hidden md:flex items-center gap-1">
        {ITEMS.map((it) => {
          const active =
            pathname === it.href ||
            (it.href !== "/" && pathname.startsWith(it.href + "/"));
          return (
            <Link
              key={it.href}
              href={it.href}
              className="relative px-4 py-2 text-[13px] tracking-wider2 uppercase"
            >
              <span
                className={
                  active
                    ? "text-honey-soft"
                    : "text-honey-soft/50 hover:text-honey-soft/90 transition-colors"
                }
              >
                {it.label}
              </span>
              {active && (
                <motion.span
                  layoutId="nav-pill"
                  className="absolute inset-0 -z-10 rounded-full border border-honey/30 bg-honey/[0.06] shadow-honey"
                  transition={{ type: "spring", stiffness: 400, damping: 32 }}
                />
              )}
            </Link>
          );
        })}
      </nav>

      <ConnectButton />
    </header>
  );
}

function HexMark() {
  return (
    <span className="relative inline-block h-7 w-7">
      <span className="absolute inset-0 hex-clip bg-gradient-to-br from-honey-glow via-honey to-honey-dark" />
      <span className="absolute inset-[3px] hex-clip bg-ink" />
      <span className="absolute inset-[6px] hex-clip bg-honey/70 animate-breathe" />
    </span>
  );
}
