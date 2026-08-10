-- Comandos das areas Nova e Neutron, para colar no SQL Editor do Supabase.
-- Nao duplica se correres duas vezes: o "where not exists" salta comandos
-- que ja existam (mesmo texto + categoria).

insert into commands (command, description, category, tags, example)
select v.command, v.description, v.category, v.tags, v.example
from (values
    ('nova list', 'Lista as instâncias (VMs) do projeto atual, via CLI legado do Nova', 'Nova', 'nova listar vm instancia servidor compute', ''),
    ('nova show', 'Mostra detalhes completos de uma instância', 'Nova', 'nova detalhes vm instancia compute', 'nova show "meu-servidor"'),
    ('nova boot', 'Cria (arranca) uma nova instância', 'Nova', 'nova criar vm instancia compute', 'nova boot --image "ubuntu" --flavor "m1.small" --nic net-id="id-da-rede" "meu-servidor"'),
    ('nova delete', 'Apaga uma instância', 'Nova', 'nova apagar eliminar vm instancia compute', 'nova delete "meu-servidor"'),
    ('nova reboot', 'Reinicia uma instância (--hard para reinício forçado)', 'Nova', 'nova reiniciar vm instancia compute', 'nova reboot "meu-servidor"'),
    ('nova stop', 'Para (desliga) uma instância', 'Nova', 'nova parar desligar vm instancia compute', 'nova stop "meu-servidor"'),
    ('nova start', 'Arranca uma instância parada', 'Nova', 'nova arrancar ligar vm instancia compute', 'nova start "meu-servidor"'),
    ('nova pause / unpause', 'Suspende (em memória) ou retoma uma instância, sem a desligar', 'Nova', 'nova pausar suspender retomar vm compute', 'nova pause "meu-servidor"'),
    ('nova resize', 'Redimensiona uma instância para outro flavor', 'Nova', 'nova redimensionar flavor tamanho vm compute', 'nova resize "meu-servidor" "m1.medium"'),
    ('nova resize-confirm', 'Confirma um resize em curso, libertando os recursos antigos', 'Nova', 'nova confirmar resize compute', 'nova resize-confirm "meu-servidor"'),
    ('nova resize-revert', 'Reverte um resize em curso, voltando ao flavor anterior', 'Nova', 'nova reverter resize compute', 'nova resize-revert "meu-servidor"'),
    ('nova migrate', 'Migra (a frio) uma instância para outro hypervisor, sem a manter ligada', 'Nova', 'nova migrar hypervisor compute', 'nova migrate "meu-servidor"'),
    ('nova live-migration', 'Migra (a quente) uma instância para outro hypervisor, sem a desligar', 'Nova', 'nova migracao viva live compute hypervisor', 'nova live-migration "meu-servidor" "host-destino"'),
    ('nova hypervisor-list', 'Lista os hypervisors (nós físicos de compute) do ambiente', 'Nova', 'nova hypervisor listar no fisico compute', ''),
    ('nova hypervisor-show', 'Mostra detalhes e capacidade (CPU/RAM) de um hypervisor', 'Nova', 'nova hypervisor detalhes capacidade compute', 'nova hypervisor-show "compute-01"'),
    ('nova host-list', 'Lista os hosts registados no serviço de compute', 'Nova', 'nova host listar compute', ''),
    ('nova service-list', 'Lista os serviços do Nova (nova-compute, nova-scheduler, etc.) e o seu estado', 'Nova', 'nova servico listar estado compute diagnosticar', ''),
    ('nova service-disable', 'Desativa um serviço Nova num host (ex: antes de manutenção)', 'Nova', 'nova servico desativar manutencao compute', 'nova service-disable "compute-01" "nova-compute"'),
    ('nova service-enable', 'Reativa um serviço Nova num host', 'Nova', 'nova servico ativar compute', 'nova service-enable "compute-01" "nova-compute"'),
    ('nova diagnostics', 'Mostra métricas de baixo nível (CPU/rede/disco) de uma instância', 'Nova', 'nova diagnostico metricas desempenho compute', 'nova diagnostics "meu-servidor"'),
    ('nova console-log', 'Mostra o log de consola (boot) de uma instância', 'Nova', 'nova consola log boot diagnosticar compute', 'nova console-log "meu-servidor"'),
    ('nova get-vnc-console', 'Devolve um URL de consola VNC para aceder ao ecrã da instância', 'Nova', 'nova vnc consola ecra aceder compute', 'nova get-vnc-console "meu-servidor" novnc'),
    ('nova quota-show', 'Mostra as quotas (limites) de compute de um projeto', 'Nova', 'nova quota limites projeto compute', 'nova quota-show --tenant "meu-projeto"'),
    ('nova quota-update', 'Atualiza uma quota de compute de um projeto', 'Nova', 'nova quota atualizar limite projeto compute', 'nova quota-update --instances 20 "meu-projeto"'),
    ('neutron net-list', 'Lista as redes (networks) do projeto, via CLI legado do Neutron', 'Neutron', 'neutron listar rede network', ''),
    ('neutron net-show', 'Mostra detalhes de uma rede', 'Neutron', 'neutron detalhes rede network', 'neutron net-show "minha-rede"'),
    ('neutron net-create', 'Cria uma rede', 'Neutron', 'neutron criar rede network', 'neutron net-create "minha-rede"'),
    ('neutron subnet-list', 'Lista as sub-redes do projeto', 'Neutron', 'neutron listar subrede subnet', ''),
    ('neutron subnet-create', 'Cria uma sub-rede dentro de uma rede', 'Neutron', 'neutron criar subrede subnet rede', 'neutron subnet-create --name "minha-subrede" "minha-rede" "10.0.0.0/24"'),
    ('neutron port-list', 'Lista as portas (interfaces virtuais) do projeto', 'Neutron', 'neutron listar porta port interface', ''),
    ('neutron port-show', 'Mostra detalhes de uma porta, incluindo IP e MAC atribuídos', 'Neutron', 'neutron detalhes porta port ip mac', 'neutron port-show "id-da-porta"'),
    ('neutron port-update', 'Altera as security groups ou o estado (admin state) de uma porta', 'Neutron', 'neutron atualizar porta port seguranca', 'neutron port-update "id-da-porta" --security-group "meu-grupo"'),
    ('neutron router-list', 'Lista os routers do projeto', 'Neutron', 'neutron listar router', ''),
    ('neutron router-create', 'Cria um router', 'Neutron', 'neutron criar router', 'neutron router-create "meu-router"'),
    ('neutron router-interface-add', 'Liga um router a uma sub-rede interna', 'Neutron', 'neutron router interface ligar subrede', 'neutron router-interface-add "meu-router" "minha-subrede"'),
    ('neutron router-gateway-set', 'Define a rede externa (gateway) de saída de um router', 'Neutron', 'neutron router gateway externo internet', 'neutron router-gateway-set "meu-router" "ext-net"'),
    ('neutron floatingip-list', 'Lista os IPs flutuantes (públicos) do projeto', 'Neutron', 'neutron listar ip flutuante publico floatingip', ''),
    ('neutron floatingip-create', 'Cria um IP flutuante numa rede externa', 'Neutron', 'neutron criar ip flutuante publico floatingip', 'neutron floatingip-create "ext-net"'),
    ('neutron floatingip-associate', 'Associa um IP flutuante a uma porta (instância)', 'Neutron', 'neutron associar ip flutuante publico porta instancia', 'neutron floatingip-associate "id-do-floatingip" "id-da-porta"'),
    ('neutron security-group-list', 'Lista os grupos de segurança (firewalls) do projeto', 'Neutron', 'neutron listar firewall seguranca grupo', ''),
    ('neutron security-group-rule-create', 'Adiciona uma regra a um grupo de segurança', 'Neutron', 'neutron regra firewall porta permitir', 'neutron security-group-rule-create --protocol tcp --port-range-min 22 --port-range-max 22 "meu-grupo"'),
    ('neutron agent-list', 'Lista os agentes Neutron (L3, DHCP, OVS, metadata) e o seu estado por host', 'Neutron', 'neutron agente listar estado diagnosticar l3 dhcp ovs', ''),
    ('neutron l3-agent-list-hosting-router', 'Mostra em que agente L3 (nó de rede) um router está a correr', 'Neutron', 'neutron l3 agente router hospedar diagnosticar', 'neutron l3-agent-list-hosting-router "meu-router"'),
    ('neutron dhcp-agent-list-hosting-net', 'Mostra em que agente(s) DHCP uma rede está a ser servida', 'Neutron', 'neutron dhcp agente rede hospedar diagnosticar', 'neutron dhcp-agent-list-hosting-net "minha-rede"'),
    ('neutron l3-agent-router-remove', 'Remove um router de um agente L3 (útil para forçar failover)', 'Neutron', 'neutron l3 agente router remover failover', 'neutron l3-agent-router-remove "id-do-agente" "meu-router"')
) as v(command, description, category, tags, example)
where not exists (
    select 1 from commands c where c.command = v.command and c.category = v.category
);
