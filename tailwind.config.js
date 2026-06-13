/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        canvas: "#FAFAF8",
        card: "#FFFFFF",
        line: "#E5E5E2",
        accent: "rgb(var(--accent) / <alpha-value>)",
        accent2: "rgb(var(--accent2) / <alpha-value>)",
        success: "#057A55",
        warning: "#C27803",
        danger: "#B91C1C",
        ink: "#1A1A18",
        muted: "#6B6B66",
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      borderRadius: {
        card: "12px",
        xl2: "16px",
      },
      boxShadow: {
        card: "0 1px 2px rgba(16,24,40,.04), 0 1px 3px rgba(16,24,40,.06)",
        cardHover: "0 10px 28px -8px rgba(16,24,40,.18)",
        pop: "0 16px 40px -12px rgba(16,24,40,.28)",
      },
      maxWidth: {
        content: "1100px",
      },
      transitionDuration: {
        DEFAULT: "150ms",
      },
      keyframes: {
        fadeInUp: {
          "0%": { opacity: "0", transform: "translateY(6px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
      },
      animation: {
        fadeInUp: "fadeInUp .35s ease-out both",
        shimmer: "shimmer 1.4s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};
