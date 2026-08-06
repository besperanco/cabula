"""Glossário de conceitos pré-carregado — para quando o bloqueio é
vocabulário, não sintaxe de comandos.

`seed()` só insere se a tabela do glossário estiver vazia — nunca apaga nem
duplica termos que o utilizador já tenha criado ou editado.
"""

import db

TERMS = [
    ("Pod", "A mais pequena unidade que se pode implantar no Kubernetes: um ou mais "
     "contentores que partilham rede e armazenamento e correm sempre juntos.", "Kubernetes"),
    ("Deployment", "Descreve o estado desejado de uma aplicação (quantas réplicas, que "
     "imagem) e garante que o Kubernetes o mantém, substituindo pods que falhem.", "Kubernetes"),
    ("Service", "Dá um endereço de rede estável a um conjunto de pods, mesmo que eles "
     "sejam substituídos ou movidos entre nós.", "Kubernetes"),
    ("Namespace", "Uma forma de dividir um cluster em espaços isolados (ex: por equipa "
     "ou ambiente), para organizar recursos e limitar permissões.", "Kubernetes"),
    ("ReplicaSet", "Garante que um número fixo de réplicas de um pod está sempre a "
     "correr; normalmente gerido automaticamente por um Deployment.", "Kubernetes"),
    ("Node (Kubernetes)", "Uma máquina (física ou virtual) do cluster onde os pods "
     "realmente correm.", "Kubernetes"),
    ("Cluster", "O conjunto de nós geridos em conjunto por um plano de controlo central "
     "(ex: Kubernetes).", "Kubernetes"),
    ("ConfigMap", "Guarda configuração não-sensível (variáveis, ficheiros) que pode ser "
     "injetada nos pods, sem estar embutida na imagem.", "Kubernetes"),
    ("Secret", "Como um ConfigMap, mas para dados sensíveis: passwords, tokens, "
     "certificados.", "Kubernetes"),
    ("Ingress", "Define regras para expor serviços HTTP/HTTPS do cluster para fora, com "
     "routing por domínio ou caminho.", "Kubernetes"),
    ("PVC (Persistent Volume Claim)", "Um pedido de armazenamento persistente feito por "
     "um pod, independente do ciclo de vida do próprio pod.", "Kubernetes"),
    ("Helm Chart", "Um pacote de manifestos Kubernetes, parametrizáveis, que instala uma "
     "aplicação inteira com um único comando.", "Kubernetes"),
    ("Project (Tenant)", "O espaço isolado onde os teus recursos (VMs, redes, volumes) "
     "vivem; tudo o que crias na OpenStack fica associado a um projeto.", "OpenStack"),
    ("Flavor", "Um tamanho pré-definido de instância: quantos vCPUs, RAM e disco tem.", "OpenStack"),
    ("Image (OpenStack)", "Um molde de sistema operativo (ex: Ubuntu) usado para criar "
     "novas instâncias.", "OpenStack"),
    ("Instance", "Uma máquina virtual criada a partir de uma imagem e um flavor — o "
     "equivalente OpenStack a uma VM.", "OpenStack"),
    ("Floating IP", "Um IP público que podes associar ou desassociar de instâncias, para "
     "lhes dar acesso a partir de fora da rede privada.", "OpenStack"),
    ("Security Group", "Um conjunto de regras de firewall que controla que tráfego de "
     "rede entra e sai das instâncias associadas.", "OpenStack"),
    ("Keypair", "Um par de chaves SSH (pública/privada) registado na OpenStack, usado "
     "para aceder às instâncias sem password.", "OpenStack"),
    ("Volume (OpenStack)", "Um disco virtual persistente que podes associar a uma "
     "instância, independente do ciclo de vida dela.", "OpenStack"),
    ("Router", "Liga redes privadas entre si ou a uma rede externa, permitindo tráfego "
     "entre elas.", "OpenStack"),
    ("Daemon", "Um processo que corre em segundo plano, sem interação direta do "
     "utilizador (ex: sshd, nginx).", "Linux"),
    ("systemd unit", "A definição de um serviço, temporizador ou recurso gerido pelo "
     "systemd — o que controlas com systemctl.", "Linux"),
    ("File descriptor", "Uma referência numérica que um processo usa para aceder a um "
     "ficheiro, socket ou pipe aberto.", "Linux"),
    ("Mount point", "A diretoria onde um sistema de ficheiros (disco, partição) fica "
     "acessível depois de montado.", "Linux"),
    ("Cron job", "Uma tarefa agendada para correr automaticamente em horários definidos, "
     "via crontab.", "Linux"),
    ("IaaS", "Infrastructure as a Service — o fornecedor dá-te infraestrutura base (VMs, "
     "rede, storage) e tu geres o resto (SO, aplicações).", "Geral"),
    ("Orquestração", "Automatizar a criação, gestão e coordenação de recursos "
     "(containers, VMs) em vez de os operar manualmente um a um.", "Geral"),
    ("Alta disponibilidade", "Desenhar um sistema para continuar a funcionar mesmo que "
     "um componente individual falhe.", "Geral"),
]


def seed():
    if db.count_terms() > 0:
        return 0

    for term, definition, category in TERMS:
        db.add_term(term, definition, category)
    return len(TERMS)
