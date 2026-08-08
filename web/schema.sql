-- Cabula (web) — schema Supabase/Postgres.
-- Corre isto uma vez no SQL Editor do projeto Supabase.
--
-- Modelo de acesso: leitura (SELECT) aberta a qualquer visitante (a chave
-- "anon" que vai para o site estático); escrita (INSERT/UPDATE/DELETE) só
-- através das funções RPC abaixo, que exigem o PIN correto. As tabelas não
-- têm policies de escrita para "anon" — só as funções SECURITY DEFINER
-- conseguem escrever, porque correm com os privilégios de quem as criou.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- Tabelas
-- ---------------------------------------------------------------------

create table if not exists app_config (
    id int primary key default 1,
    pin_hash text not null,
    constraint app_config_singleton check (id = 1)
);

create table if not exists commands (
    id bigint generated always as identity primary key,
    command text not null,
    description text not null,
    category text not null,
    subcategory text not null default '',
    tags text not null default '',
    example text not null default '',
    notes text not null default '',
    favorite boolean not null default false,
    created_at timestamptz not null default now()
);

create table if not exists scenarios (
    id bigint generated always as identity primary key,
    title text not null,
    description text not null default '',
    category text not null,
    favorite boolean not null default false,
    created_at timestamptz not null default now()
);

create table if not exists scenario_steps (
    id bigint generated always as identity primary key,
    scenario_id bigint not null references scenarios(id) on delete cascade,
    position int not null,
    command text not null default '',
    note text not null default ''
);

create table if not exists glossary (
    id bigint generated always as identity primary key,
    term text not null,
    definition text not null,
    category text not null,
    created_at timestamptz not null default now()
);

create table if not exists links (
    id bigint generated always as identity primary key,
    title text not null,
    url text not null,
    description text not null default '',
    category text not null,
    created_at timestamptz not null default now()
);

create index if not exists scenario_steps_scenario_id_idx on scenario_steps(scenario_id);

-- ---------------------------------------------------------------------
-- RLS: leitura livre, escrita fechada (só as funções abaixo escrevem)
-- ---------------------------------------------------------------------

alter table commands enable row level security;
alter table scenarios enable row level security;
alter table scenario_steps enable row level security;
alter table glossary enable row level security;
alter table links enable row level security;
alter table app_config enable row level security;

create policy commands_read on commands for select using (true);
create policy scenarios_read on scenarios for select using (true);
create policy scenario_steps_read on scenario_steps for select using (true);
create policy glossary_read on glossary for select using (true);
create policy links_read on links for select using (true);
-- app_config nao tem policy nenhuma: nem leitura fica acessivel a "anon".

-- ---------------------------------------------------------------------
-- PIN: define aqui o PIN inicial (muda 'MUDA-ME' antes de correr)
-- ---------------------------------------------------------------------

insert into app_config (id, pin_hash) values (1, crypt('MUDA-ME', gen_salt('bf')))
on conflict (id) do nothing;

create or replace function _check_pin(pin text) returns void
language plpgsql security definer as $$
begin
    if not exists (
        select 1 from app_config where id = 1 and pin_hash = crypt(pin, pin_hash)
    ) then
        raise exception 'PIN invalido';
    end if;
end;
$$;

-- ---------------------------------------------------------------------
-- Comandos
-- ---------------------------------------------------------------------

create or replace function add_command(
    pin text, p_command text, p_description text, p_category text,
    p_tags text default '', p_example text default '', p_notes text default '',
    p_subcategory text default ''
) returns commands language plpgsql security definer as $$
declare
    result commands;
begin
    perform _check_pin(pin);
    insert into commands (command, description, category, tags, example, notes, subcategory)
    values (p_command, p_description, p_category, p_tags, p_example, p_notes, p_subcategory)
    returning * into result;
    return result;
end;
$$;

create or replace function update_command(
    pin text, p_id bigint, p_command text, p_description text, p_category text,
    p_tags text default '', p_example text default '', p_notes text default '',
    p_subcategory text default ''
) returns commands language plpgsql security definer as $$
declare
    result commands;
begin
    perform _check_pin(pin);
    update commands set command = p_command, description = p_description, category = p_category,
        tags = p_tags, example = p_example, notes = p_notes, subcategory = p_subcategory
    where id = p_id
    returning * into result;
    return result;
end;
$$;

create or replace function delete_command(pin text, p_id bigint) returns void
language plpgsql security definer as $$
begin
    perform _check_pin(pin);
    delete from commands where id = p_id;
end;
$$;

create or replace function toggle_command_favorite(pin text, p_id bigint) returns commands
language plpgsql security definer as $$
declare
    result commands;
begin
    perform _check_pin(pin);
    update commands set favorite = not favorite where id = p_id returning * into result;
    return result;
end;
$$;

-- ---------------------------------------------------------------------
-- Cenarios (com passos, recebidos/devolvidos como jsonb)
-- ---------------------------------------------------------------------

create or replace function add_scenario(
    pin text, p_title text, p_description text, p_category text, p_steps jsonb default '[]'
) returns bigint language plpgsql security definer as $$
declare
    new_id bigint;
    step jsonb;
    pos int := 0;
begin
    perform _check_pin(pin);
    insert into scenarios (title, description, category) values (p_title, p_description, p_category)
    returning id into new_id;
    for step in select * from jsonb_array_elements(p_steps) loop
        insert into scenario_steps (scenario_id, position, command, note)
        values (new_id, pos, step->>'command', step->>'note');
        pos := pos + 1;
    end loop;
    return new_id;
end;
$$;

create or replace function update_scenario(
    pin text, p_id bigint, p_title text, p_description text, p_category text, p_steps jsonb default '[]'
) returns void language plpgsql security definer as $$
declare
    step jsonb;
    pos int := 0;
begin
    perform _check_pin(pin);
    update scenarios set title = p_title, description = p_description, category = p_category
    where id = p_id;
    delete from scenario_steps where scenario_id = p_id;
    for step in select * from jsonb_array_elements(p_steps) loop
        insert into scenario_steps (scenario_id, position, command, note)
        values (p_id, pos, step->>'command', step->>'note');
        pos := pos + 1;
    end loop;
end;
$$;

create or replace function delete_scenario(pin text, p_id bigint) returns void
language plpgsql security definer as $$
begin
    perform _check_pin(pin);
    delete from scenarios where id = p_id;
end;
$$;

create or replace function toggle_scenario_favorite(pin text, p_id bigint) returns scenarios
language plpgsql security definer as $$
declare
    result scenarios;
begin
    perform _check_pin(pin);
    update scenarios set favorite = not favorite where id = p_id returning * into result;
    return result;
end;
$$;

-- ---------------------------------------------------------------------
-- Glossario
-- ---------------------------------------------------------------------

create or replace function add_term(pin text, p_term text, p_definition text, p_category text)
returns glossary language plpgsql security definer as $$
declare
    result glossary;
begin
    perform _check_pin(pin);
    insert into glossary (term, definition, category) values (p_term, p_definition, p_category)
    returning * into result;
    return result;
end;
$$;

create or replace function update_term(pin text, p_id bigint, p_term text, p_definition text, p_category text)
returns glossary language plpgsql security definer as $$
declare
    result glossary;
begin
    perform _check_pin(pin);
    update glossary set term = p_term, definition = p_definition, category = p_category
    where id = p_id
    returning * into result;
    return result;
end;
$$;

create or replace function delete_term(pin text, p_id bigint) returns void
language plpgsql security definer as $$
begin
    perform _check_pin(pin);
    delete from glossary where id = p_id;
end;
$$;

-- ---------------------------------------------------------------------
-- Links uteis
-- ---------------------------------------------------------------------

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

-- ---------------------------------------------------------------------
-- Trocar o PIN (chama-se esta funcao a partir da app com o PIN atual)
-- ---------------------------------------------------------------------

create or replace function change_pin(old_pin text, new_pin text) returns void
language plpgsql security definer as $$
begin
    perform _check_pin(old_pin);
    update app_config set pin_hash = crypt(new_pin, gen_salt('bf')) where id = 1;
end;
$$;

-- Todas as funcoes RPC ficam expostas a "anon" e "authenticated" por omissao
-- (o Supabase expoe funcoes do schema public via PostgREST); nao precisas de
-- grants extra. A tabela app_config continua inacessivel diretamente.
