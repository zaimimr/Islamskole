import {
  HeaderSkeleton,
  ListCardSkeleton,
  PageSkeleton,
} from "@/components/admin/admin-skeletons";

export default function KlasserLoading() {
  return (
    <PageSkeleton label="Laster klasser …">
      <HeaderSkeleton actions={1} />
      <ListCardSkeleton rows={6} lead="handle" />
    </PageSkeleton>
  );
}
