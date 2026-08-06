"""Camada de dados: SQLite local com pesquisa full-text (FTS5).

Um único ficheiro `cabula.db`, sem servidor nem rede — pensado para viver ao
lado do executável e viajar com ele.
"""

import sqlite3
from datetime import datetime
from pathlib import Path

DB_FILE = Path(__file__).parent / "cabula.db"

CATEGORIES = ["Linux", "Kubernetes", "OpenStack"]
SCENARIO_CATEGORIES = CATEGORIES + ["Geral"]


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
    with _connect() as conn:
        cur = conn.execute(
            "INSERT INTO commands (command, description, category, tags, example, notes, created_at) "
            "VALUES (?, ?, ?, ?, ?, ?, ?)",
            (command, description, category, tags, example, notes, datetime.now().isoformat()),
        )
        return cur.lastrowid


def update_command(command_id, command, description, category, tags="", example="", notes=""):
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
    with _connect() as conn:
        cur = conn.execute(
            "INSERT INTO scenarios (title, description, category, created_at) VALUES (?, ?, ?, ?)",
            (title, description, category, datetime.now().isoformat()),
        )
        return cur.lastrowid


def update_scenario(scenario_id, title, description, category):
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


def list_favorite_commands():
    with _connect() as conn:
        rows = conn.execute("SELECT * FROM commands WHERE favorite = 1 ORDER BY command").fetchall()
    return [dict(r) for r in rows]


def list_favorite_scenarios():
    sql = (
        "SELECT s.*, (SELECT COUNT(*) FROM scenario_steps st WHERE st.scenario_id = s.id) AS step_count "
        "FROM scenarios s WHERE s.favorite = 1 ORDER BY s.title"
    )
    with _connect() as conn:
        rows = conn.execute(sql).fetchall()
    return [dict(r) for r in rows]


def mark_recent(item_type, item_id):
    with _connect() as conn:
        conn.execute(
            "INSERT INTO recent_access (item_type, item_id, accessed_at) VALUES (?, ?, ?) "
            "ON CONFLICT(item_type, item_id) DO UPDATE SET accessed_at = excluded.accessed_at",
            (item_type, item_id, datetime.now().isoformat()),
        )


def list_recent(limit=8):
    """Devolve os itens (comandos e cenários) acedidos mais recentemente, já
    com os dados completos, como tuplos (item_type, dict), mais recentes
    primeiro. Ignora silenciosamente entradas cujo item já foi apagado."""
    with _connect() as conn:
        rows = conn.execute(
            "SELECT item_type, item_id FROM recent_access ORDER BY accessed_at DESC LIMIT ?", (limit,)
        ).fetchall()
        items = []
        for r in rows:
            if r["item_type"] == "command":
                cmd_row = conn.execute("SELECT * FROM commands WHERE id = ?", (r["item_id"],)).fetchone()
                if cmd_row:
                    items.append(("command", dict(cmd_row)))
            else:
                sc_row = conn.execute("SELECT * FROM scenarios WHERE id = ?", (r["item_id"],)).fetchone()
                if sc_row:
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
