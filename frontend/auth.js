export class AuthenticationRequiredError extends Error {
  constructor() {
    super('Please log in again to continue. Your message is saved.');
  }
}

export function createAuth(config, Client, browser = globalThis.window) {
  if (!config.domain || !config.clientId || !config.audience) {
    throw new Error('Auth0 configuration is missing. Check the frontend environment variables.');
  }
  const home = `${browser.location.origin}/`;
  const client = new Client({
    domain: config.domain,
    clientId: config.clientId,
    cacheLocation: 'memory',
    authorizationParams: {
      redirect_uri: home,
      audience: config.audience,
      scope: 'openid profile email',
    },
  });

  return {
    async initialize() {
      const params = new URLSearchParams(browser.location.search);
      if (params.has('state') && (params.has('code') || params.has('error'))) {
        let returnTo = '/';
        try {
          const result = await client.handleRedirectCallback();
          const target = new URL(result.appState?.returnTo || '/', home);
          if (target.origin === browser.location.origin) {
            returnTo = target.pathname + target.search + target.hash;
          }
        } finally {
          browser.history.replaceState({}, '', returnTo);
        }
      } else {
        await client.checkSession();
      }
      return await client.isAuthenticated() ? await client.getUser() : null;
    },
    login() {
      return client.loginWithRedirect({
        appState: { returnTo: browser.location.pathname + browser.location.search + browser.location.hash },
      });
    },
    logout() {
      return client.logout({ logoutParams: { returnTo: home } });
    },
    async getAccessToken() {
      try {
        return await client.getTokenSilently();
      } catch (error) {
        if (['login_required', 'consent_required', 'interaction_required', 'missing_refresh_token'].includes(error.error)) {
          throw new AuthenticationRequiredError();
        }
        throw error;
      }
    },
  };
}
