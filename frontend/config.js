// Frontend configuration only. Never put API keys or secrets in this file.
export const config = Object.freeze({
  demoMode: false,
  apiUrl: import.meta.env.VITE_API_URL || "/api/chat",
  timeoutMs: 45000,
  auth0: {
    domain: import.meta.env.VITE_AUTH0_DOMAIN,
    clientId: import.meta.env.VITE_AUTH0_CLIENT_ID,
    audience: import.meta.env.VITE_AUTH0_AUDIENCE,
  },
});
