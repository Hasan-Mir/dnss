import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

// Tauri expects a fixed dev port; failing to start is better than silently
// using another port that the Rust shell would not connect to.
export default defineConfig({
    plugins: [react()],
    clearScreen: false,
    resolve: {
        alias: {
            // Use the TypeScript sources directly to avoid CJS/ESM interop
            // issues with the workspace package's CommonJS build.
            '@dnss/core/presets': fileURLToPath(
                new URL('../core/src/presets.ts', import.meta.url)
            ),
            '@dnss/core/validate': fileURLToPath(
                new URL('../core/src/validate.ts', import.meta.url)
            ),
        },
    },
    server: {
        port: 1420,
        strictPort: true,
    },
    envPrefix: ['VITE_', 'TAURI_'],
    build: {
        // Tauri supports es2021; do not target newer ES versions.
        target: 'es2021',
        minify: 'esbuild',
        sourcemap: false,
    },
});
