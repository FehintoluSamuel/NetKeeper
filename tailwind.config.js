/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: { blue: "#2563EB", light: "#EFF6FF", green: "#16A34A", red: "#DC2626", amber: "#D97706", text: "#18181B", bg: "#fcfcfc" }
      }
    }
  },
  plugins: [],
}
