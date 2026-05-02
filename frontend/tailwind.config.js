/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./pages/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
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
        sans: [
          "Inter",
          "Satoshi",
          "Neue Haas Grotesk",
          "ui-sans-serif",
          "system-ui",
          "sans-serif",
        ],
        mono: [
          "JetBrains Mono",
          "ui-monospace",
          "SFMono-Regular",
          "Menlo",
          "monospace",
        ],
      },
      letterSpacing: {
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
  plugins: [],
};
