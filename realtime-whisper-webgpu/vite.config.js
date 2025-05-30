import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import electron from 'vite-plugin-electron';
import renderer from 'vite-plugin-electron-renderer';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    electron([
      {
        entry: 'electron/main.js',
      },
    ]),
    renderer(),
  ],
  base: process.env.NODE_ENV === 'development' ? '/' : './', 
   worker: {
    format: 'es'
  },  build: {
    target: 'esnext', // or 'es2022'
  }
});
