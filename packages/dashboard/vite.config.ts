import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Vite SPA (no SSR) — sidesteps the Next.js `SuiClientProvider`/turbopack issue.
// React app wiring lands in Step 6.
export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
});
