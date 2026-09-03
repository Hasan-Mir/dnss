import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { fileURLToPath } from 'node:url';

export default defineConfig({
    plugins: [react(), tailwindcss(), viteSingleFile()],
    root: fileURLToPath(new URL('.', import.meta.url)),
    build: {
        outDir: fileURLToPath(new URL('./dist', import.meta.url)),
        emptyOutDir: true,
        target: 'es2022',
    },
    resolve: {
        alias: {
            '@gui': fileURLToPath(
                new URL('../packages/gui/src', import.meta.url)
            ),
            '@seymi/dnss-core/presets': fileURLToPath(
                new URL('../packages/core/src/presets.ts', import.meta.url)
            ),
            '@seymi/dnss-core/validate': fileURLToPath(
                new URL('../packages/core/src/validate.ts', import.meta.url)
            ),
        },
    },
});
