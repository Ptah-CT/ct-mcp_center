import {
  DatabaseNamespace,
  DatabaseNamespaceTool,
  DatabaseNamespaceWithServers,
  NamespaceCreateInput,
  NamespaceUpdateInput,
} from "@repo/zod-types";
import { and, desc, eq, inArray, or } from "drizzle-orm";

import { db } from "../index";
import {
  mcpServersTable,
  namespaceServerMappingsTable,
  namespacesTable,
  namespaceToolMappingsTable,
  toolsTable,
} from "../schema";
import { namespaceMappingsRepository } from "./namespace-mappings.repo";

export class NamespacesRepository {
  async create(input: NamespaceCreateInput): Promise<DatabaseNamespace> {
    return await db.transaction(async (tx) => {
      // Create the namespace
      const [createdNamespace] = await tx
        .insert(namespacesTable)
        .values({
          name: input.name,
          description: input.description,
        })
        .returning();

      if (!createdNamespace) {
        throw new Error("Failed to create namespace");
      }

      // If mcp server UUIDs are provided, create the mappings with default ACTIVE status
      if (input.mcpServerUuids && input.mcpServerUuids.length > 0) {
        const mappings = input.mcpServerUuids.map((serverUuid) => ({
          namespace_uuid: createdNamespace.uuid,
          mcp_server_uuid: serverUuid,
          status: "ACTIVE" as const,
        }));

        await tx.insert(namespaceServerMappingsTable).values(mappings);

        // Also create namespace-tool mappings for all tools of the selected servers
        const serverTools = await tx
          .select({
            uuid: toolsTable.uuid,
            mcp_server_uuid: toolsTable.mcp_server_uuid,
          })
          .from(toolsTable)
          .where(inArray(toolsTable.mcp_server_uuid, input.mcpServerUuids));

        if (serverTools.length > 0) {
          const toolMappings = serverTools.map((tool) => ({
            namespace_uuid: createdNamespace.uuid,
            tool_uuid: tool.uuid,
            mcp_server_uuid: tool.mcp_server_uuid,
            status: "ACTIVE" as const,
          }));

          await tx.insert(namespaceToolMappingsTable).values(toolMappings);
        }
      }

      return createdNamespace;
    });
  }

  async findAll(): Promise<DatabaseNamespace[]> {
    return await db
      .select({
        uuid: namespacesTable.uuid,
        name: namespacesTable.name,
        description: namespacesTable.description,
        created_at: namespacesTable.created_at,
        updated_at: namespacesTable.updated_at,
      })
      .from(namespacesTable)
      .orderBy(desc(namespacesTable.created_at));
  }

  async findWithServers(): Promise<DatabaseNamespaceWithServers[]> {
    const namespaces = await this.findAll();
    
    const namespacesWithServers = await Promise.all(
      namespaces.map(async (namespace) => {
        const servers = await namespaceMappingsRepository.findServersByNamespaceUuid(
          namespace.uuid,
        );
        return {
          ...namespace,
          servers,
        };
      }),
    );

    return namespacesWithServers;
  }

  async findByUuid(uuid: string): Promise<DatabaseNamespace | undefined> {
    const [namespace] = await db
      .select({
        uuid: namespacesTable.uuid,
        name: namespacesTable.name,
        description: namespacesTable.description,
        created_at: namespacesTable.created_at,
        updated_at: namespacesTable.updated_at,
      })
      .from(namespacesTable)
      .where(eq(namespacesTable.uuid, uuid))
      .limit(1);

    return namespace;
  }

  async findByName(name: string): Promise<DatabaseNamespace | undefined> {
    const [namespace] = await db
      .select({
        uuid: namespacesTable.uuid,
        name: namespacesTable.name,
        description: namespacesTable.description,
        created_at: namespacesTable.created_at,
        updated_at: namespacesTable.updated_at,
      })
      .from(namespacesTable)
      .where(eq(namespacesTable.name, name))
      .limit(1);

    return namespace;
  }

  async findToolsByNamespaceUuid(
    namespaceUuid: string,
  ): Promise<DatabaseNamespaceTool[]> {
    return await db
      .select({
        uuid: toolsTable.uuid,
        name: toolsTable.name,
        description: toolsTable.description,
        tool_schema: toolsTable.tool_schema,
        created_at: toolsTable.created_at,
        updated_at: toolsTable.updated_at,
        mcp_server_uuid: toolsTable.mcp_server_uuid,
        server: {
          uuid: mcpServersTable.uuid,
          name: mcpServersTable.name,
          description: mcpServersTable.description,
          type: mcpServersTable.type,
          command: mcpServersTable.command,
          cwd: mcpServersTable.cwd,
          args: mcpServersTable.args,
          env: mcpServersTable.env,
          url: mcpServersTable.url,
          error_status: mcpServersTable.error_status,
          created_at: mcpServersTable.created_at,
          bearerToken: mcpServersTable.bearerToken,
        },
      })
      .from(namespaceToolMappingsTable)
      .innerJoin(
        toolsTable,
        eq(namespaceToolMappingsTable.tool_uuid, toolsTable.uuid),
      )
      .innerJoin(
        mcpServersTable,
        eq(namespaceToolMappingsTable.mcp_server_uuid, mcpServersTable.uuid),
      )
      .where(eq(namespaceToolMappingsTable.namespace_uuid, namespaceUuid));
  }

  async update(
    uuid: string,
    input: NamespaceUpdateInput,
  ): Promise<DatabaseNamespace> {
    return await db.transaction(async (tx) => {
      const [updatedNamespace] = await tx
        .update(namespacesTable)
        .set({
          ...(input.name && { name: input.name }),
          ...(input.description !== undefined && {
            description: input.description,
          }),
        })
        .where(eq(namespacesTable.uuid, uuid))
        .returning();

      if (!updatedNamespace) {
        throw new Error("Failed to update namespace");
      }

      // If mcpServerUuids are provided, update the mappings
      if (input.mcpServerUuids !== undefined) {
        // Remove existing mappings
        await tx
          .delete(namespaceServerMappingsTable)
          .where(eq(namespaceServerMappingsTable.namespace_uuid, uuid));

        await tx
          .delete(namespaceToolMappingsTable)
          .where(eq(namespaceToolMappingsTable.namespace_uuid, uuid));

        // Add new mappings if any
        if (input.mcpServerUuids.length > 0) {
          const mappings = input.mcpServerUuids.map((serverUuid) => ({
            namespace_uuid: uuid,
            mcp_server_uuid: serverUuid,
            status: "ACTIVE" as const,
          }));

          await tx.insert(namespaceServerMappingsTable).values(mappings);

          // Also create namespace-tool mappings for all tools of the selected servers
          const serverTools = await tx
            .select({
              uuid: toolsTable.uuid,
              mcp_server_uuid: toolsTable.mcp_server_uuid,
            })
            .from(toolsTable)
            .where(inArray(toolsTable.mcp_server_uuid, input.mcpServerUuids));

          if (serverTools.length > 0) {
            const toolMappings = serverTools.map((tool) => ({
              namespace_uuid: uuid,
              tool_uuid: tool.uuid,
              mcp_server_uuid: tool.mcp_server_uuid,
              status: "ACTIVE" as const,
            }));

            await tx.insert(namespaceToolMappingsTable).values(toolMappings);
          }
        }
      }

      return updatedNamespace;
    });
  }

  async delete(uuid: string): Promise<void> {
    await db.transaction(async (tx) => {
      // Delete related mappings first (due to foreign key constraints)
      await tx
        .delete(namespaceToolMappingsTable)
        .where(eq(namespaceToolMappingsTable.namespace_uuid, uuid));

      await tx
        .delete(namespaceServerMappingsTable)
        .where(eq(namespaceServerMappingsTable.namespace_uuid, uuid));

      // Delete the namespace
      await tx.delete(namespacesTable).where(eq(namespacesTable.uuid, uuid));
    });
  }
}

export const namespacesRepository = new NamespacesRepository();