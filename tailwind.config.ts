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
        // Vikas VayuSaathi Warm Editorial Palette
        stone: {
          50: '#FAF9F5',
          100: '#F6F5F0',
          200: '#EBE8DF',
          300: '#DCD9D0',
          400: '#B8B3A7',
          500: '#8B8679',
          600: '#5E594D',
          700: '#3D382E',
          800: '#2A251C',
          900: '#1A1610',
        },
        ink: {
          DEFAULT: '#18201D',
          light: '#2C3833',
          muted: '#52605A',
          faint: '#879690',
        },
        sage: {
          50: '#F2F7F5',
          100: '#E4EFEA',
          200: '#C7DFD5',
          300: '#9FC5B6',
          500: '#3B866E',
          600: '#236B56',
          700: '#1B5343',
          800: '#154135',
        },
        terracotta: {
          50: '#FDF5F2',
          100: '#FBEAE3',
          200: '#F6D3C4',
          300: '#EEB29A',
          500: '#DA633D',
          600: '#C4512C',
          700: '#9C3E20',
          800: '#752E17',
        },
      },
    },
  },
  plugins: [],
};

export default config;
