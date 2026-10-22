import {
  HeaderSkeleton,
  ListCardSkeleton,
  PageSkeleton,
} from "@/components/admin/admin-skeletons";

export default function DagsplanLoading() {
  return (
    <PageSkeleton label="Laster dagsplan …">
      <HeaderSkeleton actions={1} />
      <ListCardSkeleton rows={6} />
    </PageSkeleton>
  );
}
