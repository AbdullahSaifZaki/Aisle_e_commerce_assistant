import { Auth0Client } from '@auth0/auth0-spa-js';
import { config } from './config.js';
import { startChat } from './app.js';
import { mountAuth } from './auth-ui.js';

mountAuth({ config, Client: Auth0Client, startChat });
