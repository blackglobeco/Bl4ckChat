/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        "terminal-green": "#00ff00",
        "terminal-dark": "#0a0a0a",
        "terminal-gray": "#333333",
      },
      fontFamily: {
        mono: ["SF Mono", "Monaco", "Inconsolata", "Roboto Mono", "monospace"],
      },
    },
  },
  plugins: [],
};
