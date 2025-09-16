"use client";

import { auth } from "@modelcontextprotocol/sdk/client/auth.js";
import { useEffect, useRef } from "react";

import { useTranslations } from "@/hooks/useTranslations";

import { getServerSpecificKey, SESSION_KEYS } from "../lib/constants";
import { createBrowserAuthProvider } from "../lib/browser-oauth-provider";
import { vanillaTrpcClient } from "../lib/trpc";

const OAuthCallback = () => {
  const { t } = useTranslations();
  const hasProcessedRef = useRef(false);

  useEffect(() => {
    const handleCallback = async () => {
      // Skip if we've already processed this callback
      if (hasProcessedRef.current) {
        return;
      }
      hasProcessedRef.current = true;

      const params = new URLSearchParams(window.location.search);
      const code = params.get("code");
      const serverUrl =
        typeof window !== "undefined"
          ? sessionStorage.getItem(SESSION_KEYS.SERVER_URL)
          : null;
      const mcpServerUuid =
        typeof window !== "undefined"
          ? sessionStorage.getItem(SESSION_KEYS.MCP_SERVER_UUID)
          : null;

      if (!code || !serverUrl || !mcpServerUuid) {
        console.error("Missing required OAuth parameters");
        window.location.href = "/mcp-servers";
        return;
      }

      try {
        // Create browser-compatible auth provider with existing server UUID and URL
        const authProvider = createBrowserAuthProvider(mcpServerUuid, serverUrl);

        // Complete the OAuth flow
        const result = await auth(authProvider, {
          serverUrl,
          authorizationCode: code,
        });

        if (result !== "AUTHORIZED") {
          throw new Error(
            `Expected to be authorized after providing auth code, got: ${result}`,
          );
        }

        // Transfer OAuth data from session storage to database
        const clientInformationKey = getServerSpecificKey(
          SESSION_KEYS.CLIENT_INFORMATION,
          serverUrl,
        );
        const tokensKey = getServerSpecificKey(SESSION_KEYS.TOKENS, serverUrl);
        const codeVerifierKey = getServerSpecificKey(
          SESSION_KEYS.CODE_VERIFIER,
          serverUrl,
        );

        const clientInformation =
          typeof window !== "undefined"
            ? sessionStorage.getItem(clientInformationKey)
            : null;
        const tokens =
          typeof window !== "undefined"
            ? sessionStorage.getItem(tokensKey)
            : null;
        const codeVerifier =
          typeof window !== "undefined"
            ? sessionStorage.getItem(codeVerifierKey)
            : null;

        // Save OAuth session in database using tRPC
        await vanillaTrpcClient.frontend.oauth.upsert.mutate({
          mcp_server_uuid: mcpServerUuid,
          client_information: clientInformation
            ? JSON.parse(clientInformation)
            : undefined,
          tokens: tokens ? JSON.parse(tokens) : undefined,
          code_verifier: codeVerifier || undefined,
        });

        // Clean up session storage
        if (typeof window !== "undefined" && window.sessionStorage) {
          sessionStorage.removeItem(clientInformationKey);
          sessionStorage.removeItem(tokensKey);
          sessionStorage.removeItem(codeVerifierKey);
          sessionStorage.removeItem(SESSION_KEYS.SERVER_URL);
          sessionStorage.removeItem(SESSION_KEYS.MCP_SERVER_UUID);
        }

        // Redirect back to the MCP server detail page
        window.location.href = `/mcp-servers/${mcpServerUuid}`;
      } catch (error) {
        console.error("OAuth callback error:", error);
        window.location.href = "/mcp-servers";
      }
    };

    void handleCallback();
  }, []);

  return (
    <div className="flex items-center justify-center h-screen">
      <p className="text-lg text-gray-500">
        {t("common:oauth.processingCallback")}
      </p>
    </div>
  );
};

export default OAuthCallback;
