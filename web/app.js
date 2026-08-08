import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// A chave "anon" é pública por desenho (vai sempre para código client-side);
// quem escreve precisa do PIN, verificado do lado do Postgres nas funções RPC.
const SUPABASE_URL = "https://vikbhiqfgqjhghvwuchb.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZpa2JoaXFmZ3FqaGdodnd1Y2hiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYxNzAxNTUsImV4cCI6MjEwMTc0NjE1NX0.Z5tpme4pIMBcbQs94DhRmIUtNeAcdzQJNgbh-lIIi-I";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const CATEGORY_ICON = {
    Linux: "🐧", Kubernetes: "☸️", OpenStack: "☁️", Geral: "🧭",
    Docker: "🐳", Redes: "🌐", Bash: "💻", Python: "🐍", Troubleshooting: "🔧",
};
const FALLBACK_ICONS = ["📄", "📦", "🔩", "🧩", "🗃️"];
function iconFor(cat) {
    if (CATEGORY_ICON[cat]) return CATEGORY_ICON[cat];
    let h = 0;
    for (const ch of cat) h = (h * 31 + ch.charCodeAt(0)) % FALLBACK_ICONS.length;
    return FALLBACK_ICONS[h];
}

// tab: tipo de conteudo em foco ("commands"/"scenarios"/"glossary") — usado
// tambem para saber o que o botao "+ Novo" cria. favoritesOnly substitui a
// listagem normal por uma vista combinada (comandos+cenarios favoritos).
let state = {
    tab: "commands",
    category: "",
    subcategory: "",
    expandedCategory: "",
    favoritesOnly: false,
    query: "",
    items: [],
    commandCategories: [],
    subcategoriesByCategory: {},
    pin: sessionStorage.getItem("cabula_pin") || "",
};

const $ = (sel) => document.querySelector(sel);
const listEl = $("#list");
const navTree = $("#nav-tree");
const breadcrumb = $("#breadcrumb");

function toast(msg, isError = false) {
    const el = $("#toast");
    el.textContent = msg;
    el.style.background = isError ? "var(--negative)" : "var(--primary)";
    el.style.display = "block";
    clearTimeout(toast._t);
    toast._t = setTimeout(() => (el.style.display = "none"), 2500);
}

function requirePin() {
    if (state.pin) return true;
    $("#pin-dialog").showModal();
    return false;
}

// ---------------------------------------------------------------------
// PIN dialog
// ---------------------------------------------------------------------

$("#pin-btn").onclick = () => $("#pin-dialog").showModal();
$("#pin-cancel").onclick = () => $("#pin-dialog").close();
$("#pin-save").onclick = () => {
    const val = $("#pin-input").value.trim();
    if (!val) return;
    state.pin = val;
    sessionStorage.setItem("cabula_pin", val);
    $("#pin-input").value = "";
    $("#pin-dialog").close();
    toast("PIN guardado nesta sessão");
};

// ---------------------------------------------------------------------
// Navegacao (arvore no sidebar)
// ---------------------------------------------------------------------

function goTo(tab, category = "", subcategory = "") {
    state.favoritesOnly = false;
    state.tab = tab;
    state.category = category;
    state.subcategory = subcategory;
    closeSidebarOnMobile();
    loadAndRender();
}

function goToFavorites() {
    state.favoritesOnly = true;
    state.category = "";
    state.subcategory = "";
    closeSidebarOnMobile();
    loadAndRender();
}

function toggleExpand(category) {
    state.expandedCategory = state.expandedCategory === category ? "" : category;
    goTo("commands", category, "");
}

async function loadCommandCategories() {
    const { data, error } = await supabase.from("commands").select("category, subcategory");
    if (error) return { categories: [], byCategory: {} };
    const byCategory = {};
    data.forEach((d) => {
        if (!d.category) return;
        if (!byCategory[d.category]) byCategory[d.category] = new Set();
        if (d.subcategory) byCategory[d.category].add(d.subcategory);
    });
    const categories = Object.keys(byCategory).sort();
    const result = {};
    categories.forEach((c) => (result[c] = [...byCategory[c]].sort()));
    return { categories, byCategory: result };
}

function navItemHtml(key, icon, label, active, extraClass = "") {
    return `<li><button class="nav-item ${extraClass} ${active ? "active" : ""}" data-key="${key}">
        <span class="icon">${icon}</span><span>${escapeHtml(label)}</span>
    </button></li>`;
}

function renderNavTree() {
    const handlers = {};
    let html = "";

    html += navItemHtml("home", "🏠", "Home", !state.favoritesOnly && state.tab === "commands" && !state.category);
    handlers.home = () => goTo("commands");

    state.commandCategories.forEach((c) => {
        const isExpanded = state.expandedCategory === c;
        const isActive = !state.favoritesOnly && state.tab === "commands" && state.category === c && !state.subcategory;
        html += navItemHtml(`cat-${c}`, iconFor(c), c, isActive || isExpanded);
        handlers[`cat-${c}`] = () => toggleExpand(c);

        if (isExpanded) {
            const subs = state.subcategoriesByCategory[c] || [];
            if (subs.length) {
                html += `<li><ul class="nav-tree">`;
                subs.forEach((sc) => {
                    const active = state.tab === "commands" && state.category === c && state.subcategory === sc;
                    html += navItemHtml(`sub-${c}-${sc}`, "—", sc, active, "sub");
                    handlers[`sub-${c}-${sc}`] = () => goTo("commands", c, sc);
                });
                html += `</ul></li>`;
            }
        }
    });

    html += navItemHtml("glossary", "📘", "Conceitos", !state.favoritesOnly && state.tab === "glossary");
    handlers.glossary = () => goTo("glossary");
    html += navItemHtml("scenarios", "🗂️", "Playbooks", !state.favoritesOnly && state.tab === "scenarios");
    handlers.scenarios = () => goTo("scenarios");
    html += navItemHtml("favorites", "⭐", "Favoritos", state.favoritesOnly);
    handlers.favorites = goToFavorites;

    navTree.innerHTML = html;
    Object.entries(handlers).forEach(([key, fn]) => {
        navTree.querySelector(`[data-key="${key}"]`).onclick = fn;
    });
}

$("#search").oninput = (e) => {
    state.query = e.target.value;
    render();
};

$("#add-btn").onclick = () => {
    if (!requirePin()) return;
    openItemDialog(null);
};

$("#menu-toggle").onclick = () => {
    $("#sidebar").classList.add("open");
    $("#sidebar-backdrop").classList.add("open");
};
$("#sidebar-backdrop").onclick = closeSidebarOnMobile;
function closeSidebarOnMobile() {
    $("#sidebar").classList.remove("open");
    $("#sidebar-backdrop").classList.remove("open");
}

// ---------------------------------------------------------------------
// Exportar / Importar
// ---------------------------------------------------------------------

$("#export-btn").onclick = doExport;
$("#import-btn").onclick = () => $("#import-file").click();
$("#import-file").onchange = (e) => {
    const file = e.target.files[0];
    e.target.value = "";
    if (file) doImport(file);
};

async function doExport() {
    const [commands, scenarios, steps, glossary] = await Promise.all([
        supabase.from("commands").select("*").order("command"),
        supabase.from("scenarios").select("*").order("title"),
        supabase.from("scenario_steps").select("*").order("position"),
        supabase.from("glossary").select("*").order("term"),
    ]);
    if (commands.error || scenarios.error || steps.error || glossary.error) {
        return toast("Erro ao exportar", true);
    }
    const data = {
        version: 1,
        exported_at: new Date().toISOString(),
        commands: commands.data.map((c) => ({
            command: c.command, description: c.description, category: c.category, subcategory: c.subcategory,
            tags: c.tags, example: c.example, notes: c.notes, favorite: c.favorite,
        })),
        scenarios: scenarios.data.map((s) => ({
            title: s.title, description: s.description, category: s.category, favorite: s.favorite,
            steps: steps.data
                .filter((st) => st.scenario_id === s.id)
                .sort((a, b) => a.position - b.position)
                .map((st) => ({ command: st.command, note: st.note })),
        })),
        glossary: glossary.data.map((t) => ({ term: t.term, definition: t.definition, category: t.category })),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `cabula-export-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast("Exportado");
}

async function doImport(file) {
    if (!requirePin()) return;
    const pin = state.pin;
    let data;
    try {
        data = JSON.parse(await file.text());
    } catch {
        return toast("Ficheiro JSON inválido", true);
    }
    if (!confirm(
        `Importar ${data.commands?.length || 0} comandos, ${data.scenarios?.length || 0} cenários e ` +
        `${data.glossary?.length || 0} termos? Isto adiciona ao que já existe (não substitui nada).`
    )) return;

    let counts = { commands: 0, scenarios: 0, glossary: 0 };

    for (const c of data.commands || []) {
        if (!c.command || !c.description) continue;
        const { data: row, error } = await supabase.rpc("add_command", {
            pin, p_command: c.command, p_description: c.description, p_category: c.category || "Linux",
            p_subcategory: c.subcategory || "", p_tags: c.tags || "", p_example: c.example || "", p_notes: c.notes || "",
        });
        if (error) return toast(`Erro a importar comandos: ${error.message}`, true);
        if (c.favorite) await supabase.rpc("toggle_command_favorite", { pin, p_id: row.id });
        counts.commands++;
    }

    for (const s of data.scenarios || []) {
        if (!s.title) continue;
        const { data: newId, error } = await supabase.rpc("add_scenario", {
            pin, p_title: s.title, p_description: s.description || "", p_category: s.category || "Geral",
            p_steps: s.steps || [],
        });
        if (error) return toast(`Erro a importar cenários: ${error.message}`, true);
        if (s.favorite) await supabase.rpc("toggle_scenario_favorite", { pin, p_id: newId });
        counts.scenarios++;
    }

    for (const t of data.glossary || []) {
        if (!t.term || !t.definition) continue;
        const { error } = await supabase.rpc("add_term", {
            pin, p_term: t.term, p_definition: t.definition, p_category: t.category || "Geral",
        });
        if (error) return toast(`Erro a importar glossário: ${error.message}`, true);
        counts.glossary++;
    }

    toast(`Importado: ${counts.commands} comandos, ${counts.scenarios} cenários, ${counts.glossary} termos`);
    await refreshNav();
    loadAndRender();
}

// ---------------------------------------------------------------------
// Dados
// ---------------------------------------------------------------------

const TABLE_FOR_TAB = { commands: "commands", scenarios: "scenarios", glossary: "glossary" };

async function refreshNav() {
    const { categories, byCategory } = await loadCommandCategories();
    state.commandCategories = categories;
    state.subcategoriesByCategory = byCategory;
    renderNavTree();
}

async function loadAndRender() {
    renderNavTree();
    listEl.innerHTML = '<p class="empty">A carregar...</p>';
    $("#add-btn").style.display = state.favoritesOnly ? "none" : "";

    if (state.favoritesOnly) {
        const [cmds, scs] = await Promise.all([
            supabase.from("commands").select("*").eq("favorite", true).order("command"),
            supabase.from("scenarios").select("*, scenario_steps(*)").eq("favorite", true).order("title"),
        ]);
        if (cmds.error || scs.error) {
            listEl.innerHTML = `<p class="empty">Erro a carregar favoritos.</p>`;
            return;
        }
        state.items = [
            ...cmds.data.map((i) => ({ ...i, _kind: "commands" })),
            ...scs.data.map((i) => ({ ...i, _kind: "scenarios" })),
        ];
        render();
        return;
    }

    const table = TABLE_FOR_TAB[state.tab];
    let query = supabase.from(table).select(state.tab === "scenarios" ? "*, scenario_steps(*)" : "*");
    const orderCol = state.tab === "commands" ? "command" : state.tab === "scenarios" ? "title" : "term";
    query = query.order(orderCol);
    const { data, error } = await query;
    if (error) {
        listEl.innerHTML = `<p class="empty">Erro a carregar: ${error.message}</p>`;
        return;
    }
    state.items = data.map((i) => ({ ...i, _kind: state.tab }));
    render();
}

function currentLabel() {
    if (state.favoritesOnly) return "Favoritos";
    if (state.tab === "glossary") return "Conceitos";
    if (state.tab === "scenarios") return "Playbooks";
    if (state.category && state.subcategory) return `${state.category} / ${state.subcategory}`;
    return state.category || "Home";
}

function renderBreadcrumb(count) {
    breadcrumb.innerHTML = `<b>${escapeHtml(currentLabel())}</b> · ${count} ${count === 1 ? "item" : "itens"}`;
}

function matchesQuery(item, q) {
    if (!q) return true;
    q = q.toLowerCase();
    if (item._kind === "commands") {
        return [item.command, item.description, item.tags].some((f) => (f || "").toLowerCase().includes(q));
    }
    if (item._kind === "scenarios") {
        const stepsText = (item.scenario_steps || []).map((s) => s.command + " " + s.note).join(" ");
        return [item.title, item.description, stepsText].some((f) => (f || "").toLowerCase().includes(q));
    }
    return [item.term, item.definition].some((f) => (f || "").toLowerCase().includes(q));
}

function render() {
    const filtered = state.items
        .filter((i) => !state.category || i.category === state.category)
        .filter((i) => !state.subcategory || i.subcategory === state.subcategory)
        .filter((i) => matchesQuery(i, state.query));

    renderBreadcrumb(filtered.length);

    if (!filtered.length) {
        listEl.innerHTML = '<p class="empty">Sem resultados.</p>';
        return;
    }

    listEl.innerHTML = filtered.map((item) => renderCard(item)).join("");
    listEl.querySelectorAll("[data-copy]").forEach((btn) => {
        btn.onclick = () => {
            navigator.clipboard.writeText(btn.dataset.copy);
            toast("Comando copiado");
        };
    });
    listEl.querySelectorAll("[data-fav]").forEach((btn) => (btn.onclick = () => toggleFavorite(btn.dataset.fav, btn.dataset.kind)));
    listEl.querySelectorAll("[data-edit]").forEach((btn) => (btn.onclick = () => onEdit(btn.dataset.edit)));
    listEl.querySelectorAll("[data-del]").forEach((btn) => (btn.onclick = () => onDelete(btn.dataset.del, btn.dataset.kind)));
}

function renderCard(item) {
    const icon = iconFor(item.category);
    const favIcon = item.favorite ? "⭐" : "☆";
    if (item._kind === "commands") {
        return `<div class="entry">
            <div class="entry-top">
                <div class="entry-body">
                    <span class="badge">${icon} ${escapeHtml(item.category)}${item.subcategory ? " / " + escapeHtml(item.subcategory) : ""}</span>
                    <div class="mono">${escapeHtml(item.command)}</div>
                    <div class="desc">${escapeHtml(item.description)}</div>
                    ${item.tags ? `<div class="tags-line">🏷️ ${escapeHtml(item.tags)}</div>` : ""}
                </div>
                <div class="actions">
                    <button data-copy="${escapeAttr(item.command)}" title="Copiar">📋</button>
                    <button data-fav="${item.id}" data-kind="commands" title="Favorito">${favIcon}</button>
                    <button data-edit="${item.id}" title="Editar">✏️</button>
                    <button data-del="${item.id}" data-kind="commands" title="Apagar">🗑️</button>
                </div>
            </div>
        </div>`;
    }
    if (item._kind === "scenarios") {
        const steps = (item.scenario_steps || []).sort((a, b) => a.position - b.position);
        return `<div class="entry">
            <div class="entry-top">
                <div class="entry-body">
                    <span class="badge">${icon} ${escapeHtml(item.category)}</span>
                    <div class="entry-title">${escapeHtml(item.title)}</div>
                    ${item.description ? `<div class="desc">${escapeHtml(item.description)}</div>` : ""}
                    ${steps
                        .map(
                            (s) =>
                                `<div class="step"><span class="mono">${escapeHtml(s.command)}</span>${
                                    s.note ? `<div class="desc">${escapeHtml(s.note)}</div>` : ""
                                }</div>`
                        )
                        .join("")}
                </div>
                <div class="actions">
                    <button data-fav="${item.id}" data-kind="scenarios" title="Favorito">${favIcon}</button>
                    <button data-edit="${item.id}" title="Editar">✏️</button>
                    <button data-del="${item.id}" data-kind="scenarios" title="Apagar">🗑️</button>
                </div>
            </div>
        </div>`;
    }
    return `<div class="entry">
        <div class="entry-top">
            <div class="entry-body">
                <span class="badge">${icon} ${escapeHtml(item.category)}</span>
                <div class="entry-title">${escapeHtml(item.term)}</div>
                <div class="desc">${escapeHtml(item.definition)}</div>
            </div>
            <div class="actions">
                <button data-edit="${item.id}" title="Editar">✏️</button>
                <button data-del="${item.id}" data-kind="glossary" title="Apagar">🗑️</button>
            </div>
        </div>
    </div>`;
}

function escapeHtml(s) {
    return (s || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function escapeAttr(s) {
    return escapeHtml(s).replace(/`/g, "&#96;");
}

// ---------------------------------------------------------------------
// Favoritos (toggle)
// ---------------------------------------------------------------------

async function toggleFavorite(id, kind) {
    if (!requirePin()) return;
    const fn = kind === "commands" ? "toggle_command_favorite" : "toggle_scenario_favorite";
    const { error } = await supabase.rpc(fn, { pin: state.pin, p_id: Number(id) });
    if (error) return toast(error.message, true);
    loadAndRender();
}

// ---------------------------------------------------------------------
// Apagar
// ---------------------------------------------------------------------

async function onDelete(id, kind) {
    if (!requirePin()) return;
    if (!confirm("Apagar este item?")) return;
    const fn = { commands: "delete_command", scenarios: "delete_scenario", glossary: "delete_term" }[kind];
    const { error } = await supabase.rpc(fn, { pin: state.pin, p_id: Number(id) });
    if (error) return toast(error.message, true);
    toast("Apagado");
    if (kind === "commands") await refreshNav();
    loadAndRender();
}

// ---------------------------------------------------------------------
// Criar / editar (dialog dinâmico consoante o tipo do item)
// ---------------------------------------------------------------------

function onEdit(id) {
    if (!requirePin()) return;
    const item = state.items.find((i) => String(i.id) === String(id));
    openItemDialog(item);
}

function openItemDialog(item) {
    const kind = item ? item._kind : state.tab;
    const dlg = $("#item-dialog");
    dlg.innerHTML = buildFormHtml(item, kind);
    dlg.showModal();

    if (kind === "scenarios") {
        const stepsWrap = dlg.querySelector(".steps-editor");
        const steps = item?.scenario_steps ? [...item.scenario_steps].sort((a, b) => a.position - b.position) : [];
        stepsWrap.innerHTML = "";
        steps.forEach((s) => stepsWrap.appendChild(stepRow(s.command, s.note)));
        dlg.querySelector(".add-step").onclick = () => stepsWrap.appendChild(stepRow());
    }

    dlg.querySelector(".dialog-cancel").onclick = () => dlg.close();
    dlg.querySelector(".dialog-save").onclick = () => saveItem(item, kind, dlg);
}

function stepRow(command = "", note = "") {
    const div = document.createElement("div");
    div.className = "step-row";
    div.innerHTML = `<input class="step-command" placeholder="comando" value="${escapeAttr(command)}">
        <input class="step-note" placeholder="nota" value="${escapeAttr(note)}">
        <button class="ghost remove-step" type="button">✕</button>`;
    bindRemoveStep(div.querySelector(".remove-step"));
    return div;
}
function bindRemoveStep(btn) {
    btn.onclick = () => btn.closest(".step-row").remove();
}

function buildFormHtml(item, kind) {
    const title = item ? "Editar" : "Novo";
    if (kind === "commands") {
        return `<h3>${title} comando</h3>
            <div class="form-row"><label>Comando</label><input class="f-command" value="${escapeAttr(item?.command)}"></div>
            <div class="form-row"><label>Descrição</label><input class="f-description" value="${escapeAttr(item?.description)}"></div>
            <div class="form-row"><label>Categoria</label><input class="f-category" value="${escapeAttr(item?.category || "Linux")}"></div>
            <div class="form-row"><label>Subcategoria (opcional)</label><input class="f-subcategory" value="${escapeAttr(item?.subcategory)}"></div>
            <div class="form-row"><label>Tags</label><input class="f-tags" value="${escapeAttr(item?.tags)}"></div>
            <div class="form-row"><label>Exemplo</label><textarea class="f-example" rows="2">${escapeHtml(item?.example)}</textarea></div>
            <div class="form-row"><label>Notas</label><textarea class="f-notes" rows="2">${escapeHtml(item?.notes)}</textarea></div>
            <div class="dialog-actions">
                <button class="ghost dialog-cancel" type="button">Cancelar</button>
                <button class="primary dialog-save" type="button">Guardar</button>
            </div>`;
    }
    if (kind === "scenarios") {
        const steps = item?.scenario_steps ? [...item.scenario_steps].sort((a, b) => a.position - b.position) : [];
        return `<h3>${title} cenário</h3>
            <div class="form-row"><label>Título</label><input class="f-title" value="${escapeAttr(item?.title)}"></div>
            <div class="form-row"><label>Descrição</label><textarea class="f-description" rows="2">${escapeHtml(item?.description)}</textarea></div>
            <div class="form-row"><label>Categoria</label><input class="f-category" value="${escapeAttr(item?.category || "Geral")}"></div>
            <div class="form-row"><label>Passos</label>
                <div class="steps-editor">${steps.map(() => `<div></div>`).join("")}</div>
                <button class="ghost add-step" type="button" style="margin-top:4px">+ Passo</button>
            </div>
            <div class="dialog-actions">
                <button class="ghost dialog-cancel" type="button">Cancelar</button>
                <button class="primary dialog-save" type="button">Guardar</button>
            </div>`;
    }
    return `<h3>${title} termo</h3>
        <div class="form-row"><label>Termo</label><input class="f-term" value="${escapeAttr(item?.term)}"></div>
        <div class="form-row"><label>Definição</label><textarea class="f-definition" rows="3">${escapeHtml(item?.definition)}</textarea></div>
        <div class="form-row"><label>Categoria</label><input class="f-category" value="${escapeAttr(item?.category || "Geral")}"></div>
        <div class="dialog-actions">
            <button class="ghost dialog-cancel" type="button">Cancelar</button>
            <button class="primary dialog-save" type="button">Guardar</button>
        </div>`;
}

async function saveItem(item, kind, dlg) {
    if (!requirePin()) return;
    const pin = state.pin;
    let error;

    if (kind === "commands") {
        const payload = {
            p_command: dlg.querySelector(".f-command").value.trim(),
            p_description: dlg.querySelector(".f-description").value.trim(),
            p_category: dlg.querySelector(".f-category").value.trim() || "Linux",
            p_subcategory: dlg.querySelector(".f-subcategory").value.trim(),
            p_tags: dlg.querySelector(".f-tags").value.trim(),
            p_example: dlg.querySelector(".f-example").value.trim(),
            p_notes: dlg.querySelector(".f-notes").value.trim(),
        };
        if (!payload.p_command || !payload.p_description) return toast("Comando e descrição são obrigatórios", true);
        const fn = item ? "update_command" : "add_command";
        const args = item ? { pin, p_id: item.id, ...payload } : { pin, ...payload };
        ({ error } = await supabase.rpc(fn, args));
    } else if (kind === "scenarios") {
        const steps = [...dlg.querySelectorAll(".step-row")]
            .map((row) => ({
                command: row.querySelector(".step-command").value.trim(),
                note: row.querySelector(".step-note").value.trim(),
            }))
            .filter((s) => s.command || s.note);
        const payload = {
            p_title: dlg.querySelector(".f-title").value.trim(),
            p_description: dlg.querySelector(".f-description").value.trim(),
            p_category: dlg.querySelector(".f-category").value.trim() || "Geral",
            p_steps: steps,
        };
        if (!payload.p_title) return toast("Título é obrigatório", true);
        const fn = item ? "update_scenario" : "add_scenario";
        const args = item ? { pin, p_id: item.id, ...payload } : { pin, ...payload };
        ({ error } = await supabase.rpc(fn, args));
    } else {
        const payload = {
            p_term: dlg.querySelector(".f-term").value.trim(),
            p_definition: dlg.querySelector(".f-definition").value.trim(),
            p_category: dlg.querySelector(".f-category").value.trim() || "Geral",
        };
        if (!payload.p_term || !payload.p_definition) return toast("Termo e definição são obrigatórios", true);
        const fn = item ? "update_term" : "add_term";
        const args = item ? { pin, p_id: item.id, ...payload } : { pin, ...payload };
        ({ error } = await supabase.rpc(fn, args));
    }

    if (error) return toast(error.message, true);
    dlg.close();
    toast("Guardado");
    if (kind === "commands") await refreshNav();
    loadAndRender();
}

(async () => {
    await refreshNav();
    await loadAndRender();
})();
