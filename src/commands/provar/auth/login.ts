/*
 * Copyright (c) 2024 Provar Limited.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.md file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

/* eslint-disable camelcase */
import { Flags, SfCommand } from '@salesforce/sf-plugins-core';
import { Messages } from '@provartesting/provardx-plugins-utils';
import { writeCredentials } from '../../../services/auth/credentials.js';
import { loginFlowClient } from '../../../services/auth/loginFlow.js';
import {
  qualityHubClient,
  getQualityHubBaseUrl,
  QualityHubAuthError,
  REQUEST_ACCESS_URL,
} from '../../../services/qualityHub/client.js';

Messages.importMessagesDirectoryFromMetaUrl(import.meta.url);
const messages = Messages.loadMessages('@provartesting/provardx-cli', 'sf.provar.auth.login');

// Production values bundled at auth handoff (2026-04-11).
// Override via PROVAR_COGNITO_DOMAIN / PROVAR_COGNITO_CLIENT_ID for non-prod environments.
const DEFAULT_COGNITO_DOMAIN = 'us-east-1xpfwzwmop.auth.us-east-1.amazoncognito.com';
const DEFAULT_CLIENT_ID = '29cs1a784r4cervmth8ugbkkri';

export default class SfProvarAuthLogin extends SfCommand<void> {
  public static readonly summary = messages.getMessage('summary');
  public static readonly description = messages.getMessage('description');
  public static readonly examples = messages.getMessages('examples');

  public static readonly flags = {
    url: Flags.string({
      summary: messages.getMessage('flags.url.summary'),
      required: false,
    }),
  };

  public async run(): Promise<void> {
    const { flags } = await this.parse(SfProvarAuthLogin);

    const cognitoDomain = process.env.PROVAR_COGNITO_DOMAIN ?? DEFAULT_COGNITO_DOMAIN;
    const clientId = process.env.PROVAR_COGNITO_CLIENT_ID ?? DEFAULT_CLIENT_ID;
    const baseUrl = flags.url ?? getQualityHubBaseUrl();

    // ── Step 1: Generate PKCE pair, nonce, and state ───────────────────────
    const { verifier, challenge } = loginFlowClient.generatePkce();
    const nonce = loginFlowClient.generateNonce();
    const state = loginFlowClient.generateState();

    // ── Step 2: Find an available registered callback port ──────────────────
    const port = await loginFlowClient.findAvailablePort();
    const redirectUri = `http://localhost:${port}/callback`;

    // ── Step 3: Build the Cognito authorize URL ────────────────────────────
    const authorizeUrl = new URL(`https://${cognitoDomain}/oauth2/authorize`);
    authorizeUrl.searchParams.set('response_type', 'code');
    authorizeUrl.searchParams.set('client_id', clientId);
    authorizeUrl.searchParams.set('redirect_uri', redirectUri);
    authorizeUrl.searchParams.set('code_challenge', challenge);
    authorizeUrl.searchParams.set('code_challenge_method', 'S256');
    authorizeUrl.searchParams.set('scope', 'openid email aws.cognito.signin.user.admin');
    authorizeUrl.searchParams.set('state', state);
    authorizeUrl.searchParams.set('nonce', nonce);

    // ── Step 4: Open browser and wait for callback ──────────────────────────
    this.log('Opening browser for login...');
    this.log(`  If the browser did not open, visit:\n  ${authorizeUrl.toString()}`);
    loginFlowClient.openBrowser(authorizeUrl.toString());

    this.log('\nWaiting for authentication... (Ctrl-C to cancel)');
    const authCode = await loginFlowClient.listenForCallback(port, state);

    // ── Step 5: Exchange code for Cognito tokens ────────────────────────────
    const tokens = await loginFlowClient.exchangeCodeForTokens({
      code: authCode,
      redirectUri,
      clientId,
      verifier,
      tokenEndpoint: `https://${cognitoDomain}/oauth2/token`,
    });

    // ── Step 6: Exchange Cognito access token for pv_k_ key ─────────────────
    // Cognito tokens are held in memory only — discarded after this call.
    let keyData;
    try {
      keyData = await qualityHubClient.exchangeTokenForKey(tokens.access_token, baseUrl);
    } catch (err) {
      if (err instanceof QualityHubAuthError) {
        this.error(`No Provar MCP account found for this login.\nRequest access at: ${REQUEST_ACCESS_URL}`, {
          exit: 1,
        });
      }
      throw err;
    }

    // ── Step 7: Persist the pv_k_ key ──────────────────────────────────────
    writeCredentials(keyData.api_key, keyData.prefix, 'cognito', {
      username: keyData.username,
      tier: keyData.tier,
      expires_at: keyData.expires_at,
    });

    this.log(`\nAuthenticated as ${keyData.username} (${keyData.tier} tier)`);
    this.log(`API key stored (prefix: ${keyData.prefix}). Valid until ${keyData.expires_at}.`);
    this.log("  Run 'sf provar auth status' to check at any time.");
  }
}
