import "server-only";
import { after } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUser } from "@/lib/auth";
import { getSessionContext } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/types";

export async function writeAudit(entry: {
  action: string;
  entityType: string;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const user = await getUser();
  const { impersonation } = await getSessionContext();
  const attribution = impersonation ? {
    impersonation_id: impersonation.id,
    impersonated_user_id: impersonation.target_id,
    impersonated_email: impersonation.target_email,
  } : {};
  after(async () => {
    const { error } = await createAdminClient()
      .from("audit_log")
      .insert({
        actor_id: impersonation?.developer_id ?? user?.id ?? null,
        actor_email: impersonation?.developer_email ?? user?.email ?? null,
        action: entry.action,
        entity_type: entry.entityType,
        entity_id: entry.entityId ?? null,
        metadata: (impersonation ? { ...entry.metadata, ...attribution } : entry.metadata ?? null) as Json,
      });
    if (error) console.error("writeAudit failed", error);
  });
}
