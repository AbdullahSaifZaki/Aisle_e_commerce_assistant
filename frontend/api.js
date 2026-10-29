import { AuthenticationRequiredError } from './auth.js';

export function createChatApi(auth, config, fetchRequest = globalThis.fetch) {
  return async (payload) => {
    const token = await auth.getAccessToken();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config.timeoutMs);
    try {
      const response = await fetchRequest(config.apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
        signal: controller.signal,
        redirect: 'error',
      });
      if (response.status === 401) throw new AuthenticationRequiredError();
      if (!response.ok) throw new Error('Request failed');
      const data = await response.json();
      if (typeof data.response !== 'string' || !data.response.trim()) throw new Error('Invalid response');
      if (typeof data.thread_id !== 'string' || !data.thread_id.trim()) throw new Error('Invalid conversation ID');
      return data;
    } finally {
      clearTimeout(timeout);
    }
  };
}
