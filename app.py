"""Cábula — motor de pesquisa local de comandos Linux/Kubernetes/OpenStack.

Aplicação NiceGUI totalmente local e portável: SQLite (cabula.db, ao lado
deste ficheiro/executável) com pesquisa full-text, sem rede nem servidor.
"""

import sys

from nicegui import context, ui

import db
import seed_data

seed_data.seed()

CATEGORY_ICONS = {
    "Linux": "terminal",
    "Kubernetes": "hub",
    "OpenStack": "cloud",
}


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


@ui.page("/")
def main_page():
    state = {"query": "", "category": None}

    with ui.row().classes("w-full items-center gap-2 px-4 py-3 bg-primary text-white"):
        ui.icon("menu_book").classes("text-2xl")
        ui.label("Cábula").classes("text-xl font-bold")
        ui.label("Linux · Kubernetes · OpenStack").classes("text-sm opacity-80")

    with ui.column().classes("w-full max-w-4xl mx-auto p-4 gap-3"):
        with ui.row().classes("w-full items-center gap-2"):
            search_input = (
                ui.input(placeholder='Pesquisa por conceito — ex: "listar pods", "reiniciar serviço"...')
                .classes("flex-grow")
                .props("outlined dense clearable debounce=150")
                .mark("search-input")
            )
            ui.button("Novo comando", icon="add", on_click=lambda: open_command_dialog(on_saved=refresh)).props(
                "unelevated no-caps"
            ).mark("new-command")

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
                        on_click=lambda c=cmd: (ui.clipboard.write(c["command"]), ui.notify("Comando copiado!")),
                    ).props("flat dense round size=sm").tooltip("Copiar comando").mark(f"cmd-copy-{cmd['id']}")
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
    )
