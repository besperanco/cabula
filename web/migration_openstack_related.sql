-- Acrescenta uma lista de "comandos relacionados" curada manualmente aos
-- comandos, para complementar (nao substituir) o "Ver também" automático por
-- irmãos de subcategoria (siblingCommands() em app.js). Corre isto uma vez no
-- SQL Editor do Supabase, depois do schema.sql e do migration_subcategories.sql
-- já estarem aplicados.
--
-- Formato de `related`: nomes de comandos separados por " · ", exatamente
-- como aparecem na coluna `command` (ex: "openstack server list · openstack
-- server event list · openstack port list"). Quando vazio (o caso de todos
-- os comandos existentes), o comportamento não muda nada: a app continua a
-- calcular os "irmãos" automaticamente como sempre fez.

alter table commands add column if not exists related text not null default '';

create or replace function add_command(
    pin text, p_command text, p_description text, p_category text,
    p_tags text default '', p_example text default '', p_notes text default '',
    p_subcategory text default '', p_related text default ''
) returns commands language plpgsql security definer as $$
declare
    result commands;
begin
    perform _check_pin(pin);
    insert into commands (command, description, category, tags, example, notes, subcategory, related)
    values (p_command, p_description, p_category, p_tags, p_example, p_notes, p_subcategory, p_related)
    returning * into result;
    return result;
end;
$$;

create or replace function update_command(
    pin text, p_id bigint, p_command text, p_description text, p_category text,
    p_tags text default '', p_example text default '', p_notes text default '',
    p_subcategory text default '', p_related text default ''
) returns commands language plpgsql security definer as $$
declare
    result commands;
begin
    perform _check_pin(pin);
    update commands set command = p_command, description = p_description, category = p_category,
        tags = p_tags, example = p_example, notes = p_notes, subcategory = p_subcategory, related = p_related
    where id = p_id
    returning * into result;
    return result;
end;
$$;
