---
name: premium-dapp-aesthetic
description: Apply the premium animated dark-amber web3 aesthetic — minimal glass panels on deep ink, honey/hive colour system, hex-based geometry, Framer Motion micro-interactions, and a specific motion vocabulary (breathe, drift, pulse, sparkle). Invoke when building a web3 / fintech / agent-platform UI that should feel cinematic + alive without resorting to generic AI-startup tropes (purple gradients, emoji, fake glassmorphism, busy dashboards).
---

# Premium dapp aesthetic — design system + recipes

A self-contained design system for building cinematic, motion-rich web3 apps.
Born inside the Hive Incubator dapp; generalises to any product that wants a
"living organism" / "swarm" feel — DeFi vaults, agent platforms, governance
UIs, premium prosumer fintech. Pure Next.js + Tailwind + Framer Motion (no
Three.js); SSR-safe, lightweight, looks expensive.

## When to invoke

Use this skill when:
- Starting a new web3 / fintech / agent app and the user asks for a "premium",
  "cinematic", "alive", "minimal", or "Apple-level" look.
- Reskinning an existing dapp that currently looks generic / SaaS.
- Building a landing page, dashboard, or governance UI that needs a strong
  identity without flashy gimmicks.
- The user explicitly asks for "the Hive aesthetic" / "honey + hex" / a
  reference image like the one this system shipped against.

Do **not** invoke when:
- The user has an existing brand system (respect it).
- The product is consumer-mass / e-commerce / kid-friendly — this skill is
  intentionally austere.
- The user wants a light theme. The whole system is dark-first.

## Core principles

1. **Minimal surface, rich motion.** Sparse, well-spaced layouts; let the
   animations carry the experience.
2. **Alive system.** Everything pulses, drifts, breathes. Nothing is purely
   static. *But* every animation has a clear cadence and never goes faster
   than ~3 Hz — premium ≠ frantic.
3. **One palette.** Deep ink + a single warm metal (gold/amber). No accent
   colour beyond a deny-state red. No purples, no neon greens.
4. **Hex geometry.** Hexagons are the structural primitive. Use them as nav
   marks, ornament, progress trackers, and at scale (the dome).
5. **Type does the work.** Inter / Satoshi at light weight, generous
   letter-spacing on uppercase eyebrows (`tracking-wider2`), tabular numerals
   (`numeric`) on every number.
6. **Glass barely there.** Glassmorphism is a 1px gold border + a tiny linear
   gradient + a small backdrop-blur — not the full frosted-pane cliché.

## Anti-patterns (don't ship these)

- ❌ Purple/violet gradients on dark — the AI-startup default. Avoid even as
  accents.
- ❌ Emoji icons. The system uses geometry (hexagons, dots, dashes) as
  pictograms. Only use emoji if the user explicitly asks.
- ❌ Big square cards with thick borders. Always rounded, always thin
  borders, always low contrast.
- ❌ Neon green / Matrix-style "terminal" fonts. The mono is for numbers
  only.
- ❌ Cluttered dashboards with 12 charts. Pick 3 stats. Big. Animated.
- ❌ Hover effects that change colour. Hover should *lift* (translate y by
  -1 to -2) and *brighten* (slight glow), not switch hues.
- ❌ `framer-motion` on hundreds of children. Use CSS keyframes for
  per-element pulses; reserve Framer for layout-level transitions.

## Stack

- **Next.js (Pages Router or App Router)** — both work; recipes assume Pages.
- **Tailwind CSS** with the config below (custom colours + keyframes).
- **Framer Motion** for layout transitions, hover springs, and stagger.
- **CSS keyframes** for per-cell / per-particle pulses (don't reach for
  `motion` on >20 elements — it tanks frame budget).

---

## Tailwind config

Drop this into `tailwind.config.js`. Adjust the honey palette only if you
have a specific brand override.

```js
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./pages/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#0A0A0A",
        honey: {
          DEFAULT: "#F5B942",
          soft: "#FFCC66",
          glow: "#FFD76A",
          dark: "#C89B3C",
          deep: "#1A1208",
        },
      },
      fontFamily: {
        sans: ["Inter", "Satoshi", "Neue Haas Grotesk", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      letterSpacing: {
        // 0.18em — the canonical eyebrow tracking used everywhere uppercase.
        wider2: "0.18em",
      },
      boxShadow: {
        honey: "0 0 24px rgba(245, 185, 66, 0.25)",
        honeyStrong: "0 0 60px rgba(255, 204, 102, 0.45)",
      },
      keyframes: {
        breathe: {
          "0%, 100%": { opacity: "0.55", transform: "scale(1)" },
          "50%": { opacity: "1", transform: "scale(1.04)" },
        },
        drift: {
          "0%": { transform: "translate3d(0,0,0)" },
          "100%": { transform: "translate3d(-80px,-40px,0)" },
        },
        pollen: {
          "0%": { transform: "translate3d(0,0,0)", opacity: "0" },
          "10%": { opacity: "0.6" },
          "90%": { opacity: "0.4" },
          "100%": { transform: "translate3d(40px,-120px,0)", opacity: "0" },
        },
        rotateSlow: {
          "0%": { transform: "rotate(0deg)" },
          "100%": { transform: "rotate(360deg)" },
        },
        flowDown: {
          "0%": { transform: "translateY(-30%)" },
          "100%": { transform: "translateY(120%)" },
        },
      },
      animation: {
        breathe: "breathe 4s ease-in-out infinite",
        drift: "drift 24s linear infinite alternate",
        pollen: "pollen 8s ease-in-out infinite",
        rotateSlow: "rotateSlow 60s linear infinite",
        flowDown: "flowDown 6s linear infinite",
      },
    },
  },
};
```

## Globals (`styles/globals.css`)

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

:root { color-scheme: dark; }
html, body, #__next {
  background: #0a0a0a;
  color: #f5ecd6;
  min-height: 100%;
  font-family: "Inter", "Satoshi", "Neue Haas Grotesk", system-ui, sans-serif;
  font-weight: 300;
  -webkit-font-smoothing: antialiased;
  text-rendering: optimizeLegibility;
}

/* Hexagon clip path — used by all hex marks. */
.hex-clip {
  clip-path: polygon(25% 5%, 75% 5%, 100% 50%, 75% 95%, 25% 95%, 0% 50%);
}

/* Drifting honeycomb pattern (inline SVG). The single source of identity
   for the entire app — every page sees this in the background. */
.honeycomb-bg {
  background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='120' height='104' viewBox='0 0 120 104'><g fill='none' stroke='%23F5B942' stroke-opacity='0.06' stroke-width='1'><polygon points='30,2 58,18 58,52 30,68 2,52 2,18'/><polygon points='90,2 118,18 118,52 90,68 62,52 62,18'/><polygon points='60,52 88,68 88,102 60,118 32,102 32,68'/></g></svg>");
  background-size: 120px 104px;
}

/* Glass panel — barely there. 1px gold border, faint top-down gradient,
   a small blur. Anything more frosted is the wrong move. */
.glass-panel {
  background: linear-gradient(180deg, rgba(255, 215, 106, 0.03) 0%, rgba(26, 18, 8, 0.55) 100%);
  border: 1px solid rgba(245, 185, 66, 0.12);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
}
.glass-panel:hover { border-color: rgba(245, 185, 66, 0.25); }

/* Gradient text — used for headlines only. Don't overuse. */
.text-gradient-honey {
  background: linear-gradient(135deg, #ffd76a 0%, #f5b942 50%, #c89b3c 100%);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}

/* Tabular numerals — apply to every numeric span (balances, countdowns,
   percentages, ranks). The default Inter digits jitter on count-ups. */
.numeric {
  font-variant-numeric: tabular-nums;
  font-feature-settings: "tnum";
}

/* Per-cell pulse — used for hex grids, sparkles, and any "alive" element
   you don't want to pay framer-motion for. Each instance picks its own
   delay + duration via inline style. */
@keyframes hexPulse {
  0%, 100% { opacity: 0.4; filter: drop-shadow(0 0 3px rgba(255, 200, 90, 0.55)); }
  50%      { opacity: 1;   filter: drop-shadow(0 0 9px rgba(255, 215, 106, 1)); }
}

/* Dome perspective — wrap an SVG in this to get a 3D-tilted dome look. */
.dome-perspective {
  perspective: 1100px;
  perspective-origin: 50% 38%;
}
.dome-tilt {
  transform: rotateX(38deg) scaleY(0.92);
  transform-origin: 50% 50%;
  transform-style: preserve-3d;
  will-change: transform;
}

/* Honey stream — vertical falling-light strip used for "rewards flowing"
   pages. Apply with `animate-flowDown` and randomised left/width/delay. */
.honey-stream {
  background: linear-gradient(180deg,
    rgba(255, 215, 106, 0) 0%,
    rgba(255, 215, 106, 0.7) 30%,
    rgba(245, 185, 66, 0.9) 50%,
    rgba(255, 215, 106, 0.7) 70%,
    rgba(255, 215, 106, 0) 100%);
  filter: blur(0.5px);
}

::-webkit-scrollbar { width: 8px; height: 8px; }
::-webkit-scrollbar-thumb { background: rgba(245, 185, 66, 0.18); border-radius: 4px; }
::-webkit-scrollbar-thumb:hover { background: rgba(245, 185, 66, 0.32); }
```

---

## Motion vocabulary

Every animation in this system falls into one of five named patterns. Reach
for the named pattern first; only invent a new one when the spec genuinely
demands it.

| Pattern | What | Where | How |
|---|---|---|---|
| **breathe** | scale 1 ↔ 1.04, opacity 0.55 ↔ 1, 4s | central focal points (logos, big stats, hero hex) | CSS keyframe |
| **drift** | translate3d, 24s linear alternate | full-screen pattern backgrounds | CSS keyframe |
| **pollen** | floating particle, 8s, fade in/out | ambient sparkle around heroes | CSS keyframe |
| **hexPulse** | per-cell pulse 0.4 ↔ 1, 1.8–4s | hex grids, lit cells, sparkles | CSS keyframe with inline `animation-delay/duration` |
| **flowDown** | vertical strip, 6s, top→bottom | "honey streams" on rewards pages | CSS keyframe |

For interaction-driven motion (hover, tap, layout transitions) use Framer:

```ts
// Hover lift — apply to every interactive surface
<motion.button whileHover={{ y: -1 }} whileTap={{ scale: 0.97 }} ... />

// Page transitions — apply once at the Layout level
<motion.main
  key={pathname}
  initial={{ opacity: 0, y: 12 }}
  animate={{ opacity: 1, y: 0 }}
  exit={{ opacity: 0, y: -8 }}
  transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
/>

// Stagger reveal — apply to any list of cards
<motion.div
  initial="hidden"
  animate="show"
  variants={{ hidden: {}, show: { transition: { staggerChildren: 0.08, delayChildren: 0.1 } } }}>
  {items.map(it => (
    <motion.div key={it.id} variants={{
      hidden: { opacity: 0, y: 12 },
      show: { opacity: 1, y: 0, transition: { duration: 0.5 } }
    }}>...</motion.div>
  ))}
</motion.div>

// Mouse-tracked parallax tilt (use on dome / orb hero) — see dome recipe
const sx = useSpring(mouseX, { stiffness: 90, damping: 14, mass: 0.4 });
const rotateY = useTransform(sx, [-1, 1], [-14, 14]);
```

**Performance rule.** Per-cell animations on grids of >20 elements MUST use
CSS keyframes (with inline `animation-delay`/`duration`), NOT Framer Motion
components. The `hexPulse` keyframe was designed for exactly this.

---

## Background recipe — every page

Three layers, mounted once in the Layout:

```tsx
// HoneycombBackground.tsx
export function HoneycombBackground() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div className="absolute inset-0 bg-ink" />
      <div className="absolute -inset-[10%] honeycomb-bg animate-drift opacity-80" />
      <div className="absolute inset-0 bg-[radial-gradient(60%_50%_at_50%_30%,rgba(245,185,66,0.10),transparent_70%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(40%_30%_at_80%_90%,rgba(255,204,102,0.06),transparent_70%)]" />
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-ink/90" />
    </div>
  );
}

// PollenParticles.tsx — deterministic seeded positions so SSR matches CSR
export function PollenParticles({ count = 18 }) {
  const particles = useMemo(() => Array.from({ length: count }, (_, i) => {
    const r = (n) => ((Math.sin(i * 9301 + n) + 1) / 2);
    return {
      left: `${(r(1) * 100).toFixed(2)}%`,
      top: `${(r(2) * 100).toFixed(2)}%`,
      size: 1 + r(3) * 2,
      delay: `${(r(4) * 8).toFixed(2)}s`,
      duration: `${(8 + r(5) * 8).toFixed(2)}s`,
    };
  }), [count]);
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-[5] overflow-hidden">
      {particles.map((p, i) => (
        <span key={i} className="absolute rounded-full bg-honey-glow blur-[1px] animate-pollen"
          style={{ left: p.left, top: p.top, width: p.size, height: p.size,
            animationDelay: p.delay, animationDuration: p.duration,
            boxShadow: "0 0 8px rgba(255, 215, 106, 0.7)" }} />
      ))}
    </div>
  );
}
```

**Always seed positions deterministically** with `Math.sin` rather than
`Math.random` — random hydration mismatches throw runtime warnings and look
janky on first paint.

---

## Component recipes

### 1. Pill nav with sliding indicator

```tsx
const ITEMS = [{ href: "/", label: "Home" }, { href: "/foo", label: "Foo" } /* ... */];

function Nav() {
  const { pathname } = useRouter();
  return (
    <header className="relative z-20 mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
      <Link href="/" className="group flex items-center gap-3">
        <HexMark />
        <span className="text-xs uppercase tracking-wider2 text-honey-soft/80">Brand</span>
      </Link>
      <nav className="hidden md:flex items-center gap-1">
        {ITEMS.map((it) => {
          const active = pathname === it.href || (it.href !== "/" && pathname.startsWith(it.href + "/"));
          return (
            <Link key={it.href} href={it.href} className="relative px-4 py-2 text-[13px] tracking-wider2 uppercase">
              <span className={active ? "text-honey-soft" : "text-honey-soft/50 hover:text-honey-soft/90 transition-colors"}>{it.label}</span>
              {active && (
                <motion.span layoutId="nav-pill"
                  className="absolute inset-0 -z-10 rounded-full border border-honey/30 bg-honey/[0.06] shadow-honey"
                  transition={{ type: "spring", stiffness: 400, damping: 32 }} />
              )}
            </Link>
          );
        })}
      </nav>
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
```

The sliding pill (`layoutId="nav-pill"`) is signature — Framer animates the
indicator between active items. Don't replace with a static border.

### 2. Glass card with stagger reveal

```tsx
<motion.div variants={fadeUp} whileHover={{ y: -3 }}
  className="glass-panel rounded-2xl px-6 py-5 transition-shadow hover:shadow-honey">
  <div className="text-[10px] uppercase tracking-wider2 text-honey-soft/55">{label}</div>
  <div className="mt-2 text-2xl sm:text-3xl font-light text-honey-soft">
    <CountUp value={value} decimals={2} suffix={suffix} />
  </div>
</motion.div>
```

Stat values must use a count-up component (RAF-driven, eased with
`1 - (1-t)³`). Static numbers feel dead.

### 3. Primary CTA — golden pill

```tsx
<motion.button
  whileHover={{ y: -1 }}
  whileTap={{ scale: 0.97 }}
  className="rounded-full bg-gradient-to-br from-honey-soft to-honey px-7 py-3 text-[12px] font-medium tracking-wider2 uppercase text-ink shadow-honey hover:shadow-honeyStrong transition-all disabled:opacity-40 disabled:shadow-none">
  Enter the Hive
</motion.button>
```

Three signature properties: rounded-full, bg-gradient honey, ink-coloured
text. Never invert (white text on dark gradient looks generic SaaS).

### 4. Hex stage tracker (pipeline progress)

```tsx
function Hex({ status }: { status: "DONE" | "ACTIVE" | "PENDING" }) {
  return (
    <span className="relative inline-block h-7 w-7">
      {status === "DONE" && (<>
        <span className="hex-clip absolute inset-0 bg-gradient-to-br from-honey-glow via-honey to-honey-dark" />
        <span className="hex-clip absolute inset-[2px] bg-ink/80" />
        <svg viewBox="0 0 24 24" className="absolute inset-0 m-auto h-3 w-3 text-honey-glow" fill="none" stroke="currentColor" strokeWidth="2.4">
          <path d="M5 12l4 4 10-10" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </>)}
      {status === "ACTIVE" && (<>
        <span className="hex-clip absolute inset-0 bg-gradient-to-br from-honey-glow via-honey to-honey-dark" />
        <span className="hex-clip absolute inset-[2px] bg-ink/80" />
        <motion.span className="hex-clip absolute inset-[5px] bg-honey-glow/70"
          animate={{ opacity: [0.4, 1, 0.4] }}
          transition={{ duration: 2.4, ease: "easeInOut", repeat: Infinity }} />
      </>)}
      {status === "PENDING" && (<>
        <span className="hex-clip absolute inset-0 bg-honey/15" />
        <span className="hex-clip absolute inset-[2px] bg-ink/80" />
      </>)}
    </span>
  );
}
```

Use anywhere a "step N of M" indicator would normally go. Reads as a
honeycomb fragment when laid out horizontally.

### 5. Hex dome hero (the signature centrepiece)

For landing-page hero / app dashboard centrepiece. Pure SVG + CSS perspective
— **no Three.js**. The illusion of depth comes from `rotateX(38deg) +
scaleY(0.92)` and per-cell size scaling near the rim.

Key parameters that ship the right look:
- `RING_COUNT = 9-10`, `HEX_BASE_SIZE = 11-13`, `DOME_RADIUS = 218-230`
- `LIT_PROBABILITY` between **0.32 and 0.44** — below 0.3 it looks dead;
  above 0.5 it loses detail
- Each lit cell: independent `pulseDelay` (0..5s) and `pulseDuration` (1.8-4s)
  derived from `Math.sin(q*… + r*…)` so they shimmer asynchronously
- Two halo layers behind the dome counter-pulsing (3.2s + 4.6s)
- 30-50 sparkles around the rim using `hexPulse` with random delays
- Mouse-tracked parallax: `useSpring`-smoothed `rotateX/rotateY` overrides
  the base tilt; reset to neutral on `pointerleave`

Full implementation pattern (~300 lines) — generate from these parameters.
Avoid temptation to add a "central logo" hex; the dome looks better as a
continuous surface.

### 6. Idea / proposal card with drag-to-vote

For governance-style apps, swipe interactions feel right. Framer's `drag`
with offset thresholds:

```tsx
<motion.div
  drag="x"
  dragConstraints={{ left: 0, right: 0 }}
  dragElastic={0.2}
  onDragEnd={(_, info) => {
    if (info.offset.x > 140) onApprove();
    else if (info.offset.x < -140) onReject();
  }}
  whileDrag={{ scale: 1.02 }}
  className="cursor-grab active:cursor-grabbing">
  {/* card content */}
</motion.div>
```

### 7. Honey-stream rewards visualisation

Vertical bars falling top→bottom, deterministic positions:

```tsx
function NectarFlow({ streams = 7, intensity = 0.7 }) {
  const lanes = useMemo(() => Array.from({ length: streams }, (_, i) => {
    const r = (n) => ((Math.sin(i * 73 + n) + 1) / 2);
    return {
      left: `${(i / (streams - 1)) * 100}%`,
      width: `${(1 + r(1) * 1.5).toFixed(2)}px`,
      delay: `${(r(2) * 4).toFixed(2)}s`,
      duration: `${(4 + r(3) * 4).toFixed(2)}s`,
      opacity: 0.3 + r(4) * 0.5 * intensity,
    };
  }), [streams, intensity]);
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl">
      {lanes.map((l, i) => (
        <span key={i} className="honey-stream absolute top-0 h-[160%] w-px animate-flowDown"
          style={{ left: l.left, width: l.width, opacity: l.opacity,
            animationDelay: l.delay, animationDuration: l.duration }} />
      ))}
    </div>
  );
}
```

### 8. Form inputs — underline only

```tsx
{/* Amount input */}
<div className="flex items-center gap-2 border-b border-honey/15 pb-2 transition-colors focus-within:border-honey/60">
  <input className="flex-1 bg-transparent text-2xl sm:text-3xl font-light text-honey-soft outline-none placeholder:text-honey-soft/20 numeric"
    placeholder="0.0" inputMode="decimal" value={value} onChange={...} />
  <button onClick={setMax}
    className="rounded-full border border-honey/20 px-3 py-1 text-[10px] uppercase tracking-wider2 text-honey-soft/70 hover:border-honey/50 hover:text-honey-soft transition-colors">
    Max
  </button>
</div>

{/* Multi-line "why" textarea — bordered, slightly inset */}
<textarea rows={4} className="w-full resize-none bg-honey/[0.02] border border-honey/15 rounded-xl px-4 py-3 text-sm text-honey-soft placeholder:text-honey-soft/25 outline-none transition-colors focus:border-honey/45" />
```

Never use a boxed input with a heavy border. Underlines for primary numeric
inputs, soft-bordered rounded textareas for prose.

---

## Layout system

- **Page max-width**: `max-w-6xl mx-auto px-6` (1152px). Don't go wider.
- **Top nav**: 6px top/bottom padding (`py-6`), centered logo+nav+connect.
- **Hero**: centered headline, eyebrow + headline + subline + CTA + ambient
  visual (dome / particles).
- **Stat row**: 3 columns (`grid-cols-1 sm:grid-cols-3 gap-4`), glass cards,
  count-up values.
- **Detail page**: hero panel (with category-tinted blob in corner) + stages
  + content sections each separated by `mt-12`.

```tsx
function Layout({ children }) {
  const { pathname } = useRouter();
  return (
    <>
      <HoneycombBackground />
      <PollenParticles />
      <Nav />
      <AnimatePresence mode="wait">
        <motion.main key={pathname}
          initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
          className="relative z-10 mx-auto w-full max-w-6xl px-6 pb-24">
          {children}
        </motion.main>
      </AnimatePresence>
    </>
  );
}
```

---

## Typography rules

| Element | Class |
|---|---|
| Eyebrow (above heading) | `text-[10px] uppercase tracking-wider2 text-honey-soft/55` |
| Hero heading | `text-3xl sm:text-5xl font-light tracking-tight text-gradient-honey` |
| Section heading | `text-xl font-light text-honey-soft` |
| Body | `text-sm text-honey-soft/65` (or `/70` for slightly stronger) |
| Subdued body | `text-[12px] text-honey-soft/45` |
| Numbers | always add `numeric` class (tabular nums) |
| Mono code spans | `<code className="rounded bg-honey/[0.06] px-1.5 py-0.5 text-[12.5px] text-honey-soft numeric">` |

**Always use `font-light`** as the body weight. The system has no `font-bold`
anywhere — emphasis comes from colour, not weight.

**Never lowercase a heading.** Either eyebrows (uppercase tracked) or
title-case headings. Lowercase headings read amateur.

---

## Composition rules

- Pad container heroes with `pt-6 sm:pt-12` and bottom-pad pages with
  `pb-24`.
- Sections separated by `mt-12` to `mt-16`.
- Cards use `rounded-2xl` (1rem radius). Buttons use `rounded-full`. Tiny
  pills use `rounded-full px-3 py-1 text-[10px]`.
- Borders: always `border-honey/<alpha>` — never solid `#fff`.
- Shadows: only the two `shadow-honey` / `shadow-honeyStrong` variants. Never
  `shadow-lg` defaults.
- Spacing scale: `gap-2 / gap-3 / gap-4 / gap-8` and nothing in between.

---

## Hover & micro-interactions

| Surface | Hover |
|---|---|
| Card | `whileHover={{ y: -2 or -3 }}` + `hover:shadow-honey` |
| Button (primary) | `whileHover={{ y: -1 }}` + `hover:shadow-honeyStrong` |
| Button (ghost) | `hover:border-honey/45 hover:text-honey-soft transition-colors` |
| Nav link | text colour bumps, no transform |
| Idea card | `whileDrag={{ scale: 1.02 }}` (drag-to-vote) |

**Tap is always `whileTap={{ scale: 0.97 }}`** for a subtle press-in.

---

## Accessibility

- All decorative animations use `aria-hidden`.
- Hex marks in nav: provide `aria-label` text on the parent link.
- Particles, halos, gradients: `pointer-events-none`.
- Honour `prefers-reduced-motion`: every CSS keyframe should sit inside a
  `@media (prefers-reduced-motion: no-preference)` guard. The system as
  shipped does NOT do this — add it before going to production:
  ```css
  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after {
      animation-duration: 0.01ms !important;
      animation-iteration-count: 1 !important;
      transition-duration: 0.01ms !important;
    }
  }
  ```

---

## Quick checklist when applying this skill

When given a brief, run through this:

- [ ] Tailwind config has the honey palette + the 5 named keyframes.
- [ ] `globals.css` has `hex-clip`, `honeycomb-bg`, `glass-panel`,
      `text-gradient-honey`, `numeric`, `hexPulse`, `dome-perspective`,
      `honey-stream`.
- [ ] Layout mounts `HoneycombBackground` + `PollenParticles` + `Nav`
      with page transitions on `<motion.main>`.
- [ ] Inter loaded with `font-light` default.
- [ ] All eyebrows use `text-[10px] uppercase tracking-wider2`.
- [ ] All numbers use `numeric` class.
- [ ] Stat values animate via a CountUp component, not a static span.
- [ ] Every interactive surface has a `whileHover` lift and a
      `whileTap` press.
- [ ] No purple, no neon green, no `font-bold`, no emoji (unless asked).
- [ ] Pollen + halos + grids respect SSR (deterministic seeded positions).
- [ ] Per-cell pulses use CSS `@keyframes hexPulse`, never one motion
      component per cell.
- [ ] Page transitions wrap `motion.main` with `AnimatePresence mode="wait"`.

---

## Tuning knobs (when feedback rolls in)

**"Too busy / overwhelming"**: drop `LIT_PROBABILITY` 0.44 → 0.32, slow per-
cell pulse to `2.6 + r·2.6`, reduce sparkle count to ~20.

**"Feels dead / not alive enough"**: bump `LIT_PROBABILITY` to 0.5, speed
pulse to `1.6 + r·1.8`, add a 60-90s `rotateSlow` on the dome surface, add
a counter-pulsing secondary halo.

**"Hover is too aggressive"**: drop `hoverBoost` from 1.85 to 1.4, reduce
parallax tilt range from ±14° to ±8°.

**"Too gold / monochromatic"**: introduce a single accent (e.g.
`honey-glow` highlight on hottest cells only) — but resist adding a second
hue. The single-palette discipline is what makes this aesthetic read as
premium.

**"Glass panels don't show"**: the deep ink + 12% opacity border is
intentional. If the user wants more visible, push border to `honey/25` and
add `bg-honey/[0.04]` — but stop there. Frosted-glass cards look generic.
