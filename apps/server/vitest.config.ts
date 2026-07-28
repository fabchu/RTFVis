import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    server: {
      deps: {
        // Vite kennt das (noch recht neue) eingebaute node:sqlite-Modul in dieser
        // Version nicht automatisch als Node-Builtin und versucht sonst fälschlich,
        // es als npm-Paket "sqlite" aufzulösen.
        external: [/^node:/, "sqlite", /sqlite/],
      },
    },
  },
});
