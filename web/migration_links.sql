-- Adiciona a seccao "Links Uteis". Corre isto uma vez no SQL Editor do
-- Supabase (depois do schema.sql inicial ja estar aplicado).

create table if not exists links (
    id bigint generated always as identity primary key,
    title text not null,
    url text not null,
    description text not null default '',
    category text not null,
    created_at timestamptz not null default now()
);

alter table links enable row level security;
create policy links_read on links for select using (true);

create or replace function add_link(pin text, p_title text, p_url text, p_description text, p_category text)
returns links language plpgsql security definer as $$
declare
    result links;
begin
    perform _check_pin(pin);
    insert into links (title, url, description, category) values (p_title, p_url, p_description, p_category)
    returning * into result;
    return result;
end;
$$;

create or replace function update_link(pin text, p_id bigint, p_title text, p_url text, p_description text, p_category text)
returns links language plpgsql security definer as $$
declare
    result links;
begin
    perform _check_pin(pin);
    update links set title = p_title, url = p_url, description = p_description, category = p_category
    where id = p_id
    returning * into result;
    return result;
end;
$$;

create or replace function delete_link(pin text, p_id bigint) returns void
language plpgsql security definer as $$
begin
    perform _check_pin(pin);
    delete from links where id = p_id;
end;
$$;
