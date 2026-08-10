"""Envia so os comandos novos das areas Nova e Neutron (seed_data.py) para o
Supabase — nao volta a inserir o que ja tenha sido migrado antes (evita
duplicar Linux/Kubernetes/OpenStack/etc.). Corre-se uma vez, localmente, a
partir da raiz do projeto:

    SUPABASE_URL=https://vikbhiqfgqjhghvwuchb.supabase.co \
    SUPABASE_SERVICE_KEY=... \
    python web/migrate_nova_neutron.py

A SUPABASE_SERVICE_KEY (nao a anon key) so existe em Project Settings > API
> service_role — tem acesso total e bypassa RLS, por isso nunca vai para o
site estatico nem para o repo; usa-se so aqui, localmente, uma vez.
"""

import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from supabase import create_client  # requires: pip install supabase

from seed_data import NEUTRON, NOVA


def main():
    url = os.environ["SUPABASE_URL"]
    key = os.environ["SUPABASE_SERVICE_KEY"]
    client = create_client(url, key)

    for entries, category in ((NOVA, "Nova"), (NEUTRON, "Neutron")):
        existing = {
            row["command"]
            for row in client.table("commands").select("command").eq("category", category).execute().data
        }
        inserted = 0
        for command, description, tags, example in entries:
            if command in existing:
                continue
            client.table("commands").insert(
                {
                    "command": command, "description": description, "category": category,
                    "tags": tags, "example": example, "notes": "", "subcategory": "",
                }
            ).execute()
            inserted += 1
        print(f"{category}: inserido(s) {inserted} de {len(entries)}")

    print("Concluido.")


if __name__ == "__main__":
    main()
