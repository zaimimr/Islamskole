export const familyQueues = [
  { id: "", label: "Alle" },
  { id: "skylder", label: "Skylder penger" },
  { id: "mangler_plass", label: "Mangler plass" },
  { id: "gjennomga", label: "Må gjennomgås" },
  { id: "ny", label: "Ny innmelding" },
] as const;

export type FamilyQueueId = (typeof familyQueues)[number]["id"];
