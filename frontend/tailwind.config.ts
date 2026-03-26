import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "#0a0a0a",
        foreground: "#fafafa",
        primary: {
          DEFAULT: "#a3e635",
          foreground: "#0a0a0a",
        },
        muted: {
          DEFAULT: "#262626",
          foreground: "#a3a3a3",
        },
        border: "#262626",
        input: "#1a1a1a",
        ring: "#a3e635",
        destructive: {
          DEFAULT: "#ef4444",
          foreground: "#fafafa",
        },
        card: {
          DEFAULT: "#111111",
          foreground: "#fafafa",
        },
        accent: {
          DEFAULT: "#1a1a1a",
          foreground: "#fafafa",
        },
        popover: {
          DEFAULT: "#111111",
          foreground: "#fafafa",
        },
        secondary: {
          DEFAULT: "#1a1a1a",
          foreground: "#a3a3a3",
        },
      },
      borderRadius: {
        lg: "0.5rem",
        md: "0.375rem",
        sm: "0.25rem",
      },
    },
  },
  plugins: [],
};

export default config;
