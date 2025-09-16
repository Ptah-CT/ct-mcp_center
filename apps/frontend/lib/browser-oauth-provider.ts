import { DbOAuthClientProvider } from './oauth-provider';

/**
 * Browser-compatible OAuth provider that uses Web Crypto API instead of Node.js crypto
 * Fixes "Cannot read properties of undefined (reading 'digest')" errors
 */
export class BrowserOAuthProvider extends DbOAuthClientProvider {
  /**
   * Generate PKCE code verifier and challenge using Web Crypto API
   */
  async generatePKCE(): Promise<{ codeVerifier: string; codeChallenge: string }> {
    // Generate code verifier (43-128 characters, URL-safe base64)
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    const codeVerifier = btoa(String.fromCharCode.apply(null, Array.from(array)))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');

    // Generate code challenge using SHA256
    const encoder = new TextEncoder();
    const data = encoder.encode(codeVerifier);
    const digest = await crypto.subtle.digest('SHA-256', data);
    
    const codeChallenge = btoa(String.fromCharCode.apply(null, Array.from(new Uint8Array(digest))))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');

    return { codeVerifier, codeChallenge };
  }

  /**
   * Override parent method to use browser-compatible PKCE generation
   */
  async saveCodeVerifier(codeVerifier: string) {
    // Just delegate to parent - the parent already handles browser/database logic correctly
    return super.saveCodeVerifier(codeVerifier);
  }
}

// Export factory function for useConnection.ts
export function createBrowserAuthProvider(mcpServerUuid: string, serverUrl: string): BrowserOAuthProvider {
  return new BrowserOAuthProvider(mcpServerUuid, serverUrl);
}