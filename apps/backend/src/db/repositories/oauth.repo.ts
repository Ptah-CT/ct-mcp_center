import { eq } from "drizzle-orm";
import { db } from "../index";
import {
  oauthSessionsTable,
  oauthClientsTable,
} from "../schema";

export interface OAuthClient {
  client_id: string;
  client_secret: string | null;
  client_name: string;
  redirect_uris: string[];
  grant_types: string[];
  response_types: string[];
  token_endpoint_auth_method: string;
  scope: string | null;
  client_uri: string | null;
  logo_uri: string | null;
  contacts: string[] | null;
  tos_uri: string | null;
  policy_uri: string | null;
  software_id: string | null;
  software_version: string | null;
}

export interface OAuthSession {
  uuid: string;
  mcp_server_uuid: string;
  client_information: { [key: string]: string };
  tokens: Record<string, any> | null;
  code_verifier: string | null;
  created_at: Date;
  updated_at: Date;
}

class OAuthRepository {
  // Client management
  async getClient(clientId: string): Promise<OAuthClient | null> {
    const result = await db
      .select()
      .from(oauthClientsTable)
      .where(eq(oauthClientsTable.client_id, clientId))
      .limit(1);
    return result[0] || null;
  }

  async createClient(data: Omit<OAuthClient, 'created_at' | 'updated_at'>): Promise<OAuthClient> {
    const [client] = await db
      .insert(oauthClientsTable)
      .values(data)
      .returning();
    return client;
  }

  // Session management for MCP servers
  async getSession(mcpServerUuid: string): Promise<OAuthSession | null> {
    const result = await db
      .select()
      .from(oauthSessionsTable)
      .where(eq(oauthSessionsTable.mcp_server_uuid, mcpServerUuid))
      .limit(1);
    return result[0] || null;
  }

  async createSession(data: {
    mcp_server_uuid: string;
    client_information: { [key: string]: string };
    tokens?: Record<string, any>;
    code_verifier?: string;
  }): Promise<OAuthSession> {
    const [session] = await db
      .insert(oauthSessionsTable)
      .values(data)
      .returning();
    return session;
  }

  async updateSession(
    mcpServerUuid: string,
    data: {
      tokens?: Record<string, any>;
      code_verifier?: string;
      client_information?: { [key: string]: string };
    }
  ): Promise<OAuthSession | null> {
    const [session] = await db
      .update(oauthSessionsTable)
      .set(data)
      .where(eq(oauthSessionsTable.mcp_server_uuid, mcpServerUuid))
      .returning();
    return session || null;
  }

  async deleteSession(mcpServerUuid: string): Promise<void> {
    await db
      .delete(oauthSessionsTable)
      .where(eq(oauthSessionsTable.mcp_server_uuid, mcpServerUuid));
  }

  // Legacy OAuth methods - deprecated but kept for compatibility
  async getAccessToken(token: string): Promise<null> {
    // OAuth access tokens removed - MCP servers use sessions instead
    return null;
  }

  async setAccessToken(): Promise<void> {
    // OAuth access tokens removed - MCP servers use sessions instead
    return;
  }

  async getAuthorizationCode(code: string): Promise<null> {
    // OAuth authorization codes removed - MCP servers use sessions instead
    return null;
  }

  async setAuthorizationCode(): Promise<void> {
    // OAuth authorization codes removed - MCP servers use sessions instead
    return;
  }

  async revokeAccessToken(token: string): Promise<void> {
    // OAuth access tokens removed - MCP servers use sessions instead
    return;
  }

  async cleanupExpiredTokens(): Promise<void> {
    // OAuth tokens removed - MCP servers use sessions instead
    return;
  }
}

export const oauthRepository = new OAuthRepository();