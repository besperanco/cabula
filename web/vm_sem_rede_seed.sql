-- Playbook "Troubleshooting VM sem rede", para colar no SQL Editor do
-- Supabase. Nao duplica se correres duas vezes: salta se ja existir um
-- cenario com o mesmo titulo.
--
-- Segue o fluxograma VM -> Port -> Security Group -> Network -> Subnet ->
-- Router -> Gateway -> Floating IP -> OVS Bridge -> Neutron Agent, do lado
-- da instancia para fora ate a infraestrutura de rede.

do $$
declare
    new_id bigint;
begin
    if not exists (select 1 from scenarios where title = 'Troubleshooting VM sem rede') then
        insert into scenarios (title, description, category)
        values (
            'Troubleshooting VM sem rede',
            'Sequência de diagnóstico de rede numa instância, do lado da VM para fora até à infraestrutura Neutron (porta, grupo de segurança, rede, sub-rede, router, gateway, IP flutuante, bridge OVS e agentes).',
            'OpenStack'
        )
        returning id into new_id;

        insert into scenario_steps (scenario_id, position, command, note) values
            (new_id, 0, 'openstack server show {{nome_servidor}}',
             'VM: confirma o estado da instância e a que rede(s)/porta(s) está ligada.'),
            (new_id, 1, 'openstack port show {{id_porta}}',
             'Port: confirma que a porta de rede está ACTIVE (não DOWN) e a que rede/sub-rede está associada. Usa "openstack port list --server {{nome_servidor}}" para encontrar o ID.'),
            (new_id, 2, 'openstack security group rule list {{grupo_seguranca}}',
             'Security Group: confirma se existem regras a bloquear o tráfego esperado (ex.: falta ICMP, SSH, HTTP).'),
            (new_id, 3, 'openstack network show {{rede}}',
             'Network: confirma que a rede interna está ativa (UP) e com o estado administrativo correto.'),
            (new_id, 4, 'openstack subnet show {{subrede}}',
             'Subnet: confirma o CIDR, o gateway_ip e se o DHCP está ativado.'),
            (new_id, 5, 'openstack router show {{router}}',
             'Router: confirma que o router está ativo e ligado a esta sub-rede (campo "interfaces_info").'),
            (new_id, 6, 'openstack network show {{rede_externa}}',
             'Gateway: confirma que a rede externa usada como gateway existe e está ativa — sem isto o router não tem para onde encaminhar tráfego de saída.'),
            (new_id, 7, 'openstack floating ip list',
             'Floating IP: confirma se a instância tem mesmo um IP público associado e a que porta está ligado.'),
            (new_id, 8, 'ovs-vsctl show',
             'OVS Bridge: corre isto por SSH no nó de rede/compute para ver a topologia das bridges OVS (br-int, br-ex, br-tun) e confirmar que a porta da instância está ligada à bridge correta.'),
            (new_id, 9, 'openstack network agent list',
             'Neutron Agent: confirma que os agentes (L3, DHCP, OVS/Linux Bridge, Metadata) estão "alive" no host relevante — um agente em baixo explica falhas de rede mesmo com toda a configuração correta.');
    end if;
end $$;
