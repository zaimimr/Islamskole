import {
  HeaderSkeleton,
  ListCardSkeleton,
  PageSkeleton,
} from "@/components/admin/admin-skeletons";

export default function BrukereLoading() {
  return (
    <PageSkeleton label="Laster brukere …" className="gap-5 sm:gap-6 lg:gap-6">
      <HeaderSkeleton actions={1} />
      <ListCardSkeleton rows={6} lead="avatar" />
    </PageSkeleton>
  );
}
