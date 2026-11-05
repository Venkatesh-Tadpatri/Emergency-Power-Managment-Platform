// import react from "@vitejs/plugin-react";
// import { defineConfig } from "vite";

// export default defineConfig({
//   plugins: [react()],
//   server: {
//     host: true,
//     port: 5173,
//     watch: {
//       usePolling: true,
//     },
//   },
// });


import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    allowedHosts: true,
    watch: {
      // The Windows Docker bind mount used by this project does not reliably forward native events.
      // Keep polling scoped away from dependencies/generated output so edits still hot-reload.
      usePolling: true,
      interval: 1000,
      ignored: ["**/node_modules/**", "**/.git/**", "**/dist/**", "**/coverage/**"],
    },
  },
});
