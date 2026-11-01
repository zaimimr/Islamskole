import {
  HeaderSkeleton,
  ListCardSkeleton,
  PageSkeleton,
} from "@/components/admin/admin-skeletons";

export default function FollowUpLoading() {
  return (
    <PageSkeleton label="Laster oppfølging …">
      <HeaderSkeleton />
      <ListCardSkeleton rows={6} head={false} />
    </PageSkeleton>
  );
}
