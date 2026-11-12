/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        canvas: {
          base: '#0D111D',
          deep: '#090D16',
          surface: '#121A2B',
          surfaceMuted: '#0F1626',
          border: 'rgba(255, 255, 255, 0.08)',
          borderSubtle: 'rgba(255, 255, 255, 0.05)',
        },
        cyber: {
          teal: '#14B8A6',
          tealLight: '#2DD4BF',
          sky: '#38BDF8',
          skyLight: '#7DD3FC',
          violet: '#8B5CF6',
          violetLight: '#A78BFA',
          emerald: '#10B981',
          amber: '#F59E0B',
          rose: '#F43F5E',
        },
        brand: {
          50: '#f0f9ff',
          500: '#0284c7',
          600: '#0369a1',
          900: '#0c4a6e',
        }
      },
      boxShadow: {
        'glass': '0 20px 45px -15px rgba(0, 0, 0, 0.65)',
        'glass-sm': '0 10px 25px -5px rgba(0, 0, 0, 0.45)',
        'glow-teal': '0 0 25px -5px rgba(20, 184, 166, 0.25)',
        'glow-sky': '0 0 25px -5px rgba(56, 189, 248, 0.25)',
        'glow-violet': '0 0 25px -5px rgba(139, 92, 246, 0.25)',
      },
      backdropBlur: {
        '2xl': '24px',
      }
    },
  },
  plugins: [],
}
