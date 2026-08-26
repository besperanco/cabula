-- Preenche `example` e `related` em falta nos comandos OpenStack semeados
-- por openstack_expand_seed.sql. Corre isto DEPOIS desse ficheiro.
--
-- Só escreve em campos que estejam vazios (''): nada do que já preencheste
-- manualmente na app é substituído. Podes correr isto mais do que uma vez
-- sem risco.

begin;

create temporary table _os_fill (
    command text, example text, related text
);

insert into _os_fill (command, example, related) values

-- Geral
('openstack configuration show', '', 'openstack token issue'),
('openstack project list', '', 'openstack project show · openstack project create'),
('openstack project delete', 'openstack project delete "meu-projeto"', 'openstack project list'),
('openstack project create', '', 'openstack project list · openstack project set'),
('openstack project set', '', 'openstack project list · openstack project delete'),
('openstack user list', '', 'openstack user show · openstack user create'),
('openstack user create', '', 'openstack user list · openstack role add'),
('openstack user set', '', 'openstack user list'),
('openstack user delete', 'openstack user delete "utilizador"', 'openstack user list'),
('openstack role list', '', 'openstack role assignment list'),
('openstack role show', '', 'openstack role list'),

-- Compute
('openstack server list', 'openstack server list --project "meu-projeto"', ''),
('openstack server show', 'openstack server show "meu-servidor"', ''),
('openstack server create', '', 'openstack server list · openstack flavor list · openstack image list'),
('openstack server set', 'openstack server set --name "novo-nome" "meu-servidor"', 'openstack server show'),
('openstack server delete', '', 'openstack server list'),
('openstack server start', 'openstack server start "meu-servidor"', ''),
('openstack server stop', 'openstack server stop "meu-servidor"', ''),
('openstack server reboot --soft', 'openstack server reboot "meu-servidor"', ''),
('openstack server reboot --hard', 'openstack server reboot --hard "meu-servidor"', ''),
('openstack server pause', 'openstack server pause "meu-servidor"', ''),
('openstack server unpause', 'openstack server unpause "meu-servidor"', ''),
('openstack server suspend', 'openstack server suspend "meu-servidor"', ''),
('openstack server resume', 'openstack server resume "meu-servidor"', ''),
('openstack server rebuild', 'openstack server rebuild --image "minha-imagem" "meu-servidor"', ''),
('openstack server rescue', 'openstack server rescue "meu-servidor"', ''),
('openstack server unrescue', 'openstack server unrescue "meu-servidor"', ''),
('openstack server resize confirm', 'openstack server resize confirm "meu-servidor"', ''),
('openstack server resize revert', 'openstack server resize revert "meu-servidor"', ''),
('openstack server event list', 'openstack server event list "meu-servidor"', ''),
('openstack console log show', 'openstack console log show "meu-servidor"', ''),
('openstack server image create', 'openstack server image create --name "minha-imagem" "meu-servidor"', ''),
('openstack server volume list', 'openstack server volume list "meu-servidor"', ''),
('openstack server add volume', 'openstack server add volume "meu-servidor" "meu-volume"', ''),
('openstack server remove volume', 'openstack server remove volume "meu-servidor" "meu-volume"', ''),
('openstack server remove floating ip', 'openstack server remove floating ip "meu-servidor" "203.0.113.10"', ''),

-- Compute Admin
('openstack compute service list', 'openstack compute service list --host "compute-01"', ''),
('openstack compute service set', 'openstack compute service set "compute-01" "nova-compute" --disable', ''),
('openstack hypervisor list', 'openstack hypervisor list --matching "compute-01"', ''),
('openstack hypervisor stats show', '', 'openstack hypervisor list'),
('openstack host list', '', 'openstack hypervisor list'),
('openstack host show', 'openstack host show "compute-01"', 'openstack host list'),
('openstack server migration abort', 'openstack server migration abort "meu-servidor" "id-da-migration"', ''),
('openstack server migration confirm', 'openstack server migration confirm "meu-servidor" "id-da-migration"', ''),
('openstack server migration revert', 'openstack server migration revert "meu-servidor" "id-da-migration"', ''),
('openstack availability zone list', '', 'openstack availability zone show'),
('openstack availability zone show', 'openstack availability zone show "nova"', 'openstack availability zone list'),
('openstack aggregate list', '', 'openstack aggregate show'),
('openstack aggregate show', 'openstack aggregate show "meu-aggregate"', 'openstack aggregate list'),
('openstack aggregate create', 'openstack aggregate create "meu-aggregate"', 'openstack aggregate add host'),
('openstack aggregate set', 'openstack aggregate set --property "az=nova" "meu-aggregate"', 'openstack aggregate show'),
('openstack aggregate add host', 'openstack aggregate add host "meu-aggregate" "compute-01"', 'openstack aggregate remove host'),
('openstack aggregate remove host', 'openstack aggregate remove host "meu-aggregate" "compute-01"', 'openstack aggregate add host'),
('openstack server group list', '', 'openstack server group show'),
('openstack server group show', 'openstack server group show "meu-grupo"', 'openstack server group list'),
('openstack server group create', '', 'openstack server group list'),
('openstack server group delete', 'openstack server group delete "meu-grupo"', 'openstack server group list'),

-- Network
('openstack network show', 'openstack network show "minha-rede"', ''),
('openstack network create', '', 'openstack network list · openstack subnet create'),
('openstack network set', 'openstack network set --disable "minha-rede"', 'openstack network show'),
('openstack network delete', 'openstack network delete "minha-rede"', 'openstack network list'),
('openstack subnet list', '', 'openstack subnet show'),
('openstack subnet show', 'openstack subnet show "minha-subrede"', ''),
('openstack subnet create', '', 'openstack subnet list · openstack router add subnet'),
('openstack subnet set', 'openstack subnet set --dhcp "minha-subrede"', 'openstack subnet show'),
('openstack subnet delete', 'openstack subnet delete "minha-subrede"', 'openstack subnet list'),
('openstack port show', 'openstack port show "id-da-porta"', ''),
('openstack port create', 'openstack port create --network "minha-rede" "minha-porta"', 'openstack port list'),
('openstack port delete', 'openstack port delete "id-da-porta"', 'openstack port list'),
('openstack router list', '', 'openstack router show'),
('openstack router show', 'openstack router show "meu-router"', ''),
('openstack router create', '', 'openstack router list · openstack router set'),
('openstack router set', '', 'openstack router list · openstack router show'),
('openstack router delete', 'openstack router delete "meu-router"', 'openstack router list'),
('openstack router add subnet', 'openstack router add subnet "meu-router" "minha-subrede"', ''),
('openstack router remove subnet', 'openstack router remove subnet "meu-router" "minha-subrede"', ''),
('openstack router port list', 'openstack router port list "meu-router"', ''),
('openstack floating ip list', '', ''),
('openstack floating ip show', 'openstack floating ip show "203.0.113.10"', ''),
('openstack floating ip create', '', 'openstack floating ip list · openstack server add floating ip'),
('openstack floating ip set', 'openstack floating ip set --port "id-da-porta" "203.0.113.10"', 'openstack floating ip show'),
('openstack floating ip delete', 'openstack floating ip delete "203.0.113.10"', 'openstack floating ip list'),
('openstack network agent list', 'openstack network agent list --agent-type DHCP', ''),
('openstack network agent show', 'openstack network agent show "id-do-agente"', 'openstack network agent list'),
('openstack network agent set', 'openstack network agent set --disable "id-do-agente"', 'openstack network agent list'),
('openstack security group list', '', 'openstack security group show'),
('openstack security group show', '', 'openstack security group rule list'),
('openstack security group create', '', 'openstack security group list · openstack security group rule create'),
('openstack security group set', 'openstack security group set --description "novo" "meu-grupo"', 'openstack security group show'),
('openstack security group delete', 'openstack security group delete "meu-grupo"', 'openstack security group list'),

-- Storage
('openstack volume list', '', ''),
('openstack volume show', 'openstack volume show "meu-volume"', ''),
('openstack volume create', '', 'openstack volume list · openstack server add volume'),
('openstack volume set', 'openstack volume set --name "novo-nome" "meu-volume"', 'openstack volume show'),
('openstack volume delete', 'openstack volume delete "meu-volume"', 'openstack volume list'),
('openstack volume snapshot list', '', 'openstack volume snapshot show'),
('openstack volume snapshot show', 'openstack volume snapshot show "meu-snapshot"', 'openstack volume snapshot list'),
('openstack volume snapshot create', '', 'openstack volume snapshot list · openstack volume show'),
('openstack volume snapshot set', 'openstack volume snapshot set --name "novo-nome" "meu-snapshot"', 'openstack volume snapshot show'),
('openstack volume snapshot delete', 'openstack volume snapshot delete "meu-snapshot"', 'openstack volume snapshot list'),

-- Images
('openstack image list', '', 'openstack image show'),
('openstack image show', '', 'openstack image list'),
('openstack image create', '', 'openstack image list · openstack server image create'),
('openstack image set', 'openstack image set --public "minha-imagem"', 'openstack image show'),
('openstack image delete', 'openstack image delete "minha-imagem"', 'openstack image list'),

-- Infrastructure
('openstack flavor list', '', 'openstack flavor show'),
('openstack flavor show', '', 'openstack flavor list'),
('openstack flavor create', '', 'openstack flavor list'),
('openstack flavor set', 'openstack flavor set --property "hw:mem_page_size=large" "m1.custom"', 'openstack flavor show'),
('openstack flavor delete', 'openstack flavor delete "m1.custom"', 'openstack flavor list'),
('openstack keypair list', '', 'openstack keypair show'),
('openstack keypair show', '', 'openstack keypair list'),
('openstack keypair create', '', 'openstack keypair list'),
('openstack keypair delete', 'openstack keypair delete "minha-chave"', 'openstack keypair list')

;

update commands c set
    example = case when coalesce(c.example, '') = '' then s.example else c.example end,
    related = case when coalesce(c.related, '') = '' then s.related else c.related end
from _os_fill s
where c.category = 'OpenStack' and c.command = s.command;

commit;
