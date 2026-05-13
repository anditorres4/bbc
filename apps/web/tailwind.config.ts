import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#fdf4e7',
          100: '#fbe4c0',
          200: '#f7c87a',
          300: '#f3ac34',
          400: '#e8920f',
          500: '#c4780b',
          600: '#9f5f08',
          700: '#7b4806',
          800: '#573204',
          900: '#321d02',
        },
      },
    },
  },
  plugins: [require('@tailwindcss/forms')],
}

export default config
