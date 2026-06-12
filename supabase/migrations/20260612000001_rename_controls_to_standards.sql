-- rename controls → standards in both tables (jsonb column, no data type change)
alter table public.generated_standards  rename column controls to standards;
alter table public.standards_snapshots  rename column controls to standards;
