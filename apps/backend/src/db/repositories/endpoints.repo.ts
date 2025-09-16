import {
  DatabaseEndpoint,
  DatabaseEndpointWithNamespace,
  EndpointCreateInput,
  EndpointUpdateInput,
} from "@repo/zod-types";
import { desc, eq } from "drizzle-orm";

import { db } from "../index";
import { endpointsTable, namespacesTable } from "../schema";

export class EndpointsRepository {
  async create(input: EndpointCreateInput): Promise<DatabaseEndpoint> {
    const [createdEndpoint] = await db
      .insert(endpointsTable)
      .values({
        name: input.name,
        description: input.description,
        namespace_uuid: input.namespace_uuid,
        enable_api_key_auth: input.enable_api_key_auth ?? true,
        use_query_param_auth: input.use_query_param_auth ?? false,
      })
      .returning();

    if (!createdEndpoint) {
      throw new Error("Failed to create endpoint");
    }

    return createdEndpoint;
  }

  async findAll(): Promise<DatabaseEndpoint[]> {
    return await db
      .select({
        uuid: endpointsTable.uuid,
        name: endpointsTable.name,
        description: endpointsTable.description,
        namespace_uuid: endpointsTable.namespace_uuid,
        enable_api_key_auth: endpointsTable.enable_api_key_auth,
        use_query_param_auth: endpointsTable.use_query_param_auth,
        created_at: endpointsTable.created_at,
        updated_at: endpointsTable.updated_at,
      })
      .from(endpointsTable)
      .orderBy(desc(endpointsTable.created_at));
  }

  async findWithNamespaces(): Promise<DatabaseEndpointWithNamespace[]> {
    return await db
      .select({
        uuid: endpointsTable.uuid,
        name: endpointsTable.name,
        description: endpointsTable.description,
        namespace_uuid: endpointsTable.namespace_uuid,
        enable_api_key_auth: endpointsTable.enable_api_key_auth,
        use_query_param_auth: endpointsTable.use_query_param_auth,
        created_at: endpointsTable.created_at,
        updated_at: endpointsTable.updated_at,
        namespace: {
          uuid: namespacesTable.uuid,
          name: namespacesTable.name,
          description: namespacesTable.description,
          created_at: namespacesTable.created_at,
          updated_at: namespacesTable.updated_at,
        },
      })
      .from(endpointsTable)
      .leftJoin(
        namespacesTable,
        eq(endpointsTable.namespace_uuid, namespacesTable.uuid),
      )
      .orderBy(desc(endpointsTable.created_at));
  }

  async findByNamespaceUuid(
    namespaceUuid: string,
  ): Promise<DatabaseEndpoint[]> {
    return await db
      .select({
        uuid: endpointsTable.uuid,
        name: endpointsTable.name,
        description: endpointsTable.description,
        namespace_uuid: endpointsTable.namespace_uuid,
        enable_api_key_auth: endpointsTable.enable_api_key_auth,
        use_query_param_auth: endpointsTable.use_query_param_auth,
        created_at: endpointsTable.created_at,
        updated_at: endpointsTable.updated_at,
      })
      .from(endpointsTable)
      .where(eq(endpointsTable.namespace_uuid, namespaceUuid))
      .orderBy(desc(endpointsTable.created_at));
  }

  async findByNamespaceUuidWithNamespace(
    namespaceUuid: string,
  ): Promise<DatabaseEndpointWithNamespace[]> {
    return await db
      .select({
        uuid: endpointsTable.uuid,
        name: endpointsTable.name,
        description: endpointsTable.description,
        namespace_uuid: endpointsTable.namespace_uuid,
        enable_api_key_auth: endpointsTable.enable_api_key_auth,
        use_query_param_auth: endpointsTable.use_query_param_auth,
        created_at: endpointsTable.created_at,
        updated_at: endpointsTable.updated_at,
        namespace: {
          uuid: namespacesTable.uuid,
          name: namespacesTable.name,
          description: namespacesTable.description,
          created_at: namespacesTable.created_at,
          updated_at: namespacesTable.updated_at,
        },
      })
      .from(endpointsTable)
      .leftJoin(
        namespacesTable,
        eq(endpointsTable.namespace_uuid, namespacesTable.uuid),
      )
      .where(eq(endpointsTable.namespace_uuid, namespaceUuid))
      .orderBy(desc(endpointsTable.created_at));
  }

  async findByUuid(uuid: string): Promise<DatabaseEndpoint | undefined> {
    const [endpoint] = await db
      .select({
        uuid: endpointsTable.uuid,
        name: endpointsTable.name,
        description: endpointsTable.description,
        namespace_uuid: endpointsTable.namespace_uuid,
        enable_api_key_auth: endpointsTable.enable_api_key_auth,
        use_query_param_auth: endpointsTable.use_query_param_auth,
        created_at: endpointsTable.created_at,
        updated_at: endpointsTable.updated_at,
      })
      .from(endpointsTable)
      .where(eq(endpointsTable.uuid, uuid))
      .limit(1);

    return endpoint;
  }

  async findByName(name: string): Promise<DatabaseEndpoint | undefined> {
    const [endpoint] = await db
      .select({
        uuid: endpointsTable.uuid,
        name: endpointsTable.name,
        description: endpointsTable.description,
        namespace_uuid: endpointsTable.namespace_uuid,
        enable_api_key_auth: endpointsTable.enable_api_key_auth,
        use_query_param_auth: endpointsTable.use_query_param_auth,
        created_at: endpointsTable.created_at,
        updated_at: endpointsTable.updated_at,
      })
      .from(endpointsTable)
      .where(eq(endpointsTable.name, name))
      .limit(1);

    return endpoint;
  }

  async update(
    uuid: string,
    input: EndpointUpdateInput,
  ): Promise<DatabaseEndpoint> {
    const [updatedEndpoint] = await db
      .update(endpointsTable)
      .set({
        ...(input.name && { name: input.name }),
        ...(input.description !== undefined && {
          description: input.description,
        }),
        ...(input.namespace_uuid && { namespace_uuid: input.namespace_uuid }),
        ...(input.enable_api_key_auth !== undefined && {
          enable_api_key_auth: input.enable_api_key_auth,
        }),
        ...(input.use_query_param_auth !== undefined && {
          use_query_param_auth: input.use_query_param_auth,
        }),
      })
      .where(eq(endpointsTable.uuid, uuid))
      .returning();

    if (!updatedEndpoint) {
      throw new Error("Failed to update endpoint");
    }

    return updatedEndpoint;
  }

  async delete(uuid: string): Promise<void> {
    await db.delete(endpointsTable).where(eq(endpointsTable.uuid, uuid));
  }
}

export const endpointsRepository = new EndpointsRepository();