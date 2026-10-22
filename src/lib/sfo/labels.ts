import type { StatusTone } from "@/components/admin/status-pill";

export const statusLabel: Record<string, [string, StatusTone]> = {
  draft: ["Utkast", "neutral"],
  published: ["Publisert", "ok"],
  cancelled: ["Avlyst", "danger"],
};
