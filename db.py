"""Camada de dados: SQLite local com pesquisa full-text (FTS5).

Um único ficheiro `cabula.db`, sem servidor nem rede — pensado para viver ao
lado do executável e viajar com ele.
"""

import sqlite3
from datetime import datetime
from pathlib import Path

DB_FILE = Path(__file__).parent / "cabula.db"

CATEGORIES = ["Linux", "Kubernetes", "OpenStack"]


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
