import type { Config } from 'tailwindcss'
import preset from './tailwind.preset.js'

export default {
  presets: [preset],
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{vue,ts}', './playground/**/*.{vue,ts}'],
} satisfies Config
