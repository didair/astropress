import { defineConfig } from 'astro/config';
import astropress from 'astropress/astro';

export default defineConfig({
  output: 'server',
  integrations: [astropress()],
  vite: {
    server: {
      ws: {
        protocol: 'ws',
        host: 'localhost',
        clientPort: 3000,
      },
    },
  },
});
