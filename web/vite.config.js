import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// VITE_BASE = "/nombre-del-repo/" para GitHub Pages (project site).
// Déjalo en "/" si el repo se llama <usuario>.github.io.
export default defineConfig({
  plugins: [react()],
  base: process.env.VITE_BASE || '/',
});
