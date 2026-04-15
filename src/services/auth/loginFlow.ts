/*
 * Copyright (c) 2024 Provar Limited.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.md file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

/* eslint-disable camelcase */
import crypto from 'node:crypto';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import { spawn, type ChildProcess } from 'node:child_process';
import { URL } from 'node:url';

// All three ports must be pre-registered in the Cognito App Client.
// Cognito requires redirect_uri to exactly match a registered callback URL — no wildcards.
export const CALLBACK_PORTS = [1717, 7890, 8080];

// ── PKCE ─────────────────────────────────────────────────────────────────────

/**
 * Generate a PKCE code_verifier / code_challenge pair (S256 method, as required by Cognito).
 */
export function generatePkce(): { verifier: string; challenge: string } {
  const verifier = crypto.randomBytes(32).toString('base64url');
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

/**
 * Generate a random nonce for OIDC replay-attack prevention.
 * Required by the OpenID Connect spec when requesting an id_token.
 */
export function generateNonce(): string {
  return crypto.randomBytes(16).toString('base64url');
}

/**
 * Generate a random state value for CSRF protection.
 * Required by Cognito Managed Login even though it is optional per the OAuth 2.0 spec.
 */
export function generateState(): string {
  return crypto.randomBytes(16).toString('base64url');
}

// ── Port selection ────────────────────────────────────────────────────────────

/**
 * Try each registered callback port in order; return the first that is free.
 */
export async function findAvailablePort(): Promise<number> {
  for (const port of CALLBACK_PORTS) {
    // Sequential by design — we need the first free registered port, not all of them.
    // eslint-disable-next-line no-await-in-loop
    if (await isPortFree(port)) return port;
  }
  throw new Error(
    'Could not bind to any registered callback port (1717, 7890, 8080). ' +
      'Check that no other process is using these ports and try again.'
  );
}

function isPortFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const probe = http.createServer();
    probe.once('error', () => resolve(false));
    probe.listen(port, '127.0.0.1', () => {
      probe.close(() => resolve(true));
    });
  });
}

// ── Browser open ──────────────────────────────────────────────────────────────

/**
 * Return the platform-specific command and argument list for opening a URL
 * in the system browser. The URL is passed as an argument — never interpolated
 * into a shell string — to avoid command injection. Exported so tests can
 * assert the correct command is chosen without actually spawning a process.
 */
export function getBrowserCommand(
  url: string,
  platform: NodeJS.Platform = process.platform
): { cmd: string; args: string[] } {
  switch (platform) {
    case 'darwin':
      return { cmd: 'open', args: [url] };
    case 'win32':
      // Pass the URL via $args[0] so it is never interpolated into the -Command
      // string — avoids quote-breaking and injection risk from special characters.
      return { cmd: 'powershell.exe', args: ['-NoProfile', '-Command', 'Start-Process $args[0]', '-args', url] };
    default:
      return { cmd: 'xdg-open', args: [url] };
  }
}

export function openBrowser(url: string): void {
  // detached:true + stdio:'ignore' + unref() is the standard Node.js pattern for
  // fire-and-forget child processes — the event loop will not wait for them to exit.
  const { cmd, args } = getBrowserCommand(url);
  const child: ChildProcess = spawn(cmd, args, { detached: true, stdio: 'ignore' });
  // Suppress unhandled-error crashes if the browser executable is not found.
  // The login URL is already printed to the terminal so the user can open it manually.
  child.on('error', () => {
    /* intentional no-op */
  });
  child.unref();
}

// ── Localhost callback server ─────────────────────────────────────────────────

/**
 * Spin up a temporary localhost HTTP server that accepts exactly one callback
 * from Cognito's Hosted UI, extracts the auth code, and shuts down.
 */
export function listenForCallback(port: number, expectedState?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    // Track open sockets so we can forcibly destroy them on shutdown.
    // This is a Node 18.0/18.1 fallback for server.closeAllConnections(), which
    // was added in Node 18.2. Without it a browser that ignores Connection:close
    // could keep the event loop alive after server.close() returns.
    const openSockets = new Set<net.Socket>();
    const closeServer = (srv: http.Server): void => {
      srv.close();
      if (typeof srv.closeAllConnections === 'function') {
        srv.closeAllConnections();
      } else {
        openSockets.forEach((s) => s.destroy());
      }
    };

    const server = http.createServer((req, res) => {
      const parsed = new URL(req.url ?? '/', `http://localhost:${port}`);
      const code = parsed.searchParams.get('code');
      const error = parsed.searchParams.get('error');
      const description = parsed.searchParams.get('error_description');
      const callbackState = parsed.searchParams.get('state');

      if (expectedState && callbackState !== expectedState) {
        res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8', Connection: 'close' });
        res.end(
          '<html><body style="font-family:sans-serif;padding:2rem;max-width:480px">' +
            '<h2 style="color:#c23934">Authentication failed</h2>' +
            '<p>Invalid state parameter — possible CSRF attack. Please try again.</p>' +
            '</body></html>'
        );
        closeServer(server);
        reject(new Error('OAuth callback state mismatch — possible CSRF. Try again.'));
        return;
      }

      // 'Connection: close' tells the browser to close the TCP connection after
      // this response so server.close() has no lingering keep-alive sockets to
      // wait for, allowing the Node.js event loop to exit promptly.
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', Connection: 'close' });
      res.end(
        '<html><body style="font-family:sans-serif;padding:2rem;max-width:480px">' +
          '<h2 style="color:#0070d2">Authentication complete</h2>' +
          '<p>You can close this tab and return to the terminal.</p>' +
          '</body></html>'
      );
      closeServer(server);

      if (code) {
        resolve(code);
      } else {
        reject(new Error(description ?? error ?? 'No authorisation code received from Cognito'));
      }
    });
    server.on('connection', (socket: net.Socket) => {
      openSockets.add(socket);
      socket.once('close', () => openSockets.delete(socket));
    });
    server.listen(port, '127.0.0.1');
    server.on('error', (err: Error) => reject(err));
  });
}

// ── Cognito token exchange ────────────────────────────────────────────────────

export interface CognitoTokens {
  access_token: string;
  id_token: string;
  token_type: string;
  expires_in: number;
}

/**
 * Exchange a PKCE auth code for Cognito tokens via the standard token endpoint.
 * Uses the Authorization Code + PKCE grant — no client secret required.
 */
export async function exchangeCodeForTokens(opts: {
  code: string;
  redirectUri: string;
  clientId: string;
  verifier: string;
  tokenEndpoint: string;
}): Promise<CognitoTokens> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code: opts.code,
    redirect_uri: opts.redirectUri,
    client_id: opts.clientId,
    code_verifier: opts.verifier,
  }).toString();

  const { status, responseBody } = await httpsPost(opts.tokenEndpoint, body, {
    'Content-Type': 'application/x-www-form-urlencoded',
  });

  if (status !== 200) {
    throw new Error(`Cognito token exchange failed (${status}): ${responseBody}`);
  }

  return JSON.parse(responseBody) as CognitoTokens;
}

// ── Internal HTTPS helper ─────────────────────────────────────────────────────

const REQUEST_TIMEOUT_MS = 30_000;

function httpsPost(
  url: string,
  body: string,
  headers: Record<string, string>
): Promise<{ status: number; responseBody: string }> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const req = https.request(
      {
        hostname: parsed.hostname,
        port: parsed.port || undefined,
        path: parsed.pathname + parsed.search,
        method: 'POST',
        headers: {
          ...headers,
          'Content-Length': Buffer.byteLength(body).toString(),
        },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk: Buffer) => {
          data += chunk.toString('utf-8');
        });
        res.on('end', () => resolve({ status: res.statusCode ?? 0, responseBody: data }));
      }
    );
    req.setTimeout(REQUEST_TIMEOUT_MS, () => {
      req.destroy(new Error(`Cognito token exchange timed out after ${REQUEST_TIMEOUT_MS / 1000}s`));
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ── Indirection object (sinon-stubbable) ──────────────────────────────────────

/**
 * The login command calls loginFlowClient.X() so tests can replace properties with stubs.
 */
export const loginFlowClient = {
  generatePkce,
  generateNonce,
  generateState,
  findAvailablePort,
  openBrowser,
  listenForCallback: listenForCallback as (port: number, expectedState?: string) => Promise<string>,
  exchangeCodeForTokens,
};
