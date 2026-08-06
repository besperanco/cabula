"""Camada de dados: SQLite local com pesquisa full-text (FTS5).

Um único ficheiro `cabula.db`, sem servidor nem rede — pensado para viver ao
lado do executável e viajar com ele.
"""

import sqlite3
import sys
from datetime import datetime
from pathlib import Path

# `__file__` aponta para a pasta temporaria de extracao do PyInstaller
# (--onefile), apagada ao fechar — usar a pasta do proprio .exe quando
# empacotado, para os dados sobreviverem entre execucoes.
_BASE_DIR = Path(sys.executable).parent if getattr(sys, "frozen", False) else Path(__file__).parent
DB_FILE = _BASE_DIR / "cabula.db"

CATEGORIES = ["Linux", "Kubernetes", "OpenStack"]
SCENARIO_CATEGORIES = CATEGORIES + ["Geral"]


def _normalize_category(category, existing_categories):
    """Reaproveita a capitalização de uma categoria já existente (ex:
    "boundary" -> "Boundary" se já existir assim), para o utilizador não
    criar sem querer duas categorias diferentes só por causa de maiúsculas.
    Categorias mesmo novas ficam tal e qual como o utilizador escreveu."""
    category = (category or "").strip()
    if not category:
        return category
    for existing in existing_categories:
        if existing.lower() == category.lower():
            return existing
    return category


def _connect():
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def _add_column_if_missing(conn, table, column, coldef):
    cols = [r[1] for r in conn.execute(f"PRAGMA table_info({table})").fetchall()]
    if column not in cols:
        conn.execute(f"ALTER TABLE {table} ADD COLUMN {column} {coldef}")


def _ensure_schema():
    with _connect() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS commands (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                command TEXT NOT NULL,
                description TEXT NOT NULL,
                category TEXT NOT NULL,
                tags TEXT NOT NULL DEFAULT '',
                example TEXT NOT NULL DEFAULT '',
                notes TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL
            )
            """
        )
        conn.execute(
            """
            CREATE VIRTUAL TABLE IF NOT EXISTS commands_fts USING fts5(
                command, description, tags, category,
                content='commands', content_rowid='id'
            )
            """
        )
        conn.execute(
            """
            CREATE TRIGGER IF NOT EXISTS commands_ai AFTER INSERT ON commands BEGIN
                INSERT INTO commands_fts(rowid, command, description, tags, category)
                VALUES (new.id, new.command, new.description, new.tags, new.category);
            END
            """
        )
        conn.execute(
            """
            CREATE TRIGGER IF NOT EXISTS commands_ad AFTER DELETE ON commands BEGIN
                INSERT INTO commands_fts(commands_fts, rowid, command, description, tags, category)
                VALUES ('delete', old.id, old.command, old.description, old.tags, old.category);
            END
            """
        )
        conn.execute(
            """
            CREATE TRIGGER IF NOT EXISTS commands_au AFTER UPDATE ON commands BEGIN
                INSERT INTO commands_fts(commands_fts, rowid, command, description, tags, category)
                VALUES ('delete', old.id, old.command, old.description, old.tags, old.category);
                INSERT INTO commands_fts(rowid, command, description, tags, category)
                VALUES (new.id, new.command, new.description, new.tags, new.category);
            END
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS scenarios (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                description TEXT NOT NULL DEFAULT '',
                category TEXT NOT NULL,
                created_at TEXT NOT NULL
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS scenario_steps (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                scenario_id INTEGER NOT NULL REFERENCES scenarios(id) ON DELETE CASCADE,
                position INTEGER NOT NULL,
                command TEXT NOT NULL DEFAULT '',
                note TEXT NOT NULL DEFAULT ''
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS recent_access (
                item_type TEXT NOT NULL,
                item_id INTEGER NOT NULL,
                accessed_at TEXT NOT NULL,
                PRIMARY KEY (item_type, item_id)
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS glossary (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                term TEXT NOT NULL,
                definition TEXT NOT NULL,
                category TEXT NOT NULL,
                created_at TEXT NOT NULL
            )
            """
        )
        _add_column_if_missing(conn, "commands", "favorite", "INTEGER NOT NULL DEFAULT 0")
        _add_column_if_missing(conn, "scenarios", "favorite", "INTEGER NOT NULL DEFAULT 0")


_ensure_schema()


def add_command(command, description, category, tags="", example="", notes=""):
    category = _normalize_category(category, list_command_categories())
    with _connect() as conn:
        cur = conn.execute(
            "INSERT INTO commands (command, description, category, tags, example, notes, created_at) "
            "VALUES (?, ?, ?, ?, ?, ?, ?)",
            (command, description, category, tags, example, notes, datetime.now().isoformat()),
        )
        return cur.lastrowid


def update_command(command_id, command, description, category, tags="", example="", notes=""):
    category = _normalize_category(category, list_command_categories())
    with _connect() as conn:
        conn.execute(
            "UPDATE commands SET command = ?, description = ?, category = ?, tags = ?, "
            "example = ?, notes = ? WHERE id = ?",
            (command, description, category, tags, example, notes, command_id),
        )


def delete_command(command_id):
    with _connect() as conn:
        conn.execute("DELETE FROM commands WHERE id = ?", (command_id,))
        conn.execute(
            "DELETE FROM recent_access WHERE item_type = 'command' AND item_id = ?", (command_id,)
        )


def get_command(command_id):
    with _connect() as conn:
        row = conn.execute("SELECT * FROM commands WHERE id = ?", (command_id,)).fetchone()
    return dict(row) if row else None


def list_commands(category=None):
    with _connect() as conn:
        if category:
            rows = conn.execute(
                "SELECT * FROM commands WHERE category = ? ORDER BY command", (category,)
            ).fetchall()
        else:
            rows = conn.execute("SELECT * FROM commands ORDER BY category, command").fetchall()
    return [dict(r) for r in rows]


def count_commands():
    with _connect() as conn:
        return conn.execute("SELECT COUNT(*) FROM commands").fetchone()[0]


def list_command_categories():
    """As categorias base (Linux/Kubernetes/OpenStack), pela ordem
    habitual, seguidas de quaisquer categorias novas que o utilizador
    tenha criado (ex: "Boundary"), por ordem alfabética."""
    with _connect() as conn:
        rows = conn.execute("SELECT DISTINCT category FROM commands").fetchall()
    existing = {r["category"] for r in rows if r["category"]}
    extra = sorted(existing - set(CATEGORIES))
    return CATEGORIES + extra


def command_category_counts():
    with _connect() as conn:
        rows = conn.execute("SELECT category, COUNT(*) AS n FROM commands GROUP BY category").fetchall()
    return {r["category"]: r["n"] for r in rows}


def rename_command_category(old_category, new_category):
    """Renomeia uma categoria em todos os comandos que a usam. Se
    `new_category` já existir (a menos de maiúsculas), os comandos passam a
    ficar juntos nessa categoria existente — funciona como "fundir"."""
    new_category = (new_category or "").strip()
    if not new_category or new_category == old_category:
        return 0
    others = [c for c in list_command_categories() if c != old_category]
    new_category = _normalize_category(new_category, others)
    with _connect() as conn:
        cur = conn.execute("UPDATE commands SET category = ? WHERE category = ?", (new_category, old_category))
        return cur.rowcount


def count_favorite_commands():
    with _connect() as conn:
        return conn.execute("SELECT COUNT(*) FROM commands WHERE favorite = 1").fetchone()[0]


def list_tags():
    """Todas as palavras-chave (tags) usadas em pelo menos um comando,
    por ordem alfabética."""
    with _connect() as conn:
        rows = conn.execute("SELECT tags FROM commands WHERE tags != ''").fetchall()
    tokens = set()
    for r in rows:
        tokens.update(r["tags"].split())
    return sorted(tokens)


def tag_counts():
    with _connect() as conn:
        rows = conn.execute("SELECT tags FROM commands WHERE tags != ''").fetchall()
    counts = {}
    for r in rows:
        for token in set(r["tags"].split()):
            counts[token] = counts.get(token, 0) + 1
    return counts


def rename_tag(old_tag, new_tag):
    """Renomeia uma tag em todos os comandos que a usam. Se `new_tag` já
    estiver presente num comando, a tag antiga é só removida (sem repetir).
    Ao contrário das categorias, uma tag pode coexistir com várias outras
    no mesmo comando, por isso a substituição é feita token a token."""
    old_tag = (old_tag or "").strip()
    new_tag = (new_tag or "").strip()
    if not old_tag or not new_tag or old_tag == new_tag:
        return 0
    with _connect() as conn:
        rows = conn.execute("SELECT id, tags FROM commands WHERE tags != ''").fetchall()
        changed = 0
        for r in rows:
            tokens = r["tags"].split()
            if old_tag not in tokens:
                continue
            new_tokens = []
            seen = set()
            for t in tokens:
                replacement = new_tag if t == old_tag else t
                if replacement not in seen:
                    new_tokens.append(replacement)
                    seen.add(replacement)
            conn.execute("UPDATE commands SET tags = ? WHERE id = ?", (" ".join(new_tokens), r["id"]))
            changed += 1
    return changed


def _build_fts_query(query):
    """Cada palavra vira um termo de prefixo entre aspas (ex: "pod"* ), para
    apanhar variações (pod/pods) e evitar que caracteres especiais do FTS5
    (-, :, etc.) partam a sintaxe da query."""
    tokens = query.strip().split()
    if not tokens:
        return None
    parts = []
    for t in tokens:
        escaped = t.replace('"', '""')
        parts.append(f'"{escaped}"*')
    return " ".join(parts)


def search_commands(query, category=None):
    """Pesquisa por texto livre no comando, descrição, tags e categoria.
    Sem query, devolve a lista completa (opcionalmente filtrada por
    categoria), ordenada alfabeticamente."""
    fts_query = _build_fts_query(query)
    if not fts_query:
        return list_commands(category)

    sql = (
        "SELECT c.* FROM commands c "
        "JOIN commands_fts f ON f.rowid = c.id "
        "WHERE commands_fts MATCH ?"
    )
    params = [fts_query]
    if category:
        sql += " AND c.category = ?"
        params.append(category)
    sql += " ORDER BY bm25(commands_fts)"

    with _connect() as conn:
        try:
            rows = conn.execute(sql, params).fetchall()
        except sqlite3.OperationalError:
            # query fts5 malformada (raro, dado o escaping acima) — recua
            # para uma pesquisa simples por substring
            return _fallback_search(query, category)
    return [dict(r) for r in rows]


def _fallback_search(query, category=None):
    like = f"%{query.strip()}%"
    sql = (
        "SELECT * FROM commands WHERE "
        "(command LIKE ? OR description LIKE ? OR tags LIKE ?)"
    )
    params = [like, like, like]
    if category:
        sql += " AND category = ?"
        params.append(category)
    sql += " ORDER BY command"
    with _connect() as conn:
        rows = conn.execute(sql, params).fetchall()
    return [dict(r) for r in rows]


def add_scenario(title, description, category):
    category = _normalize_category(category, list_scenario_categories())
    with _connect() as conn:
        cur = conn.execute(
            "INSERT INTO scenarios (title, description, category, created_at) VALUES (?, ?, ?, ?)",
            (title, description, category, datetime.now().isoformat()),
        )
        return cur.lastrowid


def update_scenario(scenario_id, title, description, category):
    category = _normalize_category(category, list_scenario_categories())
    with _connect() as conn:
        conn.execute(
            "UPDATE scenarios SET title = ?, description = ?, category = ? WHERE id = ?",
            (title, description, category, scenario_id),
        )


def delete_scenario(scenario_id):
    with _connect() as conn:
        conn.execute("DELETE FROM scenarios WHERE id = ?", (scenario_id,))
        conn.execute(
            "DELETE FROM recent_access WHERE item_type = 'scenario' AND item_id = ?", (scenario_id,)
        )


def replace_steps(scenario_id, steps):
    """`steps`: lista de tuplos (command, note), pela ordem em que devem
    aparecer. Substitui por completo os passos existentes do cenário."""
    with _connect() as conn:
        conn.execute("DELETE FROM scenario_steps WHERE scenario_id = ?", (scenario_id,))
        for position, (command, note) in enumerate(steps):
            conn.execute(
                "INSERT INTO scenario_steps (scenario_id, position, command, note) VALUES (?, ?, ?, ?)",
                (scenario_id, position, command, note),
            )


def get_scenario(scenario_id):
    with _connect() as conn:
        row = conn.execute("SELECT * FROM scenarios WHERE id = ?", (scenario_id,)).fetchone()
        if not row:
            return None
        steps = conn.execute(
            "SELECT * FROM scenario_steps WHERE scenario_id = ? ORDER BY position", (scenario_id,)
        ).fetchall()
    scenario = dict(row)
    scenario["steps"] = [dict(s) for s in steps]
    return scenario


def list_scenarios(category=None):
    sql = (
        "SELECT s.*, (SELECT COUNT(*) FROM scenario_steps st WHERE st.scenario_id = s.id) AS step_count "
        "FROM scenarios s"
    )
    params = []
    if category:
        sql += " WHERE s.category = ?"
        params.append(category)
    sql += " ORDER BY s.title"
    with _connect() as conn:
        rows = conn.execute(sql, params).fetchall()
    return [dict(r) for r in rows]


def count_scenarios():
    with _connect() as conn:
        return conn.execute("SELECT COUNT(*) FROM scenarios").fetchone()[0]


def list_scenario_categories():
    """As categorias base de cenário (Linux/Kubernetes/OpenStack/Geral),
    seguidas de quaisquer categorias novas que o utilizador tenha criado,
    por ordem alfabética."""
    with _connect() as conn:
        rows = conn.execute("SELECT DISTINCT category FROM scenarios").fetchall()
    existing = {r["category"] for r in rows if r["category"]}
    extra = sorted(existing - set(SCENARIO_CATEGORIES))
    return SCENARIO_CATEGORIES + extra


def scenario_category_counts():
    with _connect() as conn:
        rows = conn.execute("SELECT category, COUNT(*) AS n FROM scenarios GROUP BY category").fetchall()
    return {r["category"]: r["n"] for r in rows}


def rename_scenario_category(old_category, new_category):
    """Renomeia uma categoria em todos os cenários que a usam. Se
    `new_category` já existir (a menos de maiúsculas), os cenários passam a
    ficar juntos nessa categoria existente — funciona como "fundir"."""
    new_category = (new_category or "").strip()
    if not new_category or new_category == old_category:
        return 0
    others = [c for c in list_scenario_categories() if c != old_category]
    new_category = _normalize_category(new_category, others)
    with _connect() as conn:
        cur = conn.execute("UPDATE scenarios SET category = ? WHERE category = ?", (new_category, old_category))
        return cur.rowcount


def count_favorite_scenarios():
    with _connect() as conn:
        return conn.execute("SELECT COUNT(*) FROM scenarios WHERE favorite = 1").fetchone()[0]


def search_scenarios(query, category=None):
    """Pesquisa simples por título, descrição e passos. Sem query, devolve
    a lista completa (opcionalmente filtrada por categoria)."""
    query = (query or "").strip()
    if not query:
        return list_scenarios(category)

    like = f"%{query}%"
    sql = (
        "SELECT s.*, (SELECT COUNT(*) FROM scenario_steps st WHERE st.scenario_id = s.id) AS step_count "
        "FROM scenarios s WHERE (s.title LIKE ? OR s.description LIKE ? OR EXISTS ("
        "SELECT 1 FROM scenario_steps st WHERE st.scenario_id = s.id AND "
        "(st.command LIKE ? OR st.note LIKE ?)))"
    )
    params = [like, like, like, like]
    if category:
        sql += " AND s.category = ?"
        params.append(category)
    sql += " ORDER BY s.title"
    with _connect() as conn:
        rows = conn.execute(sql, params).fetchall()
    return [dict(r) for r in rows]


def toggle_command_favorite(command_id):
    with _connect() as conn:
        row = conn.execute("SELECT favorite FROM commands WHERE id = ?", (command_id,)).fetchone()
        new_value = 0 if row["favorite"] else 1
        conn.execute("UPDATE commands SET favorite = ? WHERE id = ?", (new_value, command_id))
    return bool(new_value)


def toggle_scenario_favorite(scenario_id):
    with _connect() as conn:
        row = conn.execute("SELECT favorite FROM scenarios WHERE id = ?", (scenario_id,)).fetchone()
        new_value = 0 if row["favorite"] else 1
        conn.execute("UPDATE scenarios SET favorite = ? WHERE id = ?", (new_value, scenario_id))
    return bool(new_value)


def list_favorite_commands(category=None):
    sql = "SELECT * FROM commands WHERE favorite = 1"
    params = []
    if category:
        sql += " AND category = ?"
        params.append(category)
    sql += " ORDER BY command"
    with _connect() as conn:
        rows = conn.execute(sql, params).fetchall()
    return [dict(r) for r in rows]


def list_favorite_scenarios(category=None):
    sql = (
        "SELECT s.*, (SELECT COUNT(*) FROM scenario_steps st WHERE st.scenario_id = s.id) AS step_count "
        "FROM scenarios s WHERE s.favorite = 1"
    )
    params = []
    if category:
        sql += " AND s.category = ?"
        params.append(category)
    sql += " ORDER BY s.title"
    with _connect() as conn:
        rows = conn.execute(sql, params).fetchall()
    return [dict(r) for r in rows]


def mark_recent(item_type, item_id):
    with _connect() as conn:
        conn.execute(
            "INSERT INTO recent_access (item_type, item_id, accessed_at) VALUES (?, ?, ?) "
            "ON CONFLICT(item_type, item_id) DO UPDATE SET accessed_at = excluded.accessed_at",
            (item_type, item_id, datetime.now().isoformat()),
        )


def list_recent(limit=8, category=None):
    """Devolve os itens (comandos e cenários) acedidos mais recentemente, já
    com os dados completos, como tuplos (item_type, dict), mais recentes
    primeiro. Ignora silenciosamente entradas cujo item já foi apagado.

    Com `category`, percorre mais histórico do que `limit` antes de filtrar,
    para conseguir preencher `limit` resultados dessa categoria mesmo que
    haja itens de outras categorias mais recentes pelo meio."""
    fetch_limit = max(limit * 4, 30) if category else limit
    with _connect() as conn:
        rows = conn.execute(
            "SELECT item_type, item_id FROM recent_access ORDER BY accessed_at DESC LIMIT ?", (fetch_limit,)
        ).fetchall()
        items = []
        for r in rows:
            if len(items) >= limit:
                break
            if r["item_type"] == "command":
                cmd_row = conn.execute("SELECT * FROM commands WHERE id = ?", (r["item_id"],)).fetchone()
                if cmd_row and (not category or cmd_row["category"] == category):
                    items.append(("command", dict(cmd_row)))
            else:
                sc_row = conn.execute("SELECT * FROM scenarios WHERE id = ?", (r["item_id"],)).fetchone()
                if sc_row and (not category or sc_row["category"] == category):
                    step_count = conn.execute(
                        "SELECT COUNT(*) FROM scenario_steps WHERE scenario_id = ?", (r["item_id"],)
                    ).fetchone()[0]
                    d = dict(sc_row)
                    d["step_count"] = step_count
                    items.append(("scenario", d))
    return items


def add_term(term, definition, category):
    with _connect() as conn:
        cur = conn.execute(
            "INSERT INTO glossary (term, definition, category, created_at) VALUES (?, ?, ?, ?)",
            (term, definition, category, datetime.now().isoformat()),
        )
        return cur.lastrowid


def update_term(term_id, term, definition, category):
    with _connect() as conn:
        conn.execute(
            "UPDATE glossary SET term = ?, definition = ?, category = ? WHERE id = ?",
            (term, definition, category, term_id),
        )


def delete_term(term_id):
    with _connect() as conn:
        conn.execute("DELETE FROM glossary WHERE id = ?", (term_id,))


def get_term(term_id):
    with _connect() as conn:
        row = conn.execute("SELECT * FROM glossary WHERE id = ?", (term_id,)).fetchone()
    return dict(row) if row else None


def list_terms(category=None):
    with _connect() as conn:
        if category:
            rows = conn.execute(
                "SELECT * FROM glossary WHERE category = ? ORDER BY term", (category,)
            ).fetchall()
        else:
            rows = conn.execute("SELECT * FROM glossary ORDER BY term").fetchall()
    return [dict(r) for r in rows]


def count_terms():
    with _connect() as conn:
        return conn.execute("SELECT COUNT(*) FROM glossary").fetchone()[0]


def search_terms(query, category=None):
    """Pesquisa simples por termo e definição. Sem query, devolve a lista
    completa (opcionalmente filtrada por categoria)."""
    query = (query or "").strip()
    if not query:
        return list_terms(category)

    like = f"%{query}%"
    sql = "SELECT * FROM glossary WHERE (term LIKE ? OR definition LIKE ?)"
    params = [like, like]
    if category:
        sql += " AND category = ?"
        params.append(category)
    sql += " ORDER BY term"
    with _connect() as conn:
        rows = conn.execute(sql, params).fetchall()
    return [dict(r) for r in rows]


def export_data():
    """Devolve um dict com todo o conteúdo (comandos, cenários com passos e
    glossário), pronto a serializar em JSON — para backup ou para levar para
    outra máquina."""
    return {
        "version": 1,
        "exported_at": datetime.now().isoformat(),
        "commands": [
            {
                "command": c["command"], "description": c["description"], "category": c["category"],
                "tags": c["tags"], "example": c["example"], "notes": c["notes"], "favorite": bool(c["favorite"]),
            }
            for c in list_commands()
        ],
        "scenarios": [
            {
                "title": s["title"], "description": s["description"], "category": s["category"],
                "favorite": bool(s["favorite"]),
                "steps": [{"command": st["command"], "note": st["note"]} for st in get_scenario(s["id"])["steps"]],
            }
            for s in list_scenarios()
        ],
        "glossary": [
            {"term": t["term"], "definition": t["definition"], "category": t["category"]}
            for t in list_terms()
        ],
    }


def import_data(data, replace=False):
    """Importa comandos, cenários e termos do glossário a partir de um dict
    no formato de `export_data`. Com `replace=True`, apaga primeiro tudo o
    que já existe; caso contrário, adiciona o conteúdo do ficheiro ao que já
    lá está. Devolve um dict com as contagens efetivamente importadas."""
    if replace:
        with _connect() as conn:
            conn.execute("DELETE FROM scenario_steps")
            conn.execute("DELETE FROM scenarios")
            conn.execute("DELETE FROM commands")
            conn.execute("DELETE FROM glossary")
            conn.execute("DELETE FROM recent_access")

    counts = {"commands": 0, "scenarios": 0, "glossary": 0}

    for c in data.get("commands", []) or []:
        command = (c.get("command") or "").strip()
        description = (c.get("description") or "").strip()
        if not command or not description:
            continue
        cmd_id = add_command(
            command, description, c.get("category") or CATEGORIES[0],
            (c.get("tags") or "").strip(), (c.get("example") or "").strip(), (c.get("notes") or "").strip(),
        )
        if c.get("favorite"):
            toggle_command_favorite(cmd_id)
        counts["commands"] += 1

    for s in data.get("scenarios", []) or []:
        title = (s.get("title") or "").strip()
        if not title:
            continue
        scenario_id = add_scenario(
            title, (s.get("description") or "").strip(), s.get("category") or SCENARIO_CATEGORIES[0]
        )
        steps = [
            ((st.get("command") or "").strip(), (st.get("note") or "").strip())
            for st in s.get("steps", []) or []
            if (st.get("command") or "").strip() or (st.get("note") or "").strip()
        ]
        replace_steps(scenario_id, steps)
        if s.get("favorite"):
            toggle_scenario_favorite(scenario_id)
        counts["scenarios"] += 1

    for t in data.get("glossary", []) or []:
        term = (t.get("term") or "").strip()
        definition = (t.get("definition") or "").strip()
        if not term or not definition:
            continue
        add_term(term, definition, t.get("category") or SCENARIO_CATEGORIES[0])
        counts["glossary"] += 1

    return counts
