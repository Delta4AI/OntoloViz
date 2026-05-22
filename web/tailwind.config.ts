import type { Config } from "tailwindcss";

/**
 * Color tokens reference CSS variables defined in src/index.css under
 * `:root` (dark) and `:root[data-theme="light"]`. The rgb-triple +
 * `<alpha-value>` pattern preserves Tailwind's alpha-modifier support
 * (e.g. `bg-bg/85`, `border-border/60`).
 */
const themed = (name: string) => `rgb(var(${name}) / <alpha-value>)`;

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: ["selector", '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        canvas: themed("--c-canvas"),
        bg: themed("--c-bg"),
        panel: themed("--c-panel"),
        elevated: themed("--c-elevated"),
        border: themed("--c-border"),
        hairline: themed("--c-hairline"),
        ink: themed("--c-ink"),
        muted: themed("--c-muted"),
        subtle: themed("--c-subtle"),
        accent: themed("--c-accent"),
        "accent-soft": themed("--c-accent-soft"),
        "on-accent": themed("--c-on-accent"),
        ok: themed("--c-ok"),
        warn: themed("--c-warn"),
        err: themed("--c-err"),
        // legacy aliases
        surface: themed("--c-bg"),
        line: themed("--c-border"),
      },
      fontFamily: {
        sans: ["InterVariable", "Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "monospace"],
      },
      boxShadow: {
        panel:
          "0 1px 0 0 rgb(var(--c-shadow-inset) / 0.04) inset, 0 8px 24px -12px rgb(var(--c-shadow) / 0.6)",
        pop: "0 24px 60px -20px rgb(var(--c-shadow) / 0.7), 0 2px 0 0 rgb(var(--c-shadow-inset) / 0.05) inset",
      },
    },
  },
  plugins: [],
} satisfies Config;
