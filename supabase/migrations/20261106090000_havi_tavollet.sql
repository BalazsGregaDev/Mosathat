create or replace function public.absences_range(p_from date, p_to date)
returns table (
  id uuid, staff_id uuid, staff_name text, day date, kind absence_kind,
  starts time, ends time, note text, sajat boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select a.id, a.staff_id, s.full_name, a.day, a.kind, a.starts, a.ends, a.note,
         a.staff_id = auth.uid()
    from public.staff_absences a
    join public.staff s on s.id = a.staff_id
   where public.is_staff()
     and a.day between p_from and p_to
   order by a.day, public.tavollet_tol(a), s.full_name;
$$;

revoke all on function public.absences_range(date, date) from public, anon;
grant execute on function public.absences_range(date, date) to authenticated;
