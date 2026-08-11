-- Playbook "Recuperar VM presa em ERROR", para colar no SQL Editor do Supabase.
-- Nao duplica se correres duas vezes: salta se ja existir um cenario com o
-- mesmo titulo.

do $$
declare
    new_id bigint;
begin
    if not exists (select 1 from scenarios where title = 'Recuperar VM presa em ERROR') then
        insert into scenarios (title, description, category)
        values (
            'Recuperar VM presa em ERROR',
            'Sequência de diagnóstico e recuperação para uma instância presa no estado ERROR, do passo menos invasivo até ao mais invasivo.',
            'OpenStack'
        )
        returning id into new_id;

        insert into scenario_steps (scenario_id, position, command, note) values
            (new_id, 0, 'openstack server show {{nome_servidor}}',
             'Confirma o estado atual (ERROR) e recolhe detalhes como o host e a mensagem de erro (fault).'),
            (new_id, 1, 'openstack server event list {{nome_servidor}}',
             'Vê o histórico de ações (create, reboot, etc.) e identifica em qual delas falhou.'),
            (new_id, 2, 'openstack console log show {{nome_servidor}}',
             'Consulta o log de consola (boot) da instância à procura de pistas sobre a falha.'),
            (new_id, 3, 'openstack server reboot {{nome_servidor}}',
             'Tenta primeiro um reboot suave (soft) — resolve muitos casos sem impacto adicional.'),
            (new_id, 4, 'openstack server reboot --hard {{nome_servidor}}',
             'Se o reboot suave não resolver, força um reboot rígido (hard), equivalente a desligar e ligar fisicamente a instância.'),
            (new_id, 5, 'openstack server set --state active {{nome_servidor}}',
             'Se a instância ficou presa num estado de tarefa sem problema real, repõe manualmente o estado para "active" (equivalente ao antigo "nova reset-state").'),
            (new_id, 6, 'openstack server rebuild {{nome_servidor}}',
             'Último recurso: recria a instância do zero a partir da imagem original, mantendo nome/IP — mas perde-se tudo o que não esteja em disco persistente.');
    end if;
end $$;
