-- Protege o PIN contra forca bruta: a chave "anon" e publica por desenho,
-- por isso sem isto nada impede um script de tentar milhoes de PINs
-- seguidos contra as funcoes de escrita. Bloqueia temporariamente depois de
-- varias tentativas erradas seguidas. Corre isto uma vez no SQL Editor do
-- projeto Supabase.

alter table app_config add column if not exists failed_attempts int not null default 0;
alter table app_config add column if not exists locked_until timestamptz;

create or replace function _check_pin(pin text) returns void
language plpgsql security definer as $$
declare
    cfg app_config;
begin
    select * into cfg from app_config where id = 1;

    if cfg.locked_until is not null and cfg.locked_until > now() then
        raise exception 'Demasiadas tentativas erradas. Tenta novamente daqui a % minuto(s).',
            ceil(extract(epoch from (cfg.locked_until - now())) / 60);
    end if;

    if cfg.pin_hash = crypt(pin, cfg.pin_hash) then
        update app_config set failed_attempts = 0, locked_until = null where id = 1;
        return;
    end if;

    update app_config set
        failed_attempts = cfg.failed_attempts + 1,
        locked_until = case when cfg.failed_attempts + 1 >= 5 then now() + interval '15 minutes' else cfg.locked_until end
    where id = 1;

    raise exception 'PIN invalido';
end;
$$;
