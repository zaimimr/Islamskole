import type { FamilyDetails } from "@/lib/families/repository";

export type DuplicateFamilyMatch = {
  familyId: string;
  displayName: string;
  reasons: string[];
};

export type DuplicateStudentGroup = {
  key: string;
  name: string;
  birthDate: string | null;
  entries: { studentId: string; familyId: string; familyName: string }[];
};

function email(value: string | null) {
  return value?.trim().toLocaleLowerCase("nb-NO") || null;
}

function phone(value: string | null) {
  const digits = value?.replace(/\D/g, "") ?? "";
  return digits.length >= 8 ? digits.slice(-8) : null;
}

function childKey(
  firstName: string | null,
  lastName: string | null,
  birthDate: string | null,
) {
  const name = [firstName, lastName]
    .filter(Boolean)
    .join(" ")
    .trim()
    .toLocaleLowerCase("nb-NO")
    .replace(/\s+/g, " ");
  if (!name || !birthDate) return null;
  return `${name}|${birthDate}`;
}

export function findDuplicateFamilies(
  families: FamilyDetails[],
): Map<string, DuplicateFamilyMatch[]> {
  const index = new Map<string, Set<string>>();
  const add = (key: string | null, familyId: string) => {
    if (!key) return;
    const set = index.get(key) ?? new Set<string>();
    set.add(familyId);
    index.set(key, set);
  };

  for (const family of families) {
    for (const guardian of family.guardians) {
      add(email(guardian.email) && `e:${email(guardian.email)}`, family.id);
      add(phone(guardian.phone) && `p:${phone(guardian.phone)}`, family.id);
    }
    for (const student of family.students) {
      const key = childKey(student.firstName, student.lastName, student.birthDate);
      add(key && `c:${key}`, family.id);
    }
    for (const application of family.applications) {
      if (["avslatt", "arkivert"].includes(application.status)) continue;
      const key = childKey(
        application.firstName,
        application.lastName,
        application.birthDate,
      );
      add(key && `c:${key}`, family.id);
    }
  }

  const reasonLabel = (key: string) =>
    key.startsWith("e:")
      ? "Samme e-post"
      : key.startsWith("p:")
        ? "Samme telefon"
        : "Samme barn og fødselsdato";

  const names = new Map(families.map((family) => [family.id, family.displayName]));
  const matches = new Map<string, Map<string, Set<string>>>();
  for (const [key, familyIds] of index) {
    if (familyIds.size < 2) continue;
    for (const familyId of familyIds) {
      for (const otherId of familyIds) {
        if (otherId === familyId) continue;
        const byOther = matches.get(familyId) ?? new Map<string, Set<string>>();
        const reasons = byOther.get(otherId) ?? new Set<string>();
        reasons.add(reasonLabel(key));
        byOther.set(otherId, reasons);
        matches.set(familyId, byOther);
      }
    }
  }

  const result = new Map<string, DuplicateFamilyMatch[]>();
  for (const [familyId, byOther] of matches) {
    result.set(
      familyId,
      [...byOther.entries()].map(([otherId, reasons]) => ({
        familyId: otherId,
        displayName: names.get(otherId) ?? "Familie",
        reasons: [...reasons],
      })),
    );
  }
  return result;
}

export function findDuplicateStudents(
  families: FamilyDetails[],
): DuplicateStudentGroup[] {
  const groups = new Map<string, DuplicateStudentGroup>();
  for (const family of families) {
    for (const student of family.students) {
      const key = childKey(student.firstName, student.lastName, student.birthDate);
      if (!key) continue;
      const group = groups.get(key) ?? {
        key,
        name: [student.firstName, student.lastName].filter(Boolean).join(" "),
        birthDate: student.birthDate,
        entries: [],
      };
      group.entries.push({
        studentId: student.id,
        familyId: family.id,
        familyName: family.displayName,
      });
      groups.set(key, group);
    }
  }
  return [...groups.values()].filter((group) => group.entries.length > 1);
}
