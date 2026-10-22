import {
  FormSkeleton,
  HeaderSkeleton,
  PageSkeleton,
} from "@/components/admin/admin-skeletons";

export default function RolloverLoading() {
  return (
    <PageSkeleton label="Laster overgang …" className="gap-5 sm:gap-6 lg:gap-6">
      <HeaderSkeleton back />
      <FormSkeleton sections={2} />
    </PageSkeleton>
  );
}
