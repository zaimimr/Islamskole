"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  GraduationCap,
  MoreHorizontal,
  ShieldMinus,
  ShieldPlus,
  Tent,
  Trash2,
  UserRoundCog,
} from "lucide-react";
import { deleteUser, setUserRole } from "@/app/[locale]/admin/actions";
import { useRemoveRow } from "@/components/admin/optimistic-removal-list";
import { startImpersonation } from "@/lib/impersonation/actions";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export function UserRowActions({
  userId,
  email,
  isSelf,
  roles,
  canImpersonate,
  isDeveloper,
}: {
  userId: string;
  email: string;
  isSelf: boolean;
  roles: string[];
  canImpersonate: boolean;
  isDeveloper: boolean;
}) {
  const removeRow = useRemoveRow();
  const router = useRouter();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const isAdmin = roles.includes("admin");
  const isTeacher = roles.includes("teacher");
  const isSfo = roles.includes("sfo");

  function run(role: string, enabled: boolean, success: string) {
    const formData = new FormData();
    formData.set("user_id", userId);
    formData.set("role", role);
    formData.set("enabled", String(enabled));
    startTransition(async () => {
      const result = await setUserRole(null, formData);
      if (result.ok) toast.success(success);
      else toast.error(result.error);
      router.refresh();
    });
  }

  function handleDelete() {
    setDeleteOpen(false);
    removeRow(userId, () => deleteUser(userId), "Brukeren er slettet");
  }

  function impersonate() {
    startTransition(async () => {
      try {
        const result = await startImpersonation(userId);
        if (result.ok) window.location.assign(result.href);
        else toast.error(result.error);
      } catch {
        toast.error("Kunne ikke bytte bruker. Prøv igjen.");
      }
    });
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon"
              disabled={pending}
              aria-label={`Flere valg for ${email}`}
              title={`Flere valg for ${email}`}
              className="shrink-0 text-admin-muted hover:text-foreground"
            />
          }
        >
          <MoreHorizontal aria-hidden="true" className="size-5" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-auto min-w-56">
          {canImpersonate && !isSelf ? (
            <DropdownMenuItem onClick={impersonate}>
              <UserRoundCog aria-hidden="true" />
              Bruk som denne brukeren
            </DropdownMenuItem>
          ) : null}
          {isTeacher ? null : (
            <DropdownMenuItem
              onClick={() =>
                run("teacher", true, `${email} er registrert som lærer`)
              }
            >
              <GraduationCap aria-hidden="true" />
              Gjør til lærer
            </DropdownMenuItem>
          )}
          {isSfo ? (
            <DropdownMenuItem
              onClick={() =>
                run("sfo", false, `${email} har ikke lenger SFO-tilgang`)
              }
            >
              <Tent aria-hidden="true" />
              Fjern SFO-tilgang
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem
              onClick={() => run("sfo", true, `${email} har fått SFO-tilgang`)}
            >
              <Tent aria-hidden="true" />
              Gi SFO-tilgang
            </DropdownMenuItem>
          )}
          {isDeveloper ? null : isAdmin ? (
            isSelf ? null : (
              <DropdownMenuItem
                onClick={() =>
                  run(
                    "admin",
                    false,
                    `${email} har ikke lenger administratortilgang`,
                  )
                }
              >
                <ShieldMinus aria-hidden="true" />
                Fjern administratortilgang
              </DropdownMenuItem>
            )
          ) : (
            <DropdownMenuItem
              onClick={() =>
                run("admin", true, `${email} har fått administratortilgang`)
              }
            >
              <ShieldPlus aria-hidden="true" />
              Gi administratortilgang
            </DropdownMenuItem>
          )}
          {isSelf || isDeveloper ? null : (
            <DropdownMenuItem
              variant="destructive"
              onClick={() => setDeleteOpen(true)}
            >
              <Trash2 aria-hidden="true" />
              Slett bruker
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      {isSelf ? null : (
          <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Slette brukeren?</AlertDialogTitle>
                <AlertDialogDescription>
                  {email} kan ikke lenger logge inn før de ber om en ny lenke.
                  Revisjonshistorikken beholder det brukeren har gjort.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Avbryt</AlertDialogCancel>
                <AlertDialogAction variant="destructive" onClick={handleDelete}>
                  Slett bruker
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
      )}
    </>
  );
}
