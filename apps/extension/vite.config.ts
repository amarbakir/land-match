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

const aliases = {
  react: 'preact/compat',
  'react-dom': 'preact/compat',
};

// Content scripts are loaded as classic scripts by Chrome — they cannot use
// ES module import/export syntax. We split the build: the main build produces
// ES modules for the popup + service worker (which DO support modules), and a
// second build bundles the content script as IIFE with all deps inlined.
const isContentBuild = process.env.BUILD_TARGET === 'content';

export default defineConfig(isContentBuild ? {
  plugins: [preact()],
  root: resolve(__dirname, 'src'),
  build: {
    outDir: resolve(__dirname, 'dist'),
    emptyOutDir: false,
    modulePreload: false,
    target: 'es2020',
    lib: {
      entry: resolve(__dirname, 'src/content/main.ts'),
      formats: ['iife'],
      name: 'LandMatchContent',
      fileName: () => 'content/main.js',
    },
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
      },
    },
  },
  resolve: { alias: aliases },
} : {
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
  resolve: { alias: aliases },
});
