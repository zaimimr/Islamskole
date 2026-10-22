import {
  HeaderSkeleton,
  ListCardSkeleton,
  PageSkeleton,
  TabsSkeleton,
} from "@/components/admin/admin-skeletons";

export default function LaerereLoading() {
  return (
    <PageSkeleton label="Laster lærere …" className="gap-5 sm:gap-6 lg:gap-6">
      <HeaderSkeleton actions={2} />
      <TabsSkeleton />
      <ListCardSkeleton rows={6} />
    </PageSkeleton>
  );
}
