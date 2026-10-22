import type { FamilyDetails } from "@/lib/families/repository";
import type { FamilyOption } from "./family-controls";

export function familyOptions(
  families: FamilyDetails[],
  excludeId: string | null,
): FamilyOption[] {
  return families
    .filter((family) => family.id !== excludeId)
    .map((family) => ({
      id: family.id,
      name: family.displayName,
      description:
        family.guardians
          .map((guardian) =>
            [guardian.firstName, guardian.lastName].filter(Boolean).join(" "),
          )
          .filter(Boolean)
          .join(", ") || undefined,
    }))
    .sort((left, right) => left.name.localeCompare(right.name, "nb-NO"));
}
