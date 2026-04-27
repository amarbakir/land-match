import { resolve } from 'path';
import { copyFileSync, mkdirSync, existsSync } from 'fs';
import { defineConfig, type Plugin } from 'vite';
import preact from '@preact/preset-vite';

function copyStaticAssets(): Plugin {
  return {
    name: 'copy-static-assets',
    writeBundle() {
      mkdirSync(resolve(__dirname, 'dist'), { recursive: true });
      copyFileSync(
        resolve(__dirname, 'manifest.json'),
        resolve(__dirname, 'dist/manifest.json'),
      );
      const iconsDir = resolve(__dirname, 'public/icons');
      if (existsSync(iconsDir)) {
        const destIcons = resolve(__dirname, 'dist/icons');
        mkdirSync(destIcons, { recursive: true });
        for (const size of ['16', '48', '128']) {
          const file = `icon-${size}.png`;
          const src = resolve(iconsDir, file);
          if (existsSync(src)) copyFileSync(src, resolve(destIcons, file));
        }
      }
    },
  };
}

// Chrome MV3 content scripts run in an isolated world and CAN use static
// ES module imports as long as the imported files are listed under
// web_accessible_resources in manifest.json. However, for simplicity and
// maximum compatibility, we keep shared preact code in a web-accessible chunk.
export default defineConfig({
  plugins: [preact(), copyStaticAssets()],
  root: resolve(__dirname, 'src'),
  build: {
    outDir: resolve(__dirname, 'dist'),
    emptyOutDir: true,
    modulePreload: false,
    target: 'es2020',
    rollupOptions: {
      input: {
        'background/service-worker': resolve(__dirname, 'src/background/service-worker.ts'),
        'content/main': resolve(__dirname, 'src/content/main.ts'),
        'popup/index': resolve(__dirname, 'src/popup/index.html'),
      },
      output: {
        format: 'es',
        entryFileNames: '[name].js',
        chunkFileNames: 'chunks/[name].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
  resolve: {
    alias: {
      react: 'preact/compat',
      'react-dom': 'preact/compat',
    },
  },
});
