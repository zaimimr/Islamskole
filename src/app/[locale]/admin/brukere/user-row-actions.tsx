"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  GraduationCap,
  MoreHorizontal,
  ShieldMinus,
  Trash2,
  UserRoundCog,
} from "lucide-react";
import {
  deleteUser,
  makeUserTeacher,
  removeAdminAccess,
} from "@/app/[locale]/admin/actions";
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

type ActionResult = { ok: true; id?: string } | { ok: false; error: string };
type RowAction = (
  previous: ActionResult | null,
  formData: FormData,
) => Promise<ActionResult>;

export function UserRowActions({
  userId,
  email,
  isSelf,
  isAdmin,
  isTeacher,
  canImpersonate,
  isDeveloper,
}: {
  userId: string;
  email: string;
  isSelf: boolean;
  isAdmin: boolean;
  isTeacher: boolean;
  canImpersonate: boolean;
  isDeveloper: boolean;
}) {
  const removeRow = useRemoveRow();
  const router = useRouter();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function run(action: RowAction, success: string) {
    const formData = new FormData();
    formData.set("user_id", userId);
    startTransition(async () => {
      const result = await action(null, formData);
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
      {isSelf && isTeacher ? null : (
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
                  run(makeUserTeacher, `${email} er registrert som lærer`)
                }
              >
                <GraduationCap aria-hidden="true" />
                Gjør til lærer
              </DropdownMenuItem>
            )}
            {isAdmin && !isSelf ? (
              <DropdownMenuItem
                onClick={() =>
                  run(
                    removeAdminAccess,
                    `${email} har ikke lenger administratortilgang`,
                  )
                }
              >
                <ShieldMinus aria-hidden="true" />
                Fjern administratortilgang
              </DropdownMenuItem>
            ) : null}
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
      )}
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
