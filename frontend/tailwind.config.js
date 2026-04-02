/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#f0fdf1",
          100: "#dcfce0",
          200: "#bbf7c3",
          300: "#86ef96",
          400: "#4ade63",
          500: "#22c53e",
          600: "#2b6e33",
          700: "#246129",
          800: "#1a5420",
          900: "#14451a",
          950: "#0a2b0f",
        },
        accent: {
          400: "#a8be32",
          500: "#8fa329",
          600: "#738520",
        },
      },
    },
  },
  plugins: [],
};
