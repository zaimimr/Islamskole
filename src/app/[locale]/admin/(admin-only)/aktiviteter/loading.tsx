import {
  HeaderSkeleton,
  ListCardSkeleton,
  PageSkeleton,
} from "@/components/admin/admin-skeletons";

export default function AktiviteterLoading() {
  return (
    <PageSkeleton label="Laster aktiviteter …">
      <HeaderSkeleton actions={1} />
      <ListCardSkeleton rows={3} lead="tile" />
      <ListCardSkeleton rows={3} lead="tile" />
    </PageSkeleton>
  );
}
