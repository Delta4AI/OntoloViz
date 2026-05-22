import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        surface: "oklch(98% 0 0)",
        ink: "oklch(18% 0 0)",
        muted: "oklch(55% 0 0)",
        accent: "oklch(62% 0.18 250)",
        line: "oklch(90% 0 0)",
      },
      fontFamily: {
        sans: ["InterVariable", "Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "monospace"],
      },
    },
  },
  plugins: [],
} satisfies Config;
