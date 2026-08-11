-- Atualiza o playbook "Recuperar VM presa em ERROR" (ja inserido antes com
-- recover_vm_error_seed.sql) para usar a variavel {{nome_servidor}} em vez
-- do nome fixo "meu-servidor", tal como o playbook "Criar VM do zero".
-- Corre uma vez no SQL Editor do Supabase. Idempotente: se corrido outra
-- vez, apaga e volta a inserir os mesmos passos (mesmo resultado).

do $$
declare
    sid bigint;
begin
    select id into sid from scenarios where title = 'Recuperar VM presa em ERROR';

    if sid is not null then
        delete from scenario_steps where scenario_id = sid;

        insert into scenario_steps (scenario_id, position, command, note) values
            (sid, 0, 'openstack server show {{nome_servidor}}',
             'Confirma o estado atual (ERROR) e recolhe detalhes como o host e a mensagem de erro (fault).'),
            (sid, 1, 'openstack server event list {{nome_servidor}}',
             'Vê o histórico de ações (create, reboot, etc.) e identifica em qual delas falhou.'),
            (sid, 2, 'openstack console log show {{nome_servidor}}',
             'Consulta o log de consola (boot) da instância à procura de pistas sobre a falha.'),
            (sid, 3, 'openstack server reboot {{nome_servidor}}',
             'Tenta primeiro um reboot suave (soft) — resolve muitos casos sem impacto adicional.'),
            (sid, 4, 'openstack server reboot --hard {{nome_servidor}}',
             'Se o reboot suave não resolver, força um reboot rígido (hard), equivalente a desligar e ligar fisicamente a instância.'),
            (sid, 5, 'openstack server set --state active {{nome_servidor}}',
             'Se a instância ficou presa num estado de tarefa sem problema real, repõe manualmente o estado para "active" (equivalente ao antigo "nova reset-state").'),
            (sid, 6, 'openstack server rebuild {{nome_servidor}}',
             'Último recurso: recria a instância do zero a partir da imagem original, mantendo nome/IP — mas perde-se tudo o que não esteja em disco persistente.');
    end if;
end $$;
