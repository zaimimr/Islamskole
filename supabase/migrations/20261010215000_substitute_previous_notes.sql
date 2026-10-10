create policy "lesson staff reads class history" on public.class_notes for select to authenticated using (
  exists (
    select 1 from public.lessons l
    join public.school_days assigned_day on assigned_day.id = l.school_day_id
    join public.school_days note_day on note_day.id = class_notes.school_day_id
    where l.class_id = class_notes.class_id and assigned_day.school_year_id = note_day.school_year_id
      and public.portal_teaches_lesson(l.id)
  )
);
