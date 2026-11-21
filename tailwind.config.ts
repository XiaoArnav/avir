import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        background: '#090d16',
        card: '#111827',
        'card-border': '#1f2937',
        primary: {
          DEFAULT: '#10b981',
          hover: '#059669',
        },
        warning: '#f59e0b',
        danger: '#ef4444',
        hazardous: '#7c3aed',
      },
    },
  },
  plugins: [],
};

export default config;
