import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          // exceljs solo se descarga cuando se importa o exporta.
          if (id.includes("exceljs")) return "exceljs";
          if (id.includes("@supabase")) return "supabase";
        },
      },
    },
  },
});
