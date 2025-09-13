// Small wrapper around axios for making requests to the Kinguin ESA API
// with automatic retries on 429/5xx responses. Provides helpers to
// generate ISO timestamps with Z suffix (no milliseconds).

const axios = require('axios');

// Pull the base URL and API key from environment variables.
// Fallback to ESA sandbox if not provided.
const KINGUIN_BASE = process.env.KINGUIN_API_BASE || 'https://gateway.kinguin.net/esa/api';
const KINGUIN_KEY = process.env.KINGUIN_API_KEY;

// Warn at startup if the key is missing
if (!KINGUIN_KEY) {
  console.warn('[kinguinClient] KINGUIN_API_KEY is not set!');
}

// Create a preconfigured axios instance
const client = axios.create({
  baseURL: KINGUIN_BASE,
  headers: { 'X-Api-Key': KINGUIN_KEY },
  timeout: 30000,
});

// Generic retry helper with exponential backoff and jitter
async function withRetry(fn, { retries = 4 } = {}) {
  let attempt = 0;
  let lastErr;
  while (attempt <= retries) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const status = err?.response?.status;
      // Only retry on Too Many Requests or transient server errors
      if (!(status === 429 || (status >= 500 && status < 600))) {
        break;
      }
      // Exponential backoff: 2^attempt * 2s, capped at 15s, plus some jitter
      const backoff = Math.min(2000 * Math.pow(2, attempt), 15000) + Math.random() * 500;
      await new Promise((resolve) => setTimeout(resolve, backoff));
      attempt++;
    }
  }
  throw lastErr;
}

// Produce a current ISO timestamp without milliseconds and with a trailing Z
function isoNowZ() {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
}

module.exports = { client, withRetry, isoNowZ };