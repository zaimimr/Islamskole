"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Trash2 } from "lucide-react";
import { reorderClasses, deleteClass } from "@/app/[locale]/admin/actions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RowActionsMenu } from "@/components/admin/row-actions-menu";
import { cn } from "@/lib/utils";

export type SortableClass = {
  id: string;
  name: string;
  age: string;
  capacity: number | null;
  enrolled: number;
  price: number | null;
  published: boolean;
  teachers: string[];
};

function CapacityMeter({
  enrolled,
  capacity,
}: {
  enrolled: number;
  capacity: number | null;
}) {
  const ratio = capacity ? Math.min(enrolled / capacity, 1) : 0;
  const full = capacity != null && enrolled >= capacity;
  return (
    <div className="grid w-full gap-1 sm:w-32">
      <span className="text-sm tabular-nums">
        <span className="font-bold">{enrolled}</span>
        {capacity != null ? ` / ${capacity}` : ""} elever
        {full ? <span className="font-bold text-[#8B2F2B]"> · Full</span> : null}
      </span>
      {capacity != null ? (
        <span
          aria-hidden="true"
          className="h-1.5 overflow-hidden rounded-full bg-[#ECE8DF]"
        >
          <span
            className={cn(
              "block h-full rounded-full",
              full ? "bg-[#C5524C]" : "bg-[#3C8F44]",
            )}
            style={{ width: `${ratio * 100}%` }}
          />
        </span>
      ) : null}
    </div>
  );
}

function Row({ item, basePath, reordering }: { item: SortableClass; basePath: string; reordering: boolean }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id, disabled: !reordering });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={cn(
        "grid items-center gap-x-3 gap-y-2 bg-white px-4 py-4 sm:px-5",
        reordering ? "grid-cols-[auto_minmax(0,1fr)_auto] sm:grid-cols-[auto_minmax(0,1fr)_auto_auto_auto]" : "grid-cols-[minmax(0,1fr)_auto] sm:grid-cols-[minmax(0,1fr)_auto_auto]",
        isDragging &&
          "relative z-10 rounded-xl shadow-[0_12px_32px_rgba(45,55,43,0.14)] ring-1 ring-[#8DB793]",
      )}
    >
      {reordering ? <button
        type="button"
        aria-label="Dra for å endre rekkefølge"
        title="Dra for å endre rekkefølge"
        className="col-start-1 row-span-2 row-start-1 flex size-11 cursor-grab touch-none items-center justify-center self-center rounded-xl text-admin-muted outline-none transition-colors hover:bg-[#F2F1EB] active:cursor-grabbing focus-visible:ring-3 focus-visible:ring-ring/50 sm:col-start-auto sm:row-span-1 sm:row-start-auto"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="size-5" />
      </button> : null}
      <Link
        href={`${basePath}/klasser/${item.id}`}
        className={cn("row-start-1 min-w-0 rounded-lg sm:col-start-auto sm:row-start-auto outline-none focus-visible:ring-3 focus-visible:ring-ring/50", reordering ? "col-start-2" : "col-start-1")}
      >
        <span className="block truncate font-bold underline-offset-4 hover:underline">
          {item.name}
        </span>
        <span className="mt-1 block text-sm">{item.teachers.length ? item.teachers.join(", ") : "Ingen lærer tildelt"}</span>
        <span className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-admin-muted">
          <span>{item.age}</span>
          {item.price != null ? (
            <span className="tabular-nums text-[#775108]">
              {item.price.toLocaleString("nb-NO")} kr per år, overstyrer
              årsavgiften
            </span>
          ) : null}
        </span>
      </Link>
      <div className={cn("row-start-2 sm:col-start-auto sm:row-start-auto", reordering ? "col-start-2" : "col-start-1")}>
        <CapacityMeter enrolled={item.enrolled} capacity={item.capacity} />
      </div>
      {reordering ? <Badge
        variant={item.published ? "default" : "secondary"}
        className={cn(
          "col-start-3 row-start-1 w-fit justify-self-end sm:col-start-auto sm:row-start-auto sm:justify-self-auto",
          item.published && "bg-[#DCEDDD] text-[#216A2B] hover:bg-[#DCEDDD]",
        )}
      >
        {item.published ? "Publisert" : "Utkast"}
      </Badge> : null}
      <div className={cn("row-start-1 flex items-center justify-end gap-1 sm:col-start-auto sm:row-start-auto", reordering ? "col-start-3" : "col-start-2")}>
        <RowActionsMenu
          label={`Handlinger for ${item.name}`}
          actions={[
            {
              id: "delete",
              label: "Slett klasse",
              icon: Trash2,
              destructive: true,
              run: () => deleteClass(item.id),
              success: "Klassen er slettet",
              confirm: {
                title: `Slette ${item.name}?`,
                description:
                  "Klassen fjernes fra nettsiden og kan ikke gjenopprettes. Klasser med elever plassert kan ikke slettes.",
                confirmLabel: "Slett klasse",
              },
            },
          ]}
        />
      </div>
    </li>
  );
}

export function ClassSortList({
  classes,
  basePath,
}: {
  classes: SortableClass[];
  basePath: string;
}) {
  const [items, setItems] = useState(classes);
  const [reordering, setReordering] = useState(false);
  const [pending, startTransition] = useTransition();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = items.findIndex((i) => i.id === active.id);
    const newIndex = items.findIndex((i) => i.id === over.id);
    const previous = items;
    const next = arrayMove(previous, oldIndex, newIndex);
    setItems(next);
    startTransition(async () => {
      const res = await reorderClasses(next.map((i) => i.id));
      if (res.ok) {
        toast.success("Rekkefølge lagret");
      } else {
        toast.error(res.error);
        setItems(previous);
      }
    });
  }

  return (
    <div>
    <div className="flex justify-end border-b border-[#ECE8DF] px-4 py-2"><Button type="button" variant="ghost" disabled={pending} aria-pressed={reordering} onClick={() => setReordering((value) => !value)}>{reordering ? "Ferdig med rekkefølge" : "Rekkefølge på nettsiden"}</Button></div>
    <DndContext
      id="class-sort"
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext
        items={items.map((i) => i.id)}
        strategy={verticalListSortingStrategy}
      >
        <ul
          aria-busy={pending}
          className={cn("divide-y divide-[#ECE8DF]", pending && "opacity-70")}
        >
          {items.map((item) => (
            <Row key={item.id} item={item} basePath={basePath} reordering={reordering} />
          ))}
        </ul>
      </SortableContext>
    </DndContext>
    </div>
  );
}
