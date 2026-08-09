-- Adiciona um contador de uso aos comandos (quantas vezes cada um foi
-- copiado), usado para ordenar a Home pelos mais usados em vez de A-Z.
-- Corre isto uma vez no SQL Editor do projeto Supabase.

alter table commands add column if not exists usage_count integer not null default 0;

-- Sem PIN de proposito: e so um "+1" a um contador, nunca mexe noutros
-- dados, por isso nao faz sentido pedir o PIN de edicao so para copiar um
-- comando. O pior cenario de abuso e um contador inflacionado, nao perda
-- de dados.
create or replace function increment_command_usage(p_id bigint) returns void
language sql security definer as $$
    update commands set usage_count = usage_count + 1 where id = p_id;
$$;
