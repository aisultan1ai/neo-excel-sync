import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          "vendor-react":  ["react", "react-dom", "react-router-dom"],
          "vendor-grid":   ["ag-grid-community", "ag-grid-react"],
          "vendor-flow":   ["reactflow"],
          "vendor-xlsx":   ["xlsx"],
          "vendor-ui":     ["lucide-react", "react-toastify"],
        },
      },
    },
  },
});
