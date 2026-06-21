import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        command: {
          ink: "#0b1120",
          panel: "#111827",
          line: "#243041",
          cyan: "#22d3ee",
          green: "#34d399",
          amber: "#f59e0b",
          red: "#fb7185"
        }
      }
    }
  },
  plugins: []
};

export default config;
