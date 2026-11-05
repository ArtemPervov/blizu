import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: { proxy: { "/api": "http://127.0.0.1:3001" } },
  build: {
    rollupOptions: {
      output: {
        // Keep React and its shared helpers out of the optional WebGL bundle.
        onlyExplicitManualChunks: true,
        manualChunks(id) {
          const path = id.replaceAll("\\", "/");
          if (/node_modules\/(react|react-dom|scheduler)\//.test(path))
            return "vendor";
          if (
            /node_modules\/(three|@react-three\/fiber|react-reconciler)\//.test(
              path,
            )
          )
            return "three";
        },
      },
    },
  },
});
