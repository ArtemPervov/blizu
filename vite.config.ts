import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: { proxy: { "/api": "http://127.0.0.1:3001" } },
  build: {
    rollupOptions: {
      output: {
        // Shared React runtime stays separate from the lazily loaded 3D scene.
        manualChunks: {
          vendor: ["react", "react-dom", "react-dom/client", "react/jsx-runtime"],
          three: ["three", "@react-three/fiber"],
        },
      },
    },
  },
});
