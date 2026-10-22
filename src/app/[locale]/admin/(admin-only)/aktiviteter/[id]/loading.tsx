import {
  FormSkeleton,
  HeaderSkeleton,
  PageSkeleton,
} from "@/components/admin/admin-skeletons";

export default function AktivitetLoading() {
  return (
    <PageSkeleton label="Laster aktivitet …">
      <HeaderSkeleton back />
      <FormSkeleton sections={2} />
    </PageSkeleton>
  );
}
