import { defineConfig } from 'vite';

export default defineConfig({
  // Tell Vite that your source code and index.html are in the "public" folder
  root: 'public', 
  build: {
    // Output the bundled files to a "dist" folder in the project root
    outDir: '../dist',
    // Clean the dist folder before each build (required when outDir is outside root)
    emptyOutDir: true,
  }
});