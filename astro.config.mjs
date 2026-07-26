import { defineConfig } from 'astro/config';
import astropress from './src/astro.ts';

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
