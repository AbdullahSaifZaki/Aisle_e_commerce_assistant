# Aisle frontend

A plain JavaScript shopping assistant with Auth0 Universal Login and a FastAPI chat API. Vite bundles the Auth0 SPA SDK and serves the app.

## Run locally

Use Node.js 22.12+ (Node.js 24 is supported). In `aisle_frontend`:

```sh
npm ci
# Only for a new checkout; this workspace already has .env.local configured.
cp .env.example .env.local
npm run dev
```

Open http://127.0.0.1:8770/. The previous Python static-server command no longer runs the source app: Vite is needed for package imports and environment variables.

Start FastAPI in another terminal from the project root, with the existing database/model dependencies and `.env` configured:

```sh
.venv/bin/python -m pip install -r requirements.txt
.venv/bin/python -m uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

The existing backend also uses `langgraph-checkpoint-postgres` and its PostgreSQL driver. Keep those installed along with the project dependencies.

## Auth0 configuration

The local environment files are configured for the supplied application. No client secret is used by the browser.

```dotenv
VITE_AUTH0_DOMAIN=dev-yw3c8i0syadd7fol.us.auth0.com
VITE_AUTH0_CLIENT_ID=cjDAdSCutQn6w5YkbfFQc6KSenrRs29b
VITE_AUTH0_AUDIENCE=https://api.aisle.app
VITE_API_URL=/api/chat
```

In Auth0, open **Applications → Frontend Aisle → Settings** and use application type **Single Page Application**. Configure these exact values (comma-separated when entering both hosts):

| Setting | Values |
| --- | --- |
| Allowed Callback URLs | `http://127.0.0.1:8770/`, `http://localhost:8770/` |
| Allowed Logout URLs | `http://127.0.0.1:8770/`, `http://localhost:8770/` |
| Allowed Web Origins | `http://127.0.0.1:8770`, `http://localhost:8770` |

Save the application settings. Enable the login connections you want on this application.

The latest local login check reached the callback but returned `invalid_request`: the frontend client is not authorized to access `https://api.aisle.app`. Under **APIs → your Aisle API → Application Access**, authorize **User-Delegated Access** for the Frontend Aisle application (client ID `cjDAdSCutQn6w5YkbfFQc6KSenrRs29b`). The API's user access policy must permit this application. See [Auth0 API access policies](https://auth0.com/blog/developers-guide-api-access-policies-auth0/). This is a tenant configuration change; local code cannot grant itself access.

Startup errors now distinguish authentication from chat initialization. Authentication errors display a diagnostic code; development builds also log the provider description for `invalid_request`, with callback query credentials redacted.

Under **APIs**, ensure the API identifier is exactly `https://api.aisle.app` and the signing algorithm is **RS256**. This identifier is the token audience; it does not determine where HTTP chat requests are sent.

The backend `.env` needs:

```dotenv
AUTH0_DOMAIN=dev-yw3c8i0syadd7fol.us.auth0.com
AUTH0_AUDIENCE=https://api.aisle.app
CORS_ORIGINS=http://127.0.0.1:8770,http://localhost:8770
```

The backend also needs its existing `OPENAI_API_KEY`, `ECOMMERCE_DATABASE_URL`, and `MEMORY_DATABASE_URL`. Restart the frontend and backend after changing environment values.

## Login and API behavior

- The app first checks the Auth0 session. Signed-out visitors see the Aisle login page.
- **Log in** opens Auth0 Universal Login using the SDK’s authorization code flow with PKCE.
- The SDK handles the redirect, verifies the transaction, and exchanges the code. Callback parameters are removed from the address bar; return paths are restricted to this origin.
- Authenticated users see chat, their account name, and **Log out**. Logout clears the SDK session and returns through Auth0 to the app.
- Before every chat request, `getTokenSilently()` retrieves a cached or renewed **access token**. It is sent as `Authorization: Bearer <access_token>`; no ID token is sent to FastAPI.
- Tokens use the SDK’s memory cache, never application localStorage. On reload the SDK attempts to restore the Auth0 session. Browsers that block silent authentication may require another login.
- A token-expiry/login-required error or API 401 returns the user to login while preserving the unanswered message. After login, **Try again** resends it explicitly; chat POSTs are not automatically replayed.
- FastAPI validates RS256 signatures using the tenant JWKS, exact issuer, audience, expiration, and subject. Missing/invalid tokens return 401; missing configuration or a JWKS connection outage returns 503.
- CORS permits the `Authorization` and `Content-Type` headers for configured origins.

The existing request and response shapes are preserved:

```http
POST /chat
Content-Type: application/json
Authorization: Bearer <access_token>
```

```json
{ "message": "Find me white sneakers", "thread_id": "browser-conversation-uuid", "generate_title": true }
```

```json
{ "response": "What size and budget do you have in mind?", "thread_id": "browser-conversation-uuid", "title": "Find White Sneakers" }
```

Vite proxies `/api/chat` to `http://127.0.0.1:8000/chat` in development and local preview. Requests time out after 45 seconds after token acquisition. A timed-out request may still finish on the server, so retry is not guaranteed to be idempotent.

Conversation history stays in this browser and is now separated by Auth0 subject. Backend checkpoint IDs are derived from both the verified subject and conversation ID. Old anonymous history/checkpoints are left intact but not automatically attached to an account because their owner cannot be established. Browser history is convenience storage, not encrypted storage; people with access to this browser profile can inspect it.

## Build and deploy

```sh
npm run build
npm run preview
```

Deploy `dist/` to a static host. Configure the host to proxy `/api/chat` to FastAPI `/chat`, or set `VITE_API_URL` to your HTTPS backend `/chat` URL before building. Vite’s development proxy is not part of the static build. For a separate API origin, include the production frontend origin in backend `CORS_ORIGINS`.

On iPhone, use the browser's **Add to Home Screen** action and launch the new aisle icon to open the standalone app without browser toolbars. A regular browser tab retains its own status and address bars. The chat shell follows the visual viewport while the keyboard is open.

Add the production frontend URL with a trailing `/` to Auth0 Allowed Callback URLs and Allowed Logout URLs; add its origin without a trailing slash to Allowed Web Origins. Use HTTPS in production. All `VITE_*` values are public build-time configuration; never place secrets there.

## Verification

From `aisle_frontend`:

```sh
npm test
npm run build
```

From the project root:

```sh
.venv/bin/python -m unittest discover -s tests -v
```

Frontend tests cover callback success/failure, return URL safety, login/logout controls, session expiry, bearer headers, chat rendering and account-scoped history. Backend tests verify real RSA-signed test tokens, reject forged/expired/wrong-audience tokens, check CORS, and confirm checkpoint isolation. LLM/database calls are stubbed; these checks do not generate model traffic. Completing a real login and authenticated live chat requires the Auth0 dashboard settings above and a running backend.

Implementation follows the [Auth0 SPA SDK documentation](https://auth0.com/docs/libraries/auth0-single-page-app-sdk), [PyJWT validation documentation](https://pyjwt.readthedocs.io/en/stable/usage.html), and [FastAPI CORS documentation](https://fastapi.tiangolo.com/tutorial/cors/).
