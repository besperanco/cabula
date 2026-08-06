"""Cenários (playbooks) pré-carregados: sequências de comandos para
situações reais, com uma nota por passo a explicar o porquê de cada um.

`seed()` só insere se a tabela de cenários estiver vazia — nunca apaga nem
duplica cenários que o utilizador já tenha criado ou editado.
"""

import db

SCENARIOS = [
    (
        "Diagnosticar um pod que não arranca",
        "Sequência para perceber porque é que um pod está em Pending, "
        "CrashLoopBackOff ou ImagePullBackOff.",
        "Kubernetes",
        [
            ('kubectl get pods -n "default"', "Confirma o estado atual do pod."),
            ('kubectl describe pod "meu-pod"',
             "Vê os eventos recentes: falta de recursos, erro a puxar a imagem, etc."),
            ('kubectl logs "meu-pod" -f', "Vê os logs do contentor a correr."),
            ('kubectl logs "meu-pod" --previous',
             "Se já reiniciou, vê os logs da tentativa anterior, antes do crash."),
            ("kubectl get events --sort-by=.lastTimestamp",
             "Eventos recentes do cluster, para contexto adicional (ex: nó sem recursos)."),
        ],
    ),
    (
        "Preparar um nó para manutenção",
        "Sequência segura para tirar um nó de produção sem perder "
        "disponibilidade da aplicação.",
        "Kubernetes",
        [
            ("kubectl get nodes", "Confirma o nome exato e o estado do nó antes de mexer."),
            ('kubectl cordon "meu-no"', "Marca o nó como não-agendável, para não receber novos pods."),
            ('kubectl drain "meu-no" --ignore-daemonsets',
             "Move os pods existentes para outros nós, com segurança."),
            ("", "Faz a manutenção/atualização necessária na máquina."),
            ('kubectl uncordon "meu-no"', "Volta a permitir que o nó receba pods."),
        ],
    ),
    (
        "Criar uma VM do zero",
        "Sequência completa para criar uma instância na OpenStack, do "
        "levantamento de recursos disponíveis até ao acesso por SSH.",
        "OpenStack",
        [
            ("openstack image list", "Confirma o nome exato da imagem que vais usar."),
            ("openstack flavor list", "Escolhe o tamanho (CPU/RAM/disco) da instância."),
            ("openstack network list", "Confirma a rede onde a instância vai ficar."),
            ('openstack keypair create "minha-chave" > "minha-chave.pem"',
             "Cria um par de chaves SSH, se ainda não tiveres uma."),
            ('openstack security group create "meu-grupo"',
             "Cria um grupo de segurança para controlar o acesso."),
            ('openstack security group rule create --proto tcp --dst-port 22 "meu-grupo"',
             "Permite tráfego SSH (porta 22) no grupo de segurança."),
            ('openstack server create --image "ubuntu" --flavor "m1.small" --network "priv" "meu-servidor"',
             "Cria a instância com a imagem, o tamanho e a rede escolhidos."),
            ('openstack floating ip create "ext-net"', "Cria um IP público para aceder à instância."),
            ('openstack server add floating ip "meu-servidor" "203.0.113.10"',
             "Associa o IP público à instância."),
        ],
    ),
    (
        "Instância sem acesso por SSH",
        "Sequência de diagnóstico quando não consegues aceder por SSH a "
        "uma instância recém-criada.",
        "OpenStack",
        [
            ('openstack server show "meu-servidor"', "Confirma o estado da instância e o IP atribuído."),
            ("openstack floating ip list", "Confirma se a instância tem mesmo um IP público associado."),
            ('openstack security group rule create --proto tcp --dst-port 22 "meu-grupo"',
             "Confirma/cria a regra que permite tráfego SSH no grupo de segurança da instância."),
            ('ping -c 4 "203.0.113.10"', "Testa conectividade básica ao IP."),
            ('ssh "utilizador@host"',
             "Se o ping funcionar mas o SSH falhar, o problema é normalmente a regra de "
             "segurança ou a chave usada."),
        ],
    ),
    (
        "Serviço não arranca",
        "Sequência para diagnosticar um serviço systemd que falha ao "
        "arrancar ou cai pouco depois.",
        "Linux",
        [
            ('systemctl status "nginx"', "Vê o estado atual e a última linha de erro reportada."),
            ('journalctl -u "nginx" -f', "Vê o log completo do serviço, com o motivo real da falha."),
            ('systemctl restart "nginx"', "Tenta reiniciar depois de perceber/corrigir a causa."),
            ('systemctl status "nginx"', "Confirma se o serviço ficou mesmo ativo (running)."),
        ],
    ),
    (
        "Disco cheio",
        "Sequência para encontrar o que está a ocupar espaço em disco e "
        "libertar espaço com segurança.",
        "Linux",
        [
            ("df -h", "Confirma qual partição está cheia."),
            ("du -sh /var/log", "Verifica o tamanho de diretorias suspeitas, uma a uma."),
            ('find / -name "*.log" -mtime -1',
             "Adapta para encontrar ficheiros grandes/antigos a apagar (ex: -size +100M)."),
            ('tar -czvf "backup.tar.gz" "/pasta"', "Arquiva o que precisares de guardar antes de apagar."),
            ('rm -rf "/tmp/teste"', "Remove o que já não precisas, com cuidado."),
        ],
    ),
    (
        "Sem acesso a um serviço remoto",
        "Sequência genérica para perceber se um problema de acesso é de "
        "DNS, de rede, ou do próprio serviço.",
        "Geral",
        [
            ('ping -c 4 "8.8.8.8"', "Testa conectividade básica à internet, sem depender de DNS."),
            ('dig "exemplo.com"', "Testa se a resolução de nomes (DNS) está a funcionar."),
            ('curl -I "https://exemplo.com"', "Testa se o serviço responde a pedidos HTTP."),
            ('ss -tulnp | grep "443"',
             "Do lado do servidor, confirma se o serviço está mesmo em escuta na porta esperada."),
        ],
    ),
]


def seed():
    if db.count_scenarios() > 0:
        return 0

    inserted = 0
    for title, description, category, steps in SCENARIOS:
        scenario_id = db.add_scenario(title, description, category)
        db.replace_steps(scenario_id, steps)
        inserted += 1
    return inserted
