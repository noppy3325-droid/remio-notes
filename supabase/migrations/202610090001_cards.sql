-- Run once in the Supabase SQL Editor. Never put a service_role key in Vite.
create table public.note_cards (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null check (length(id) between 1 and 200),
  card jsonb,
  revision integer not null default 1 check (revision > 0),
  mutation_id text not null check (length(mutation_id) between 1 and 200),
  updated_at timestamptz not null default now(),
  primary key (user_id, id),
  check (card is null or (jsonb_typeof(card) = 'object' and card->>'id' = id))
);
alter table public.note_cards enable row level security;
create policy "Read own cards" on public.note_cards for select to authenticated using ((select auth.uid()) = user_id);
revoke all on public.note_cards from anon, authenticated;
grant select on public.note_cards to authenticated;

-- Compare-and-swap and idempotency are enforced on the server, including deletes.
create function public.apply_note_card(p_id text, p_base integer, p_card jsonb, p_mutation text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  owner_id uuid := auth.uid();
  existing public.note_cards;
begin
  if owner_id is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if p_base < 0 or p_base is null or p_mutation is null or length(p_mutation) not between 1 and 200
    or p_id is null or length(p_id) not between 1 and 200
    or (p_card is not null and (jsonb_typeof(p_card) <> 'object' or (p_card->>'id') is distinct from p_id or pg_column_size(p_card) > 1048576))
    then raise exception 'Invalid card'; end if;
  -- Serialize concurrent inserts as well as updates for this user's card ID.
  perform pg_advisory_xact_lock(hashtextextended(owner_id::text || ':' || p_id, 0));
  select * into existing from public.note_cards where user_id = owner_id and id = p_id for update;
  if found then
    if existing.mutation_id = p_mutation then
      return jsonb_build_object('applied', true, 'row', jsonb_build_object('id',existing.id,'revision',existing.revision,'card',existing.card,'mutation_id',existing.mutation_id));
    end if;
    if existing.revision <> p_base then
      return jsonb_build_object('applied', false, 'row', jsonb_build_object('id',existing.id,'revision',existing.revision,'card',existing.card,'mutation_id',existing.mutation_id));
    end if;
    update public.note_cards set card=p_card, revision=revision+1, mutation_id=p_mutation, updated_at=now()
      where user_id=owner_id and id=p_id returning * into existing;
  else
    if p_base <> 0 then raise exception 'Missing cloud revision'; end if;
    insert into public.note_cards(user_id,id,card,mutation_id) values(owner_id,p_id,p_card,p_mutation) returning * into existing;
  end if;
  return jsonb_build_object('applied',true,'row',jsonb_build_object('id',existing.id,'revision',existing.revision,'card',existing.card,'mutation_id',existing.mutation_id));
end $$;

-- Return one consistent snapshot; JSON aggregation avoids the REST row cap.
create function public.list_note_cards() returns jsonb
language sql stable security invoker set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'revision',revision,'card',card,'mutation_id',mutation_id)), '[]'::jsonb)
  from public.note_cards where user_id = (select auth.uid());
$$;
revoke all on function public.apply_note_card(text,integer,jsonb,text) from public, anon;
revoke all on function public.list_note_cards() from public, anon;
grant execute on function public.apply_note_card(text,integer,jsonb,text) to authenticated;
grant execute on function public.list_note_cards() to authenticated;
