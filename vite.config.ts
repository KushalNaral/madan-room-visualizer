import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import dts from 'vite-plugin-dts'
import pkg from './package.json' with { type: 'json' }

// `vite` / `vite build --mode playground` serve the playground app (index.html).
// `vite build` produces the library bundle consumed by Madan's storefront.
export default defineConfig(({ command, mode }) => {
  const isLib = command === 'build' && mode !== 'playground'
  return {
    plugins: [
      vue(),
      ...(isLib ? [dts({ include: ['src'], tsconfigPath: './tsconfig.app.json' })] : []),
    ],
    publicDir: isLib ? false : 'public',
    resolve: {
      alias: { '@': resolve(__dirname, 'src') },
    },
    build: isLib
      ? {
          lib: {
            entry: { 'room-visualizer': resolve(__dirname, 'src/index.ts'), mock: resolve(__dirname, 'src/mock.ts'), url: resolve(__dirname, 'src/url.ts'), editor: resolve(__dirname, 'src/editor.ts'), 'editor-worker': resolve(__dirname, 'src/editor-worker.ts') },
            formats: ['es'],
          },
          rollupOptions: {
            // Dependencies are resolved by the host app, not bundled.
            external: (id) => [...Object.keys(pkg.dependencies ?? {}), ...Object.keys(pkg.peerDependencies ?? {})].some((d) => id === d || id.startsWith(d + '/')),
          },
        }
      : { outDir: 'dist-playground' },
    test: {
      environment: 'node',
      include: ['tests/**/*.test.ts'],
    },
  }
})
