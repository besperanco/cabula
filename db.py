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
