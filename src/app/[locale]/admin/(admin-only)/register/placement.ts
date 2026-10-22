export type PlacementClass = {
  id: string;
  name: string;
  ageMin: number | null;
  ageMax: number | null;
  capacity: number | null;
  enrolled: number;
};

export type PlacementCandidate = {
  id: string;
  age: number | null;
  desiredClass: string | null;
};

function normalize(value: string) {
  return value.trim().toLocaleLowerCase("nb-NO");
}

function hasRoom(item: PlacementClass, used: Map<string, number>) {
  if (item.capacity == null) return true;
  return item.enrolled + (used.get(item.id) ?? 0) < item.capacity;
}

function fitsAge(item: PlacementClass, age: number | null) {
  if (age == null) return false;
  if (item.ageMin == null && item.ageMax == null) return false;
  return (
    (item.ageMin == null || age >= item.ageMin) &&
    (item.ageMax == null || age <= item.ageMax)
  );
}

export function suggestPlacements(
  candidates: PlacementCandidate[],
  classes: PlacementClass[],
): Map<string, string> {
  const used = new Map<string, number>();
  const result = new Map<string, string>();
  for (const candidate of candidates) {
    const desired = candidate.desiredClass
      ? classes.find(
          (item) =>
            normalize(item.name) === normalize(candidate.desiredClass ?? "") &&
            hasRoom(item, used),
        )
      : undefined;
    const match =
      desired ??
      classes.find(
        (item) => fitsAge(item, candidate.age) && hasRoom(item, used),
      );
    if (match) {
      result.set(candidate.id, match.id);
      used.set(match.id, (used.get(match.id) ?? 0) + 1);
    }
  }
  return result;
}

export function classOptionLabel(item: PlacementClass) {
  const age =
    item.ageMin != null && item.ageMax != null
      ? `${item.ageMin}-${item.ageMax} år`
      : item.ageMin != null
        ? `fra ${item.ageMin} år`
        : item.ageMax != null
          ? `til ${item.ageMax} år`
          : null;
  const seats =
    item.capacity != null ? `${item.enrolled}/${item.capacity}` : `${item.enrolled}`;
  const full = item.capacity != null && item.enrolled >= item.capacity;
  return [item.name, age, full ? `${seats}, full` : seats]
    .filter(Boolean)
    .join(" · ");
}
