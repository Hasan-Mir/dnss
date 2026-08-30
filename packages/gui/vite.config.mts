import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';

// Tauri expects a fixed dev port; failing to start is better than silently
// using another port that the Rust shell would not connect to.
export default defineConfig({
    plugins: [react(), tailwindcss()],
    clearScreen: false,
    resolve: {
        alias: {
            // Use the TypeScript sources directly to avoid CJS/ESM interop
            // issues with the workspace package's CommonJS build.
            '@seymi/dnss-core/presets': fileURLToPath(
                new URL('../core/src/presets.ts', import.meta.url)
            ),
            '@seymi/dnss-core/validate': fileURLToPath(
                new URL('../core/src/validate.ts', import.meta.url)
            ),
        },
    },
    server: {
        port: 1420,
        strictPort: true,
        watch: {
            // The Rust shell lives inside the vite root (packages/gui), so
            // chokidar would otherwise watch src-tauri/target too. Cargo's
            // linker locks dnss_lib.dll while (re)writing it and fs.watch
            // then fails with EBUSY, which crashes the whole `tauri dev`
            // session. The tauri CLI does its own cargo watching.
            ignored: ['**/src-tauri/**'],
        },
    },
    envPrefix: ['VITE_', 'TAURI_'],
    build: {
        // Tauri supports es2021; do not target newer ES versions.
        target: 'es2021',
        minify: 'esbuild',
        sourcemap: false,
    },
});
