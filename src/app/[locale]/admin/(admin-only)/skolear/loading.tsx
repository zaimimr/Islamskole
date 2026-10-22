import {
  CardSkeleton,
  HeaderSkeleton,
  ListCardSkeleton,
  PageSkeleton,
} from "@/components/admin/admin-skeletons";

export default function SkolearLoading() {
  return (
    <PageSkeleton label="Laster skoleår …">
      <HeaderSkeleton actions={1} />
      <CardSkeleton head={false} className="min-h-52 sm:p-6" />
      <ListCardSkeleton rows={3} />
    </PageSkeleton>
  );
}
