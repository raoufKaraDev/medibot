// API base URL — reads from env var injected by Vercel/Railway at build time.
// Locally: Vite proxy handles /api → localhost:8000 (see vite.config.ts)
// Production: set VITE_API_BASE_URL env var in Vercel dashboard to your Railway URL
const config = {
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL ?? '',
};

export default config;
