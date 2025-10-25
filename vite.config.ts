import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import checker from 'vite-plugin-checker';
import path from 'path';
import { copyFileSync, existsSync } from 'fs';

export default defineConfig({
  plugins: [
    react(),
    // TypeScript type checking on dev server
    checker({
      typescript: {
        tsconfigPath: './tsconfig.json',
      },
    }),
    // Plugin to copy BIOS files to dist-web during build
    {
      name: 'copy-bios-files',
      writeBundle() {
        const biosFiles = ['third_party/mame/roms/sms/mpr-12808.ic2', 'mpr-10052.rom', 'bios13fx.sms'];
        biosFiles.forEach(file => {
          const srcPath = path.resolve(__dirname, file);
          const fileName = path.basename(file);
          const destPath = path.resolve(__dirname, 'dist-web', fileName);
          if (existsSync(srcPath)) {
            copyFileSync(srcPath, destPath);
            console.log(`Copied ${file} to dist-web/${fileName}`);
          }
        });
      },
    },
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    target: 'es2022',
    outDir: 'dist-web',
    sourcemap: true,
  },
  server: {
    port: 3000,
  },
});
