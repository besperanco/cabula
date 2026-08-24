-- Liga o site a autenticacao real do Supabase (Supabase Auth) e cria a
-- tabela "notes" para o bloco de notas pessoal. Corre isto uma vez no SQL
-- Editor do projeto Supabase.
--
-- Antes desta migracao, a leitura (SELECT) das tabelas estava aberta a
-- qualquer visitante com a chave "anon". Depois desta migracao, so sessoes
-- autenticadas conseguem ler (ou escrever, no caso de "notes") — sem login
-- no site, nao ha acesso a nada, nem por API direta.
--
-- O utilizador de login e' criado a parte (via Admin API/painel do
-- Supabase), nao aqui.

-- ---------------------------------------------------------------------
-- Notas
-- ---------------------------------------------------------------------

create table if not exists notes (
    id bigint generated always as identity primary key,
    title text not null default '',
    content text not null default '',
    position int not null default 0,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

alter table notes enable row level security;

create policy notes_all on notes for all
    using (auth.role() = 'authenticated')
    with check (auth.role() = 'authenticated');

-- ---------------------------------------------------------------------
-- Fecha a leitura das restantes tabelas a sessoes autenticadas
-- ---------------------------------------------------------------------

drop policy if exists commands_read on commands;
drop policy if exists scenarios_read on scenarios;
drop policy if exists scenario_steps_read on scenario_steps;
drop policy if exists glossary_read on glossary;
drop policy if exists links_read on links;

create policy commands_read on commands for select using (auth.role() = 'authenticated');
create policy scenarios_read on scenarios for select using (auth.role() = 'authenticated');
create policy scenario_steps_read on scenario_steps for select using (auth.role() = 'authenticated');
create policy glossary_read on glossary for select using (auth.role() = 'authenticated');
create policy links_read on links for select using (auth.role() = 'authenticated');
