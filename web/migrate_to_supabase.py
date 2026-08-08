"""Copia o conteudo do cabula.db local (via db.export_data()) para o
Supabase. Corre-se uma vez, localmente, a partir da raiz do projeto:

    SUPABASE_URL=https://vikbhiqfgqjhghvwuchb.supabase.co \
    SUPABASE_SERVICE_KEY=... \
    python web/migrate_to_supabase.py

A SUPABASE_SERVICE_KEY (nao a anon key) so existe em Project Settings > API
> service_role — tem acesso total e bypassa RLS, por isso nunca vai para o
site estatico nem para o repo; usa-se so aqui, localmente, uma vez.
"""

import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from supabase import create_client  # requires: pip install supabase

import db


def main():
    url = os.environ["SUPABASE_URL"]
    key = os.environ["SUPABASE_SERVICE_KEY"]
    client = create_client(url, key)

    data = db.export_data()

    print(f"A migrar {len(data['commands'])} comandos...")
    for c in data["commands"]:
        client.table("commands").insert(c).execute()

    print(f"A migrar {len(data['scenarios'])} cenarios...")
    for s in data["scenarios"]:
        steps = s.pop("steps")
        result = client.table("scenarios").insert(s).execute()
        scenario_id = result.data[0]["id"]
        for pos, step in enumerate(steps):
            client.table("scenario_steps").insert(
                {"scenario_id": scenario_id, "position": pos, **step}
            ).execute()

    print(f"A migrar {len(data['glossary'])} termos do glossario...")
    for t in data["glossary"]:
        client.table("glossary").insert(t).execute()

    print("Concluido.")


if __name__ == "__main__":
    main()
