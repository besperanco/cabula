-- Adiciona subcategorias aos comandos (2º nivel na arvore do sidebar:
-- Kubernetes > Pods, Deployments, Services, ...). Corre isto uma vez no SQL
-- Editor do Supabase, depois do schema.sql inicial ja estar aplicado.

alter table commands add column if not exists subcategory text not null default '';

-- as funcoes de escrita passam a aceitar subcategoria (parametro opcional,
-- por isso comandos existentes que chamem a funcao sem o novo argumento
-- continuam a funcionar)

create or replace function add_command(
    pin text, p_command text, p_description text, p_category text,
    p_tags text default '', p_example text default '', p_notes text default '',
    p_subcategory text default ''
) returns commands language plpgsql security definer as $$
declare
    result commands;
begin
    perform _check_pin(pin);
    insert into commands (command, description, category, tags, example, notes, subcategory)
    values (p_command, p_description, p_category, p_tags, p_example, p_notes, p_subcategory)
    returning * into result;
    return result;
end;
$$;

create or replace function update_command(
    pin text, p_id bigint, p_command text, p_description text, p_category text,
    p_tags text default '', p_example text default '', p_notes text default '',
    p_subcategory text default ''
) returns commands language plpgsql security definer as $$
declare
    result commands;
begin
    perform _check_pin(pin);
    update commands set command = p_command, description = p_description, category = p_category,
        tags = p_tags, example = p_example, notes = p_notes, subcategory = p_subcategory
    where id = p_id
    returning * into result;
    return result;
end;
$$;

-- ---------------------------------------------------------------------
-- Classificacao automatica dos comandos existentes (melhor esforco, a
-- partir do texto do comando). Podes ajustar manualmente depois na app.
-- ---------------------------------------------------------------------

-- Kubernetes
update commands set subcategory = 'Helm' where category = 'Kubernetes' and command in
    ('helm install', 'helm list', 'helm uninstall', 'helm upgrade');
update commands set subcategory = 'kubectl' where category = 'Kubernetes' and command in
    ('kubectl config get-contexts', 'kubectl config use-context', 'kubectl apply -f', 'kubectl create',
     'kubectl delete', 'kubectl edit', 'kubectl label', 'kubectl annotate', 'kubectl explain');
update commands set subcategory = 'Pods' where category = 'Kubernetes' and command in
    ('kubectl get pods', 'kubectl get pods -A', 'kubectl exec -it', 'kubectl cp', 'kubectl port-forward');
update commands set subcategory = 'Deployments' where category = 'Kubernetes' and command in
    ('kubectl get deployments', 'kubectl rollout restart', 'kubectl rollout status', 'kubectl rollout undo', 'kubectl scale');
update commands set subcategory = 'Services' where category = 'Kubernetes' and command in ('kubectl get svc');
update commands set subcategory = 'Namespaces' where category = 'Kubernetes' and command in
    ('kubectl get namespaces', 'kubectl get all');
update commands set subcategory = 'Nodes' where category = 'Kubernetes' and command in
    ('kubectl get nodes', 'kubectl top nodes', 'kubectl cordon', 'kubectl drain', 'kubectl uncordon');
update commands set subcategory = 'Troubleshooting' where category = 'Kubernetes' and command in
    ('kubectl describe pod', 'kubectl logs', 'kubectl logs --previous', 'kubectl get events --sort-by=.lastTimestamp', 'kubectl top pods');

-- Linux
update commands set subcategory = 'Ficheiros' where category = 'Linux' and command in
    ('cd', 'ls -la', 'pwd', 'mkdir -p', 'mv', 'cp -r', 'rm -rf', 'find', 'less', 'grep -r');
update commands set subcategory = 'Processos' where category = 'Linux' and command in
    ('ps aux', 'top', 'htop', 'kill -9', 'uptime');
update commands set subcategory = 'Rede' where category = 'Linux' and command in
    ('ping', 'curl -I', 'dig', 'ip addr', 'ss -tulnp', 'ssh', 'scp', 'rsync -avz');
update commands set subcategory = 'Discos' where category = 'Linux' and command in
    ('df -h', 'du -sh', 'lsblk', 'mount');
update commands set subcategory = 'Serviços' where category = 'Linux' and command in
    ('systemctl enable', 'systemctl restart', 'systemctl status', 'journalctl -u');
update commands set subcategory = 'Permissões' where category = 'Linux' and command in
    ('chmod', 'chown', 'sudo -l');
update commands set subcategory = 'Pacotes' where category = 'Linux' and command in
    ('apt update && apt install');
update commands set subcategory = 'Compressão' where category = 'Linux' and command in
    ('tar -czvf', 'tar -xzvf');
update commands set subcategory = 'Agendamento' where category = 'Linux' and command in ('crontab -e');

-- OpenStack
update commands set subcategory = 'Instâncias' where category = 'OpenStack' and command in
    ('openstack server create', 'openstack server delete', 'openstack server list', 'openstack server reboot',
     'openstack server show', 'openstack server start', 'openstack server stop',
     'openstack server add volume', 'openstack server resize');
update commands set subcategory = 'Rede' where category = 'OpenStack' and command in
    ('openstack network create', 'openstack network list', 'openstack subnet create', 'openstack router create',
     'openstack router set --external-gateway',
     'openstack security group create', 'openstack security group rule create',
     'openstack security group list', 'openstack security group rule list');
-- "Rede/Floating" e um 2º nivel dentro de "Rede" (subcategoria no formato
-- "Pai/Filho") — agrupa tudo o que e sobre IPs flutuantes.
update commands set subcategory = 'Rede/Floating' where category = 'OpenStack' and command in
    ('openstack floating ip create', 'openstack floating ip list', 'openstack server add floating ip');
update commands set subcategory = 'Storage' where category = 'OpenStack' and command in
    ('openstack volume create', 'openstack volume list');
update commands set subcategory = 'Identidade' where category = 'OpenStack' and command in
    ('openstack project create', 'openstack project list', 'openstack user list', 'openstack token issue', 'source openrc.sh');
update commands set subcategory = 'Imagens' where category = 'OpenStack' and command in
    ('openstack image create', 'openstack image list', 'openstack image show', 'openstack image delete',
     'openstack flavor list', 'openstack flavor create', 'openstack flavor show', 'openstack flavor delete',
     'openstack keypair create');
update commands set subcategory = 'Orquestração' where category = 'OpenStack' and command in ('openstack stack list');
