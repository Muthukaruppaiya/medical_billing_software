/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50:  '#ecfdf8',
          100: '#d1faf0',
          200: '#a7f3e1',
          300: '#6ee7cb',
          400: '#34d3a8',
          500: '#0d9488',
          600: '#0f766e',
          700: '#115e59',
          800: '#134e4a',
          900: '#134040',
        },
        sidebar: {
          bg:      '#0f1f1c',
          hover:   '#1a3330',
          active:  '#0d9488',
          text:    '#9cb5b0',
          textActive: '#ffffff',
        },
        surface: {
          bg:    '#f3f7f6',
          card:  '#ffffff',
          border:'#d7e5e1',
        },
        success: '#059669',
        warning: '#d97706',
        danger:  '#dc2626',
        info:    '#0891b2',
      },
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'Segoe UI', 'system-ui', 'sans-serif'],
        display: ['"Plus Jakarta Sans"', 'Segoe UI', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        xl: '0.85rem',
        '2xl': '1.15rem',
      },
      boxShadow: {
        card: '0 1px 2px rgba(15, 31, 28, 0.04), 0 8px 24px rgba(15, 31, 28, 0.06)',
        'card-hover': '0 4px 8px rgba(15, 31, 28, 0.06), 0 16px 32px rgba(13, 148, 136, 0.12)',
        sidebar: '4px 0 24px rgba(15, 31, 28, 0.25)',
        panel: 'inset 0 1px 0 rgba(255,255,255,0.7), 0 10px 30px rgba(15, 31, 28, 0.06)',
      },
      backgroundImage: {
        'app-mesh':
          'radial-gradient(ellipse 80% 50% at 0% -20%, rgba(13,148,136,0.12), transparent), radial-gradient(ellipse 60% 40% at 100% 0%, rgba(5,150,105,0.08), transparent)',
      },
      animation: {
        'fade-in': 'fadeIn 0.25s ease-out',
        'slide-in': 'slideIn 0.25s ease-out',
        'marquee': 'marquee 25s linear infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0', transform: 'translateY(6px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideIn: {
          '0%': { opacity: '0', transform: 'translateX(-8px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        marquee: {
          '0%': { transform: 'translateX(100vw)' },
          '100%': { transform: 'translateX(-100%)' },
        },
      },
    },
  },
  plugins: [],
}
