import {
  FormSkeleton,
  HeaderSkeleton,
  PageSkeleton,
} from "@/components/admin/admin-skeletons";

export default function InnstillingerLoading() {
  return (
    <PageSkeleton label="Laster innstillinger …">
      <HeaderSkeleton />
      <FormSkeleton sections={2} />
    </PageSkeleton>
  );
}
