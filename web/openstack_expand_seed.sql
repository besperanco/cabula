-- Expansão da secção OpenStack — biblioteca de comandos (Geral, Identidade,
-- Compute, Compute Admin, Network, Storage, Images, Infrastructure).
-- Corre isto uma vez no SQL Editor do Supabase, DEPOIS de:
--   1. schema.sql
--   2. migration_subcategories.sql
--   3. migration_openstack_related.sql
--
-- Não é um simples INSERT: para os comandos que já existiam (semeados no
-- app.py antigo / migration_subcategories.sql), este script ATUALIZA a
-- descrição/subcategoria/tags/notas/relacionados para a nova estrutura, em
-- vez de duplicar a linha. Comandos novos são inseridos. Nada é apagado, e
-- `favorite`/`usage_count` de linhas já existentes só é preservado ou ligado
-- — nunca desligado por este script.
--
-- Testado contra OpenStackClient 3.14.3 / Nova 10.1.1: onde um subcomando
-- pode não existir ou ter disponibilidade dependente de versão/API/política,
-- isso fica assinalado no campo `notes` do próprio comando, em vez de
-- apresentado como universal.

begin;

create temporary table _os_seed (
    command text, description text, subcategory text, tags text,
    example text, notes text, related text, favorite boolean
);

insert into _os_seed (command, description, subcategory, tags, example, notes, related, favorite) values

-- ---------------------------------------------------------------------
-- Geral
-- ---------------------------------------------------------------------
('openstack token issue', 'Emite um token de autenticação válido para usar diretamente noutras chamadas (ex: API REST). Serve também para confirmar que as credenciais e o endpoint estão corretos.', 'Geral', 'keystone identity token autenticacao daily', '', '', '', false),
('openstack endpoint list', 'Lista os endpoints registados no catálogo de serviços (URL de cada API, por região). Primeiro sítio a olhar para confirmar se um serviço está mesmo registado antes de o testar diretamente.', 'Geral', 'keystone identity endpoint catalogo admin troubleshooting', '', '', 'openstack service list · openstack catalog list', false),
('openstack catalog list', 'Mostra o catálogo de serviços tal como o cliente o vê depois de autenticar — como `endpoint list`, mas já filtrado ao que a tua sessão consegue ver.', 'Geral', 'keystone identity catalogo servico daily', '', '', 'openstack endpoint list · openstack service list', false),
('openstack service list', 'Lista os serviços OpenStack registados no Keystone (nova, neutron, cinder, glance, ...). Ponto de partida quando um serviço parece estar totalmente indisponível.', 'Geral', 'keystone identity servico admin troubleshooting', '', '', 'openstack endpoint list · openstack catalog list', false),
('openstack configuration show', 'Mostra a configuração efetiva do cliente (endpoint, projeto, região, versões de API) tal como resolvida a partir das variáveis de ambiente / openrc. Útil para confirmar contra que ambiente estás mesmo a apontar antes de correr um comando destrutivo.', 'Geral', 'openstackclient configuracao ambiente daily troubleshooting', '', 'O nome exato deste subcomando pode variar ligeiramente entre versões do OpenStackClient.', '', false),

-- ---------------------------------------------------------------------
-- Identidade
-- ---------------------------------------------------------------------
('openstack project list', 'Lista os projetos (tenants) visíveis com as credenciais atuais.', 'Identidade', 'keystone identity projeto tenant admin daily', '', '', '', false),
('openstack project show', 'Mostra os detalhes de um projeto: id, domínio e se está ativo.', 'Identidade', 'keystone identity projeto tenant admin', 'openstack project show "meu-projeto"', '', 'openstack project list', false),
('openstack project create', 'Cria um novo projeto (tenant).', 'Identidade', 'keystone identity projeto tenant admin', 'openstack project create --domain "default" "meu-projeto"', '', '', false),
('openstack project set', 'Altera propriedades de um projeto existente: nome, descrição, ou ativar/desativar.', 'Identidade', 'keystone identity projeto tenant admin', 'openstack project set --disable "meu-projeto"', '', '', false),
('openstack project delete', 'Apaga um projeto.', 'Identidade', 'keystone identity projeto tenant admin', '', 'Normalmente falha se ainda existirem recursos associados (VMs, redes, volumes) — confirma primeiro com server list / network list / volume list nesse projeto.', '', false),

('openstack user list', 'Lista os utilizadores conhecidos pelo Keystone.', 'Identidade', 'keystone identity utilizador admin daily', '', '', '', false),
('openstack user show', 'Mostra os detalhes de um utilizador: projeto por omissão, domínio e estado.', 'Identidade', 'keystone identity utilizador admin', 'openstack user show "utilizador"', '', 'openstack user list · openstack role assignment list', false),
('openstack user create', 'Cria um novo utilizador.', 'Identidade', 'keystone identity utilizador admin', 'openstack user create --project "meu-projeto" --password-prompt "novo-utilizador"', '', '', false),
('openstack user set', 'Altera propriedades de um utilizador: password, projeto por omissão, ou ativar/desativar.', 'Identidade', 'keystone identity utilizador admin', 'openstack user set --enable "utilizador"', '', '', false),
('openstack user delete', 'Apaga um utilizador.', 'Identidade', 'keystone identity utilizador admin', '', '', '', false),

('openstack role list', 'Lista as roles (papéis) disponíveis no Keystone (ex: admin, member, reader).', 'Identidade', 'keystone identity role permissoes admin', '', '', '', false),
('openstack role show', 'Mostra os detalhes de uma role.', 'Identidade', 'keystone identity role admin', 'openstack role show "admin"', '', '', false),
('openstack role assignment list', 'Mostra que utilizadores/grupos têm que roles em que projetos. Comando a usar quando alguém "não tem permissões", para perceber exatamente o que falta atribuir.', 'Identidade', 'keystone identity role permissoes admin troubleshooting', 'openstack role assignment list --project "meu-projeto" --names', '', 'openstack role list · openstack role add · openstack role remove', false),
('openstack role add', 'Atribui uma role a um utilizador — globalmente ou num projeto específico.', 'Identidade', 'keystone identity role permissoes admin', 'openstack role add --project "meu-projeto" --user "utilizador" "member"', '', 'openstack role assignment list', false),
('openstack role remove', 'Remove uma role atribuída a um utilizador.', 'Identidade', 'keystone identity role permissoes admin', 'openstack role remove --project "meu-projeto" --user "utilizador" "member"', '', 'openstack role assignment list', false),

-- ---------------------------------------------------------------------
-- Compute
-- ---------------------------------------------------------------------
('openstack server list', 'Lista as instâncias (VMs) do projeto atual com o estado resumido. Ponto de partida habitual para qualquer diagnóstico.', 'Compute', 'nova compute vm troubleshooting daily', '', '', 'openstack server show · openstack server event list', true),
('openstack server show', 'Mostra o estado completo da VM. É normalmente o primeiro comando a correr quando uma instância apresenta problemas.', 'Compute', 'nova compute vm troubleshooting daily', '', 'Verificar: task_state · vm_state · power_state · OS-EXT-SRV-ATTR:host · fault', 'openstack server list · openstack server event list · openstack server migration list · openstack port list · openstack console log show', true),
('openstack server create', 'Cria uma nova instância.', 'Compute', 'nova compute vm criar daily', 'openstack server create --image "ubuntu" --flavor "m1.small" --network "priv" "meu-servidor"', '', '', false),
('openstack server set', 'Altera propriedades de uma instância já criada: nome, propriedades ou estado administrativo.', 'Compute', 'nova compute vm advanced', '', '', '', false),
('openstack server delete', 'Apaga uma instância.', 'Compute', 'nova compute vm daily', 'openstack server delete "meu-servidor"', '', '', false),

('openstack server start', 'Arranca uma instância parada (SHUTOFF → ACTIVE).', 'Compute', 'nova compute vm daily', '', '', 'openstack server stop · openstack server show', false),
('openstack server stop', 'Para (desliga) uma instância de forma ordenada, sem a apagar.', 'Compute', 'nova compute vm daily', '', '', 'openstack server start · openstack server show', false),

('openstack server reboot --soft', 'Reinicia a instância pedindo ao SO para desligar/religar de forma ordenada — equivale a um reboot feito de dentro da VM.', 'Compute', 'nova compute vm troubleshooting', '', 'É o comportamento por omissão de `server reboot` sem flags.', 'openstack server reboot --hard · openstack console log show', false),
('openstack server reboot --hard', 'Força um reinício ao nível do hypervisor, sem esperar resposta do SO — usar quando a VM está pendurada e um reboot normal não tem efeito.', 'Compute', 'nova compute vm troubleshooting', '', '', 'openstack server reboot --soft · openstack console log show', false),

('openstack server pause', 'Suspende a VM em memória no próprio hypervisor (fica congelada), sem passar pelo SO. Mais rápido de retomar do que suspend.', 'Compute', 'nova compute vm advanced', '', '', 'openstack server unpause', false),
('openstack server unpause', 'Retoma uma instância pausada.', 'Compute', 'nova compute vm advanced', '', '', 'openstack server pause', false),

('openstack server suspend', 'Suspende a instância para disco (como hibernar), libertando os recursos de CPU/RAM do hypervisor.', 'Compute', 'nova compute vm advanced', '', '', 'openstack server resume', false),
('openstack server resume', 'Retoma uma instância suspensa.', 'Compute', 'nova compute vm advanced', '', '', 'openstack server suspend', false),

('openstack server rebuild', 'Reconstrói a instância a partir de uma imagem: mantém IP e volumes, mas substitui o disco raiz.', 'Compute', 'nova compute vm advanced', '', 'Apaga o conteúdo do disco raiz — confirma que não há dados importantes lá antes de correr.', 'openstack image list · openstack server show', false),

('openstack server rescue', 'Arranca a instância num modo de recuperação, com o disco original montado a partir de uma imagem temporária de rescue. Útil quando o SO da própria VM não arranca.', 'Compute', 'nova compute vm troubleshooting advanced', '', '', 'openstack server unrescue · openstack console log show', false),
('openstack server unrescue', 'Sai do modo rescue e volta ao arranque normal a partir do disco original.', 'Compute', 'nova compute vm troubleshooting advanced', '', '', 'openstack server rescue', false),

('openstack server resize', 'Muda o flavor (tamanho) de uma instância existente. Fica num estado intermédio (VERIFY_RESIZE) até confirmares ou reverteres.', 'Compute', 'nova compute vm flavor advanced', 'openstack server resize --flavor "m1.medium" "meu-servidor"', '', 'openstack server resize confirm · openstack server resize revert · openstack flavor list', false),
('openstack server resize confirm', 'Confirma um resize em curso, libertando os recursos antigos. Sem isto (ou revert), a instância fica presa em VERIFY_RESIZE.', 'Compute', 'nova compute vm flavor advanced', '', '', 'openstack server resize · openstack server resize revert', false),
('openstack server resize revert', 'Reverte um resize em curso, voltando ao flavor e host anteriores.', 'Compute', 'nova compute vm flavor advanced', '', '', 'openstack server resize · openstack server resize confirm', false),

('openstack server event list', 'Mostra o histórico de ações da instância (start, reboot, resize, ...) com o resultado de cada uma e a mensagem de erro, quando existe. Essencial para perceber o que aconteceu antes de uma VM ficar presa ou em ERROR.', 'Compute', 'nova compute vm troubleshooting daily', '', '', 'openstack server show · openstack server migration list', true),

('openstack console log show', 'Mostra o log de consola (boot) da instância, tal como o SO o escreveu. Útil quando a VM não arranca ou não responde a rede/SSH.', 'Compute', 'nova compute vm console troubleshooting', '', '', 'openstack server show · openstack server rescue', false),
('openstack console url show', 'Devolve um URL de consola gráfica (VNC/SPICE/noVNC) para aceder ao ecrã da instância a partir do browser.', 'Compute', 'nova compute vm console troubleshooting', 'openstack console url show --novnc "meu-servidor"', '', 'openstack console log show', false),

('openstack server image create', 'Cria uma imagem a partir do disco atual de uma instância (snapshot).', 'Compute', 'nova glance compute vm imagem backup', '', '', 'openstack image list', false),

('openstack server volume list', 'Lista os volumes associados a uma instância.', 'Compute', 'nova cinder compute vm volume troubleshooting', '', '', 'openstack server add volume · openstack server remove volume · openstack volume show', false),
('openstack server add volume', 'Associa um volume (disco) a uma instância.', 'Compute', 'nova cinder compute vm volume daily', '', '', 'openstack server volume list · openstack volume list', false),
('openstack server remove volume', 'Remove a associação de um volume a uma instância, sem apagar o volume.', 'Compute', 'nova cinder compute vm volume daily', '', '', 'openstack server volume list', false),

('openstack server add floating ip', 'Associa um IP flutuante a uma instância.', 'Compute', 'nova neutron compute vm floating-ip daily', 'openstack server add floating ip "meu-servidor" "203.0.113.10"', '', 'openstack server remove floating ip · openstack floating ip list', false),
('openstack server remove floating ip', 'Remove a associação de um IP flutuante a uma instância — o IP continua reservado no projeto, só deixa de apontar para a VM.', 'Compute', 'nova neutron compute vm floating-ip daily', '', '', 'openstack server add floating ip · openstack floating ip list', false),

-- ---------------------------------------------------------------------
-- Compute Admin
-- ---------------------------------------------------------------------
('openstack compute service list', 'Lista os serviços de compute (nova-compute, nova-scheduler, nova-conductor, ...) por host, com o estado (up/down) e o admin state (enabled/disabled). Primeiro comando para perceber se um compute node está mesmo operacional.', 'Compute Admin', 'nova admin compute troubleshooting daily', '', 'Requer permissões de admin.', 'openstack hypervisor list · openstack hypervisor show · openstack compute service set', true),
('openstack compute service set', 'Ativa/desativa um serviço de compute num host (ex: antes de manutenção).', 'Compute Admin', 'nova admin compute advanced', '', 'Requer permissões de admin.', 'openstack compute service list', false),

('openstack hypervisor list', 'Lista os compute nodes (hypervisors) conhecidos pelo Nova. Útil para confirmar se um host está registado e comparar o estado dos vários computes.', 'Compute Admin', 'nova admin compute hypervisor daily', '', '', 'openstack hypervisor show · openstack compute service list', true),
('openstack hypervisor show', 'Mostra detalhes e capacidade (CPU/RAM/disco usado vs total) de um compute node — dá para perceber se um host está saturado antes de lá colocares mais VMs.', 'Compute Admin', 'nova admin compute hypervisor troubleshooting', 'openstack hypervisor show "compute-01"', '', 'openstack hypervisor list · openstack compute service list · openstack server show', true),
('openstack hypervisor stats show', 'Mostra estatísticas agregadas de todos os hypervisors: total de vCPUs/RAM/disco usados vs disponíveis no ambiente.', 'Compute Admin', 'nova admin compute hypervisor capacidade', '', '', 'openstack hypervisor list', false),

('openstack host list', 'Lista os hosts registados no serviço de compute — visão mais crua, por trás dos hypervisors.', 'Compute Admin', 'nova admin compute host advanced', '', 'Comando legado nalgumas versões — em ambientes mais recentes `hypervisor list` costuma bastar.', '', false),
('openstack host show', 'Mostra os recursos usados/disponíveis de um host específico.', 'Compute Admin', 'nova admin compute host advanced', '', '', '', false),

('openstack server migration list', 'Lista as migrations (a frio ou live) de uma instância, com o estado de cada uma.', 'Compute Admin', 'nova admin compute migration troubleshooting', 'openstack server migration list "meu-servidor"', '', 'openstack server migration show · openstack server show', true),
('openstack server migration show', 'Mostra os detalhes de uma migration específica: origem, destino, progresso e estado.', 'Compute Admin', 'nova admin compute migration troubleshooting', 'openstack server migration show "meu-servidor" "id-da-migration"', '', 'openstack server migration list', true),
('openstack server migration abort', 'Cancela uma migration em curso.', 'Compute Admin', 'nova admin compute migration advanced', '', 'Disponibilidade depende da versão/API e da política do ambiente — nem todos os estados de migration permitem abort.', 'openstack server migration list · openstack server migration show', false),
('openstack server migration confirm', 'Confirma uma migration a frio em curso — equivalente a `server resize confirm`.', 'Compute Admin', 'nova admin compute migration advanced', '', 'Disponibilidade depende da versão/API e da política do ambiente.', 'openstack server migration list · openstack server migration show', false),
('openstack server migration revert', 'Reverte uma migration a frio em curso, voltando ao host original.', 'Compute Admin', 'nova admin compute migration advanced', '', 'Disponibilidade depende da versão/API e da política do ambiente.', 'openstack server migration list · openstack server migration show', false),

('openstack availability zone list', 'Lista as availability zones e os hosts que cada uma agrupa.', 'Compute Admin', 'nova admin compute az', '', '', '', false),
('openstack availability zone show', 'Mostra os detalhes de uma availability zone.', 'Compute Admin', 'nova admin compute az', '', 'Nalgumas versões mais antigas do OpenStackClient este subcomando pode não existir — usa `availability zone list` como alternativa.', '', false),

('openstack aggregate list', 'Lista os host aggregates (agrupamentos lógicos de compute nodes, usados por exemplo para scheduling ou para AZs).', 'Compute Admin', 'nova admin compute aggregate advanced', '', '', '', false),
('openstack aggregate show', 'Mostra os hosts e a metadata de um aggregate.', 'Compute Admin', 'nova admin compute aggregate advanced', '', '', '', false),
('openstack aggregate create', 'Cria um host aggregate.', 'Compute Admin', 'nova admin compute aggregate advanced', '', '', '', false),
('openstack aggregate set', 'Altera propriedades/metadata de um aggregate.', 'Compute Admin', 'nova admin compute aggregate advanced', '', '', '', false),
('openstack aggregate add host', 'Adiciona um compute node a um aggregate.', 'Compute Admin', 'nova admin compute aggregate advanced', '', '', '', false),
('openstack aggregate remove host', 'Remove um compute node de um aggregate.', 'Compute Admin', 'nova admin compute aggregate advanced', '', '', '', false),

('openstack server group list', 'Lista os server groups (regras de afinidade/anti-afinidade entre instâncias).', 'Compute Admin', 'nova admin compute servergroup advanced', '', '', '', false),
('openstack server group show', 'Mostra os membros e a política (affinity/anti-affinity) de um server group.', 'Compute Admin', 'nova admin compute servergroup advanced', '', '', '', false),
('openstack server group create', 'Cria um server group com uma política de afinidade.', 'Compute Admin', 'nova admin compute servergroup advanced', 'openstack server group create --policy anti-affinity "meu-grupo"', '', '', false),
('openstack server group delete', 'Apaga um server group.', 'Compute Admin', 'nova admin compute servergroup advanced', '', '', '', false),

('openstack quota show', 'Mostra as quotas (limites) de compute/network/storage de um projeto.', 'Compute Admin', 'nova admin quota limites daily', 'openstack quota show "meu-projeto"', '', 'openstack quota set', false),
('openstack quota set', 'Atualiza as quotas de um projeto.', 'Compute Admin', 'nova admin quota limites', 'openstack quota set --instances 20 --cores 40 "meu-projeto"', 'Requer permissões de admin.', 'openstack quota show', false),

-- ---------------------------------------------------------------------
-- Network
-- ---------------------------------------------------------------------
('openstack network list', 'Lista as redes (networks) visíveis no projeto atual.', 'Network', 'neutron network rede daily', '', '', 'openstack network show · openstack subnet list', true),
('openstack network show', 'Mostra os detalhes de uma rede: estado, tipo, MTU e se é partilhada/externa.', 'Network', 'neutron network rede troubleshooting', '', '', 'openstack network list · openstack subnet show · openstack network agent list', true),
('openstack network create', 'Cria uma rede.', 'Network', 'neutron network rede criar', 'openstack network create "minha-rede"', '', '', false),
('openstack network set', 'Altera propriedades de uma rede: nome, estado administrativo, MTU.', 'Network', 'neutron network rede advanced', '', '', '', false),
('openstack network delete', 'Apaga uma rede.', 'Network', 'neutron network rede', '', 'Falha se ainda tiver sub-redes ou portas associadas.', '', false),

('openstack subnet list', 'Lista as sub-redes do projeto.', 'Network', 'neutron network subnet daily', '', '', '', false),
('openstack subnet show', 'Mostra os detalhes de uma sub-rede: CIDR, allocation pools, gateway e se tem DHCP ativo.', 'Network', 'neutron network subnet troubleshooting', '', 'Verificar: enable_dhcp · allocation_pools · gateway_ip · cidr', 'openstack subnet create · openstack ip availability show · openstack network agent list', true),
('openstack subnet create', 'Cria uma sub-rede dentro de uma rede.', 'Network', 'neutron network subnet criar', 'openstack subnet create --network "minha-rede" --subnet-range "10.0.0.0/24" "minha-subrede"', '', '', false),
('openstack subnet set', 'Altera propriedades de uma sub-rede: gateway, DHCP, allocation pools, DNS.', 'Network', 'neutron network subnet advanced', '', '', '', false),
('openstack subnet delete', 'Apaga uma sub-rede.', 'Network', 'neutron network subnet', '', '', '', false),

('openstack port list', 'Lista as portas (interfaces virtuais) do projeto — cada NIC de VM, cada interface de router, tudo é uma port.', 'Network', 'neutron network port daily troubleshooting', 'openstack port list --server "meu-servidor"', '', 'openstack port show · openstack server show · openstack security group rule list', true),
('openstack port show', 'Mostra os detalhes de uma porta: IP/MAC atribuídos, estado, security groups e a que dispositivo pertence.', 'Network', 'neutron network port troubleshooting', '', 'Verificar: status · admin_state_up · fixed_ips · security_group_ids · device_owner', 'openstack port list · openstack server show · openstack subnet show · openstack security group rule list · openstack floating ip show', true),
('openstack port create', 'Cria uma porta (interface virtual) diretamente, sem passar por `server create`.', 'Network', 'neutron network port advanced', '', '', '', false),
('openstack port set', 'Altera propriedades de uma porta: security groups, estado administrativo.', 'Network', 'neutron network port advanced', 'openstack port set --security-group "meu-grupo" "id-da-porta"', '', 'openstack port show', false),
('openstack port delete', 'Apaga uma porta.', 'Network', 'neutron network port', '', '', '', false),

('openstack router list', 'Lista os routers do projeto.', 'Network', 'neutron network router daily', '', '', '', true),
('openstack router show', 'Mostra os detalhes de um router: estado, gateway externo e se está distribuído/HA.', 'Network', 'neutron network router troubleshooting', '', 'Verificar: status · admin_state_up · external_gateway_info', 'openstack router list · openstack router port list · openstack network agent list · openstack subnet show', true),
('openstack router create', 'Cria um router.', 'Network', 'neutron network router criar', 'openstack router create "meu-router"', '', '', false),
('openstack router set', 'Altera propriedades de um router, por exemplo o gateway externo.', 'Network', 'neutron network router', 'openstack router set --external-gateway "ext-net" "meu-router"', '', '', false),
('openstack router delete', 'Apaga um router.', 'Network', 'neutron network router', '', 'Falha se ainda tiver interfaces ligadas a sub-redes.', '', false),

('openstack router add subnet', 'Liga um router a uma sub-rede interna (cria a interface do router nessa sub-rede).', 'Network', 'neutron network router subnet daily', '', '', 'openstack router remove subnet · openstack router port list', false),
('openstack router remove subnet', 'Desliga um router de uma sub-rede.', 'Network', 'neutron network router subnet', '', '', 'openstack router add subnet', false),
('openstack router port list', 'Lista as portas (interfaces) de um router — uma por cada sub-rede a que está ligado, mais a do gateway externo.', 'Network', 'neutron network router port troubleshooting', '', '', 'openstack router show · openstack network agent list', true),

('openstack floating ip list', 'Lista os IPs flutuantes (públicos) do projeto e a que porta/instância cada um está associado.', 'Network', 'neutron network floating-ip daily', '', '', 'openstack floating ip show · openstack server add floating ip', true),
('openstack floating ip show', 'Mostra os detalhes de um IP flutuante: rede externa de origem, porta associada e router usado. Ponto de partida quando um floating IP "não funciona".', 'Network', 'neutron network floating-ip troubleshooting', '', 'Verificar: port_id · router_id · status · fixed_ip_address', 'openstack server show · openstack port show · openstack router show', true),
('openstack floating ip create', 'Cria (reserva) um IP flutuante numa rede externa.', 'Network', 'neutron network floating-ip', 'openstack floating ip create "ext-net"', '', '', false),
('openstack floating ip set', 'Associa/desassocia um IP flutuante a uma porta diretamente — alternativa a `server add/remove floating ip`.', 'Network', 'neutron network floating-ip advanced', '', '', '', false),
('openstack floating ip delete', 'Liberta um IP flutuante reservado.', 'Network', 'neutron network floating-ip', '', '', '', false),

('openstack network agent list', 'Lista os agentes Neutron (L3, DHCP, OVS/OVN, metadata) por host, com o estado (alive) e se estão em admin_state_up. Comando central para diagnosticar problemas de rede que não são da própria VM.', 'Network', 'neutron network agent admin troubleshooting daily', '', 'Requer permissões de admin. Verificar: alive · admin_state_up · agent_type · host', 'openstack router show · openstack subnet show · openstack compute service list', true),
('openstack network agent show', 'Mostra os detalhes e a configuração de um agente Neutron específico.', 'Network', 'neutron network agent admin advanced', '', '', 'openstack network agent list', false),
('openstack network agent set', 'Ativa/desativa um agente Neutron, ou atualiza a sua descrição.', 'Network', 'neutron network agent admin advanced', '', 'Requer permissões de admin.', 'openstack network agent list', false),

('openstack ip availability show', 'Mostra quantos IPs estão livres/usados numa sub-rede: total, usados e disponíveis.', 'Network', 'neutron network subnet ip troubleshooting', 'openstack ip availability show "minha-subrede"', '', 'openstack subnet show', false),

('openstack security group list', 'Lista os grupos de segurança (firewalls) do projeto.', 'Network', 'neutron network security-group daily', '', '', '', false),
('openstack security group show', 'Mostra os detalhes e as regras de um grupo de segurança.', 'Network', 'neutron network security-group', 'openstack security group show "meu-grupo"', '', 'openstack security group rule list', false),
('openstack security group create', 'Cria um grupo de segurança.', 'Network', 'neutron network security-group criar', 'openstack security group create "meu-grupo"', '', '', false),
('openstack security group set', 'Altera nome/descrição de um grupo de segurança.', 'Network', 'neutron network security-group advanced', '', '', '', false),
('openstack security group delete', 'Apaga um grupo de segurança.', 'Network', 'neutron network security-group', '', 'Falha se ainda estiver associado a alguma porta.', '', false),

('openstack security group rule list', 'Lista as regras de um grupo de segurança: protocolo, portas, direção (ingress/egress) e CIDR remoto. Comando principal quando suspeitas que uma firewall está a bloquear tráfego.', 'Network', 'neutron network security-group rule troubleshooting daily', 'openstack security group rule list "meu-grupo"', 'Verificar: protocol · port_range_min/max · direction · remote_ip_prefix', 'openstack security group show · openstack security group rule create · openstack port show', true),
('openstack security group rule create', 'Adiciona uma regra a um grupo de segurança.', 'Network', 'neutron network security-group rule', 'openstack security group rule create --proto tcp --dst-port 22 "meu-grupo"', '', 'openstack security group rule list', false),
('openstack security group rule delete', 'Remove uma regra de um grupo de segurança.', 'Network', 'neutron network security-group rule', 'openstack security group rule delete "id-da-regra"', '', 'openstack security group rule list', false),

-- ---------------------------------------------------------------------
-- Storage
-- ---------------------------------------------------------------------
('openstack volume list', 'Lista os volumes (discos) do projeto, com o estado (available, in-use, error, ...).', 'Storage', 'cinder storage volume daily', '', '', 'openstack volume show · openstack server volume list', true),
('openstack volume show', 'Mostra os detalhes de um volume: estado, tamanho, a que instância está anexado e o attachment point.', 'Storage', 'cinder storage volume troubleshooting', '', 'Verificar: status · attachments · size', 'openstack volume list · openstack server volume list · openstack volume extend', true),
('openstack volume create', 'Cria um volume (disco).', 'Storage', 'cinder storage volume criar', 'openstack volume create --size 10 "meu-volume"', '', '', false),
('openstack volume set', 'Altera propriedades de um volume: nome, estado, bootable.', 'Storage', 'cinder storage volume advanced', '', '', '', false),
('openstack volume delete', 'Apaga um volume.', 'Storage', 'cinder storage volume', '', 'Falha se ainda estiver anexado a uma instância.', '', false),
('openstack volume extend', 'Aumenta o tamanho de um volume existente.', 'Storage', 'cinder storage volume troubleshooting', 'openstack volume extend "meu-volume" 20', 'Só redimensiona o volume no Cinder — não redimensiona o filesystem dentro da VM, que continua a exigir um passo manual (ex: growpart + resize2fs/xfs_growfs).', 'openstack volume show', false),

('openstack volume snapshot list', 'Lista os snapshots de volumes do projeto.', 'Storage', 'cinder storage volume snapshot', '', '', '', false),
('openstack volume snapshot show', 'Mostra os detalhes de um snapshot: volume de origem, estado e tamanho.', 'Storage', 'cinder storage volume snapshot', '', '', '', false),
('openstack volume snapshot create', 'Cria um snapshot de um volume.', 'Storage', 'cinder storage volume snapshot backup', 'openstack volume snapshot create --volume "meu-volume" "meu-snapshot"', '', '', false),
('openstack volume snapshot set', 'Altera propriedades de um snapshot.', 'Storage', 'cinder storage volume snapshot advanced', '', '', '', false),
('openstack volume snapshot delete', 'Apaga um snapshot.', 'Storage', 'cinder storage volume snapshot', '', '', '', false),

-- ---------------------------------------------------------------------
-- Images
-- ---------------------------------------------------------------------
('openstack image list', 'Lista as imagens disponíveis para criar instâncias, com o estado (active, queued, ...).', 'Images', 'glance images imagem daily', '', '', '', true),
('openstack image show', 'Mostra os detalhes de uma imagem: formato de disco/container, tamanho, visibilidade e propriedades.', 'Images', 'glance images imagem troubleshooting', 'openstack image show "minha-imagem"', '', 'openstack image list', true),
('openstack image create', 'Regista uma nova imagem, a partir de ficheiro local ou de uma instância existente.', 'Images', 'glance images imagem criar', 'openstack image create --file "ubuntu.qcow2" --disk-format qcow2 "minha-imagem"', '', '', false),
('openstack image set', 'Altera propriedades de uma imagem: visibilidade, propriedades personalizadas.', 'Images', 'glance images imagem advanced', '', '', '', false),
('openstack image delete', 'Apaga uma imagem.', 'Images', 'glance images imagem', '', '', '', false),

-- ---------------------------------------------------------------------
-- Infrastructure
-- ---------------------------------------------------------------------
('openstack flavor list', 'Lista os flavors (tamanhos de VM: vCPU/RAM/disco) disponíveis.', 'Infrastructure', 'nova flavor infrastructure daily', '', '', '', false),
('openstack flavor show', 'Mostra os detalhes de um flavor: vCPUs, RAM, disco e propriedades extra.', 'Infrastructure', 'nova flavor infrastructure', 'openstack flavor show "m1.small"', '', '', false),
('openstack flavor create', 'Cria um novo flavor personalizado.', 'Infrastructure', 'nova flavor infrastructure admin', 'openstack flavor create --ram 4096 --disk 20 --vcpus 2 "m1.custom"', 'Criar/apagar flavors costuma exigir permissões de admin.', '', false),
('openstack flavor set', 'Altera propriedades extra (extra specs) de um flavor existente.', 'Infrastructure', 'nova flavor infrastructure advanced', '', '', '', false),
('openstack flavor delete', 'Apaga um flavor.', 'Infrastructure', 'nova flavor infrastructure admin', '', '', '', false),

('openstack keypair list', 'Lista os pares de chaves SSH registados para o utilizador atual.', 'Infrastructure', 'nova keypair ssh infrastructure daily', '', '', '', false),
('openstack keypair show', 'Mostra a chave pública de um par de chaves registado.', 'Infrastructure', 'nova keypair ssh infrastructure', 'openstack keypair show "minha-chave"', '', '', false),
('openstack keypair create', 'Cria um par de chaves SSH e regista a chave pública; a chave privada só é devolvida nesta chamada.', 'Infrastructure', 'nova keypair ssh infrastructure criar', 'openstack keypair create "minha-chave" > "minha-chave.pem"', '', '', false),
('openstack keypair delete', 'Apaga um par de chaves registado — não afeta instâncias já criadas com ele.', 'Infrastructure', 'nova keypair ssh infrastructure', '', '', '', false)

;

-- Comandos já existentes (mesma `command` + categoria 'OpenStack') recebem a
-- nova descrição/subcategoria/tags/exemplo/notas/relacionados. `favorite`
-- só é LIGADO por este script quando marcado acima — nunca desligado, para
-- não perder favoritos que já tenhas escolhido manualmente.
update commands c set
    description = s.description,
    subcategory = s.subcategory,
    tags = s.tags,
    example = coalesce(nullif(s.example, ''), c.example),
    notes = s.notes,
    related = s.related,
    favorite = c.favorite or s.favorite
from _os_seed s
where c.category = 'OpenStack' and c.command = s.command;

-- Comandos novos (sem linha correspondente ainda) são inseridos.
insert into commands (command, description, category, subcategory, tags, example, notes, related, favorite)
select s.command, s.description, 'OpenStack', s.subcategory, s.tags, s.example, s.notes, s.related, s.favorite
from _os_seed s
where not exists (
    select 1 from commands c where c.category = 'OpenStack' and c.command = s.command
);

commit;
