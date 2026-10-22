"use client";

import {
  createContext,
  useContext,
  useOptimistic,
  useTransition,
} from "react";
import { toast } from "sonner";
import { GraduationCap, UserMinus } from "lucide-react";
import {
  registerTeacher,
  removeTeacher,
} from "@/app/[locale]/admin/(admin-only)/familier/families-actions";
import { cn } from "@/lib/utils";

const TeacherRoleContext = createContext<
  [boolean, (next: boolean) => void] | null
>(null);

export function TeacherRole({
  isTeacher,
  children,
}: {
  isTeacher: boolean;
  children: React.ReactNode;
}) {
  const state = useOptimistic(isTeacher);
  return (
    <TeacherRoleContext.Provider value={state}>
      {children}
    </TeacherRoleContext.Provider>
  );
}

export function TeacherBadge({ children }: { children: React.ReactNode }) {
  const role = useContext(TeacherRoleContext);
  return role?.[0] ? children : null;
}

export function TeacherToggleButton({
  guardianId,
  name,
  isTeacher,
  className,
}: {
  guardianId: string;
  name: string;
  isTeacher: boolean;
  className?: string;
}) {
  const [pending, startTransition] = useTransition();
  const ownRole = useOptimistic(isTeacher);
  const [shownAsTeacher, setShownAsTeacher] =
    useContext(TeacherRoleContext) ?? ownRole;

  function toggle() {
    startTransition(async () => {
      setShownAsTeacher(!isTeacher);
      let result;
      if (isTeacher) {
        result = await removeTeacher(guardianId);
      } else {
        const formData = new FormData();
        formData.set("guardian_id", guardianId);
        result = await registerTeacher(formData);
      }
      if (result.ok) {
        toast.success(
          isTeacher ? `${name} er ikke lenger lærer` : `${name} er nå registrert som lærer`,
          isTeacher
            ? undefined
            : { description: "Knytt læreren til en klasse under Klasser." },
        );
      } else {
        toast.error(result.error);
      }
    });
  }

  const Icon = shownAsTeacher ? UserMinus : GraduationCap;

  return (
    <button
      type="button"
      disabled={pending}
      aria-busy={pending}
      onClick={toggle}
      className={cn(
        "inline-flex min-h-11 items-center gap-2 rounded-lg text-xs font-semibold underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-60 xl:min-h-8",
        shownAsTeacher ? "text-admin-muted" : "text-[#277A31]",
        className,
      )}
    >
      <Icon
        aria-hidden="true"
        className="size-3.5 shrink-0"
      />
      {shownAsTeacher ? "Fjern som lærer" : "Gjør til lærer"}
    </button>
  );
}
