"""Cábula — motor de pesquisa local de comandos Linux/Kubernetes/OpenStack.

Aplicação NiceGUI totalmente local e portável: SQLite (cabula.db, ao lado
deste ficheiro/executável) com pesquisa full-text, sem rede nem servidor.
"""

import secrets
import sys
from pathlib import Path

from nicegui import app, context, ui

import db
import seed_data
import seed_scenarios

seed_data.seed()
seed_scenarios.seed()

CATEGORY_ICONS = {
    "Linux": "terminal",
    "Kubernetes": "hub",
    "OpenStack": "cloud",
    "Geral": "explore",
}

# mesma paleta de marca e mesmo mecanismo de tema (persistido por browser)
# do Monitor de ETFs.
BRAND_PRIMARY = "#2a78d6"
BRAND_SECONDARY = "#52514e"
BRAND_ACCENT = "#1baf7a"
BRAND_POSITIVE = "#0ca30c"
BRAND_NEGATIVE = "#d03b3b"
BRAND_WARNING = "#c98500"

STORAGE_SECRET_FILE = Path(__file__).parent / ".storage_secret"


def _get_storage_secret():
    if STORAGE_SECRET_FILE.exists():
        return STORAGE_SECRET_FILE.read_text().strip()
    secret = secrets.token_hex(32)
    STORAGE_SECRET_FILE.write_text(secret)
    return secret


def apply_theme():
    ui.colors(
        primary=BRAND_PRIMARY,
        secondary=BRAND_SECONDARY,
        accent=BRAND_ACCENT,
        positive=BRAND_POSITIVE,
        negative=BRAND_NEGATIVE,
        warning=BRAND_WARNING,
        dark="#1a1a19",
        dark_page="#0d0d0d",
    )
    dark_pref = app.storage.user.get("dark_mode")
    if dark_pref is None:
        dark_pref = False
        app.storage.user["dark_mode"] = dark_pref
    return ui.dark_mode(value=dark_pref)


def add_theme_toggle(dark, classes=""):
    def toggle():
        new_value = not bool(dark.value)
        dark.value = new_value
        app.storage.user["dark_mode"] = new_value
        btn.props(f"icon={'light_mode' if new_value else 'dark_mode'}")

    btn = ui.button(icon="light_mode" if dark.value else "dark_mode", on_click=toggle).props(
        "flat round dense"
    ).classes(classes).mark("theme-toggle")
    btn.tooltip("Alternar tema claro/escuro")
    return btn


def category_icon(category):
    return CATEGORY_ICONS.get(category, "code")


def open_command_dialog(existing=None, on_saved=None):
    """Diálogo de adicionar/editar um comando. `existing`: dict do comando a
    editar, ou None para criar um novo."""
    with context.client.content:
        dialog = ui.dialog()
    with dialog, ui.card().classes("w-full").style("min-width:560px"):
        ui.label("Editar comando" if existing else "Novo comando").classes("text-lg font-bold")

        command_input = ui.input(label="Comando").classes("w-full font-mono").props("outlined dense").mark(
            "dialog-command"
        )
        category_select = ui.select(db.CATEGORIES, label="Categoria", value=db.CATEGORIES[0]).classes(
            "w-full"
        ).props("outlined dense")
        description_input = ui.textarea(label="Descrição — o que faz").classes("w-full").props(
            "outlined dense autogrow"
        ).mark("dialog-description")
        tags_input = ui.input(label="Palavras-chave (separadas por espaço, para a pesquisa)").classes(
            "w-full"
        ).props("outlined dense")
        example_input = ui.input(label="Exemplo (opcional)").classes("w-full font-mono").props(
            "outlined dense"
        )
        notes_input = ui.textarea(label="Notas (opcional)").classes("w-full").props("outlined dense autogrow")

        if existing:
            command_input.value = existing["command"]
            category_select.value = existing["category"]
            description_input.value = existing["description"]
            tags_input.value = existing["tags"]
            example_input.value = existing["example"]
            notes_input.value = existing["notes"]

        error_label = ui.label("").classes("text-negative text-sm")

        def save():
            command = (command_input.value or "").strip()
            description = (description_input.value or "").strip()
            if not command:
                error_label.set_text("Indica o comando.")
                return
            if not description:
                error_label.set_text("Indica uma descrição.")
                return
            if existing:
                db.update_command(
                    existing["id"], command, description, category_select.value,
                    (tags_input.value or "").strip(), (example_input.value or "").strip(),
                    (notes_input.value or "").strip(),
                )
            else:
                db.add_command(
                    command, description, category_select.value,
                    (tags_input.value or "").strip(), (example_input.value or "").strip(),
                    (notes_input.value or "").strip(),
                )
            dialog.close()
            if on_saved:
                on_saved()

        with ui.row().classes("mt-2"):
            ui.button("Guardar", on_click=save).props("unelevated no-caps").mark("dialog-save")
            ui.button("Cancelar", on_click=dialog.close).props("flat no-caps")
    dialog.open()


def confirm_delete_dialog(cmd, on_deleted=None):
    with context.client.content:
        dialog = ui.dialog()
    with dialog, ui.card():
        ui.label(f'Apagar "{cmd["command"]}"?').classes("font-bold")
        ui.label("Esta ação não pode ser desfeita.").classes("text-sm opacity-60")

        def do_delete():
            db.delete_command(cmd["id"])
            dialog.close()
            if on_deleted:
                on_deleted()

        with ui.row().classes("mt-2"):
            ui.button("Apagar", on_click=do_delete).props("color=negative no-caps").mark("confirm-delete")
            ui.button("Cancelar", on_click=dialog.close).props("flat no-caps")
    dialog.open()


def open_scenario_detail(sc):
    """Mostra os passos ordenados de um cenário, cada um com o comando
    (copiável) e a nota que explica porque é que esse passo existe."""
    full = db.get_scenario(sc["id"])
    with context.client.content:
        dialog = ui.dialog()
    with dialog, ui.card().classes("w-full").style("min-width:600px"):
        ui.label(full["title"]).classes("text-lg font-bold")
        if full["description"]:
            ui.label(full["description"]).classes("text-sm opacity-70 mb-2")

        for i, step in enumerate(full["steps"], start=1):
            with ui.row().classes("w-full items-start gap-2 mb-1"):
                ui.badge(str(i)).props("color=primary")
                with ui.column().classes("gap-0 flex-grow"):
                    if step["command"]:
                        with ui.row().classes("items-center gap-1"):
                            ui.label(step["command"]).classes(
                                "font-mono text-sm bg-current/5 rounded px-2 py-1"
                            )
                            ui.button(
                                icon="content_copy",
                                on_click=lambda c=step["command"]: (
                                    ui.clipboard.write(c), ui.notify("Comando copiado!")
                                ),
                            ).props("flat dense round size=sm").tooltip("Copiar comando")
                    if step["note"]:
                        ui.label(step["note"]).classes("text-xs opacity-70 mt-1")

        ui.button("Fechar", on_click=dialog.close).props("flat no-caps mt-2")
    dialog.open()


def open_scenario_dialog(existing=None, on_saved=None):
    """Diálogo de adicionar/editar um cenário, com passos dinâmicos.
    `existing`: dict devolvido por `db.get_scenario`, ou None para criar."""
    with context.client.content:
        dialog = ui.dialog()
    with dialog, ui.card().classes("w-full").style("min-width:640px; max-width:800px"):
        ui.label("Editar cenário" if existing else "Novo cenário").classes("text-lg font-bold")

        title_input = ui.input(label="Título").classes("w-full").props("outlined dense").mark(
            "scenario-title"
        )
        category_select = ui.select(
            db.SCENARIO_CATEGORIES, label="Categoria", value=db.SCENARIO_CATEGORIES[0]
        ).classes("w-full").props("outlined dense")
        description_input = ui.textarea(label="Descrição — quando usar este cenário").classes(
            "w-full"
        ).props("outlined dense autogrow").mark("scenario-description")

        ui.label("Passos").classes("font-bold mt-2")
        steps_container = ui.column().classes("w-full gap-1")
        step_rows = []

        def add_step_row(command="", note=""):
            with steps_container:
                with ui.row().classes("w-full items-start gap-2") as row:
                    ui.label(str(len(step_rows) + 1)).classes("opacity-60 mt-3 w-4")
                    with ui.column().classes("flex-grow gap-1"):
                        cmd_in = ui.input(label="Comando", value=command).classes(
                            "w-full font-mono"
                        ).props("outlined dense").mark(f"step-command-{len(step_rows)}")
                        note_in = ui.input(label="Nota (opcional)", value=note).classes("w-full").props(
                            "outlined dense"
                        )
                    ui.button(
                        icon="close", on_click=lambda: remove_step_row(entry)
                    ).props("flat dense round size=sm").tooltip("Remover passo")
                entry = {"row": row, "command": cmd_in, "note": note_in}
            step_rows.append(entry)

        def remove_step_row(entry):
            step_rows.remove(entry)
            entry["row"].delete()

        ui.button("Adicionar passo", icon="add", on_click=lambda: add_step_row()).props(
            "flat dense no-caps"
        ).mark("scenario-add-step")

        if existing:
            title_input.value = existing["title"]
            category_select.value = existing["category"]
            description_input.value = existing["description"]
            for step in existing["steps"]:
                add_step_row(step["command"], step["note"])
        else:
            add_step_row()

        error_label = ui.label("").classes("text-negative text-sm")

        def save():
            title = (title_input.value or "").strip()
            description = (description_input.value or "").strip()
            if not title:
                error_label.set_text("Indica um título.")
                return
            steps = [
                ((e["command"].value or "").strip(), (e["note"].value or "").strip())
                for e in step_rows
                if (e["command"].value or "").strip() or (e["note"].value or "").strip()
            ]
            if not steps:
                error_label.set_text("Adiciona pelo menos um passo.")
                return
            if existing:
                scenario_id = existing["id"]
                db.update_scenario(scenario_id, title, description, category_select.value)
            else:
                scenario_id = db.add_scenario(title, description, category_select.value)
            db.replace_steps(scenario_id, steps)
            dialog.close()
            if on_saved:
                on_saved()

        with ui.row().classes("mt-2"):
            ui.button("Guardar", on_click=save).props("unelevated no-caps").mark("scenario-save")
            ui.button("Cancelar", on_click=dialog.close).props("flat no-caps")
    dialog.open()


def confirm_delete_scenario_dialog(sc, on_deleted=None):
    with context.client.content:
        dialog = ui.dialog()
    with dialog, ui.card():
        ui.label(f'Apagar o cenário "{sc["title"]}"?').classes("font-bold")
        ui.label("Esta ação não pode ser desfeita.").classes("text-sm opacity-60")

        def do_delete():
            db.delete_scenario(sc["id"])
            dialog.close()
            if on_deleted:
                on_deleted()

        with ui.row().classes("mt-2"):
            ui.button("Apagar", on_click=do_delete).props("color=negative no-caps").mark(
                "confirm-delete-scenario"
            )
            ui.button("Cancelar", on_click=dialog.close).props("flat no-caps")
    dialog.open()


@ui.page("/")
def main_page():
    state = {"query": "", "category": None, "scenario_query": "", "scenario_category": None}
    dark = apply_theme()

    with ui.row().classes("w-full items-center gap-2 px-4 py-3 bg-primary text-white"):
        ui.icon("menu_book").classes("text-2xl")
        ui.label("Cábula").classes("text-xl font-bold")
        ui.label("Linux · Kubernetes · OpenStack").classes("text-sm opacity-80")
        ui.space()
        add_theme_toggle(dark, classes="text-white")

    with ui.column().classes("w-full max-w-4xl mx-auto p-4 gap-3"):
        with ui.tabs().classes("w-full") as tabs:
            tab_commands = ui.tab("Comandos", icon="terminal").mark("tab-commands")
            tab_scenarios = ui.tab("Cenários", icon="route").mark("tab-scenarios")

        with ui.tab_panels(tabs, value=tab_commands).classes("w-full"):
            with ui.tab_panel(tab_commands).classes("gap-3"):
                with ui.row().classes("w-full items-center gap-2"):
                    search_input = (
                        ui.input(placeholder='Pesquisa por conceito — ex: "listar pods", "reiniciar serviço"...')
                        .classes("flex-grow")
                        .props("outlined dense clearable debounce=150")
                        .mark("search-input")
                    )
                    ui.button(
                        "Novo comando", icon="add", on_click=lambda: open_command_dialog(on_saved=refresh)
                    ).props("unelevated no-caps").mark("new-command")

                with ui.row().classes("gap-2") as category_row:
                    pass

                count_label = ui.label("").classes("text-xs opacity-60")
                results_container = ui.column().classes("w-full gap-2")

                def render_command_card(cmd):
                    with ui.card().classes("w-full p-3"):
                        with ui.row().classes("w-full items-center gap-2 flex-wrap"):
                            ui.icon(category_icon(cmd["category"])).classes("text-lg opacity-70")
                            ui.label(cmd["command"]).classes("font-mono font-bold text-base")
                            ui.badge(cmd["category"]).props("color=primary outline")
                            ui.space()
                            ui.button(
                                icon="content_copy",
                                on_click=lambda c=cmd: (
                                    ui.clipboard.write(c["command"]), ui.notify("Comando copiado!")
                                ),
                            ).props("flat dense round size=sm").tooltip("Copiar comando").mark(
                                f"cmd-copy-{cmd['id']}"
                            )
                            ui.button(
                                icon="edit", on_click=lambda c=cmd: open_command_dialog(c, on_saved=refresh)
                            ).props("flat dense round size=sm").tooltip("Editar").mark(f"cmd-edit-{cmd['id']}")
                            ui.button(
                                icon="delete", on_click=lambda c=cmd: confirm_delete_dialog(c, on_deleted=refresh)
                            ).props("flat dense round size=sm").tooltip("Apagar").mark(f"cmd-delete-{cmd['id']}")
                        ui.label(cmd["description"]).classes("text-sm mt-1")
                        if cmd["example"]:
                            ui.label(cmd["example"]).classes(
                                "font-mono text-xs opacity-70 mt-1 bg-current/5 rounded px-2 py-1 inline-block"
                            )
                        if cmd["notes"]:
                            ui.label(cmd["notes"]).classes("text-xs opacity-60 mt-1 italic")

                def refresh():
                    results_container.clear()
                    results = db.search_commands(state["query"], state["category"])
                    count_label.set_text(f"{len(results)} comando(s)")
                    with results_container:
                        if not results:
                            ui.label("Sem resultados. Tenta outra palavra, ou adiciona este comando.").classes(
                                "opacity-60 text-sm p-4"
                            )
                        for cmd in results:
                            render_command_card(cmd)

                def set_category(cat):
                    state["category"] = cat
                    for c, btn in category_buttons.items():
                        btn.props(f"{'unelevated' if c == cat else 'flat'}")
                    refresh()

                category_buttons = {}
                with category_row:
                    category_buttons[None] = ui.button("Todos", on_click=lambda: set_category(None)).props(
                        "unelevated dense no-caps"
                    ).mark("filter-Todos")
                    for cat in db.CATEGORIES:
                        category_buttons[cat] = ui.button(
                            cat, icon=category_icon(cat), on_click=lambda c=cat: set_category(c)
                        ).props("flat dense no-caps").mark(f"filter-{cat}")

                def on_search_change(e):
                    state["query"] = e.value or ""
                    refresh()

                search_input.on_value_change(on_search_change)

                refresh()

            with ui.tab_panel(tab_scenarios).classes("gap-3"):
                with ui.row().classes("w-full items-center gap-2"):
                    scenario_search_input = (
                        ui.input(placeholder='Pesquisa cenários — ex: "pod não arranca", "disco cheio"...')
                        .classes("flex-grow")
                        .props("outlined dense clearable debounce=150")
                        .mark("scenario-search-input")
                    )
                    ui.button(
                        "Novo cenário", icon="add",
                        on_click=lambda: open_scenario_dialog(on_saved=refresh_scenarios),
                    ).props("unelevated no-caps").mark("new-scenario")

                with ui.row().classes("gap-2") as scenario_category_row:
                    pass

                scenario_count_label = ui.label("").classes("text-xs opacity-60")
                scenario_results_container = ui.column().classes("w-full gap-2")

                def render_scenario_card(sc):
                    with ui.card().classes("w-full p-3"):
                        with ui.row().classes("w-full items-center gap-2 flex-wrap"):
                            ui.icon(category_icon(sc["category"])).classes("text-lg opacity-70")
                            ui.label(sc["title"]).classes("font-bold text-base")
                            ui.badge(sc["category"]).props("color=primary outline")
                            ui.label(f'{sc["step_count"]} passos').classes("text-xs opacity-60")
                            ui.space()
                            ui.button(
                                icon="visibility", on_click=lambda s=sc: open_scenario_detail(s)
                            ).props("flat dense round size=sm").tooltip("Ver passos").mark(
                                f"scenario-view-{sc['id']}"
                            )
                            ui.button(
                                icon="edit",
                                on_click=lambda s=sc: open_scenario_dialog(
                                    db.get_scenario(s["id"]), on_saved=refresh_scenarios
                                ),
                            ).props("flat dense round size=sm").tooltip("Editar").mark(
                                f"scenario-edit-{sc['id']}"
                            )
                            ui.button(
                                icon="delete",
                                on_click=lambda s=sc: confirm_delete_scenario_dialog(
                                    s, on_deleted=refresh_scenarios
                                ),
                            ).props("flat dense round size=sm").tooltip("Apagar").mark(
                                f"scenario-delete-{sc['id']}"
                            )
                        if sc["description"]:
                            ui.label(sc["description"]).classes("text-sm mt-1 opacity-80")

                def refresh_scenarios():
                    scenario_results_container.clear()
                    results = db.search_scenarios(state["scenario_query"], state["scenario_category"])
                    scenario_count_label.set_text(f"{len(results)} cenário(s)")
                    with scenario_results_container:
                        if not results:
                            ui.label("Sem resultados. Tenta outra palavra, ou cria este cenário.").classes(
                                "opacity-60 text-sm p-4"
                            )
                        for sc in results:
                            render_scenario_card(sc)

                def set_scenario_category(cat):
                    state["scenario_category"] = cat
                    for c, btn in scenario_category_buttons.items():
                        btn.props(f"{'unelevated' if c == cat else 'flat'}")
                    refresh_scenarios()

                scenario_category_buttons = {}
                with scenario_category_row:
                    scenario_category_buttons[None] = ui.button(
                        "Todos", on_click=lambda: set_scenario_category(None)
                    ).props("unelevated dense no-caps").mark("scenario-filter-Todos")
                    for cat in db.SCENARIO_CATEGORIES:
                        scenario_category_buttons[cat] = ui.button(
                            cat, icon=category_icon(cat), on_click=lambda c=cat: set_scenario_category(c)
                        ).props("flat dense no-caps").mark(f"scenario-filter-{cat}")

                def on_scenario_search_change(e):
                    state["scenario_query"] = e.value or ""
                    refresh_scenarios()

                scenario_search_input.on_value_change(on_scenario_search_change)

                refresh_scenarios()


if __name__ in {"__main__", "__mp_main__"}:
    # modo nativo (janela própria) quando corre como executável empacotado
    # (PyInstaller define sys.frozen); em desenvolvimento (`python app.py`)
    # fica em modo browser, mais fácil de testar.
    native = getattr(sys, "frozen", False)
    ui.run(
        title="Cábula",
        native=native,
        window_size=(1100, 850) if native else None,
        reload=False,
        show=not native,
        # modo nativo: deixa o NiceGUI escolher uma porta livre sozinho.
        # modo browser (dev): porta fixa 8081, para não colidir com outras apps locais.
        port=None if native else 8081,
        storage_secret=_get_storage_secret(),
    )
