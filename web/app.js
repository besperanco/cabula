import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// A chave "anon" é pública por desenho (vai sempre para código client-side);
// quem escreve precisa do PIN, verificado do lado do Postgres nas funções RPC.
const SUPABASE_URL = "https://vikbhiqfgqjhghvwuchb.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZpa2JoaXFmZ3FqaGdodnd1Y2hiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYxNzAxNTUsImV4cCI6MjEwMTc0NjE1NX0.Z5tpme4pIMBcbQs94DhRmIUtNeAcdzQJNgbh-lIIi-I";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const CATEGORY_ICON = { Linux: "🐧", Kubernetes: "☸️", OpenStack: "☁️", Geral: "🧭" };

let state = {
    tab: "commands",
    query: "",
    category: "",
    items: [],
    pin: sessionStorage.getItem("cabula_pin") || "",
};

const $ = (sel) => document.querySelector(sel);
const listEl = $("#list");
const categoryFilter = $("#category-filter");

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
// Tabs / filtros
// ---------------------------------------------------------------------

document.querySelectorAll("#tabs button").forEach((btn) => {
    btn.onclick = () => {
        document.querySelectorAll("#tabs button").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        state.tab = btn.dataset.tab;
        state.category = "";
        loadAndRender();
    };
});

$("#search").oninput = (e) => {
    state.query = e.target.value;
    render();
};

categoryFilter.onchange = (e) => {
    state.category = e.target.value;
    render();
};

$("#add-btn").onclick = () => {
    if (!requirePin()) return;
    openItemDialog(null);
};

// ---------------------------------------------------------------------
// Dados
// ---------------------------------------------------------------------

const TABLE_FOR_TAB = { commands: "commands", scenarios: "scenarios", glossary: "glossary" };

async function loadAndRender() {
    listEl.innerHTML = '<p class="empty">A carregar...</p>';
    const table = TABLE_FOR_TAB[state.tab];
    let query = supabase.from(table).select(state.tab === "scenarios" ? "*, scenario_steps(*)" : "*");
    const orderCol = state.tab === "commands" ? "command" : state.tab === "scenarios" ? "title" : "term";
    query = query.order(orderCol);
    const { data, error } = await query;
    if (error) {
        listEl.innerHTML = `<p class="empty">Erro a carregar: ${error.message}</p>`;
        return;
    }
    state.items = data;
    populateCategoryFilter();
    render();
}

function populateCategoryFilter() {
    const cats = [...new Set(state.items.map((i) => i.category).filter(Boolean))].sort();
    categoryFilter.innerHTML =
        '<option value="">Todas as categorias</option>' +
        cats.map((c) => `<option value="${c}">${c}</option>`).join("");
    categoryFilter.value = state.category;
}

function matchesQuery(item, q) {
    if (!q) return true;
    q = q.toLowerCase();
    if (state.tab === "commands") {
        return [item.command, item.description, item.tags].some((f) => (f || "").toLowerCase().includes(q));
    }
    if (state.tab === "scenarios") {
        const stepsText = (item.scenario_steps || []).map((s) => s.command + " " + s.note).join(" ");
        return [item.title, item.description, stepsText].some((f) => (f || "").toLowerCase().includes(q));
    }
    return [item.term, item.definition].some((f) => (f || "").toLowerCase().includes(q));
}

function render() {
    const filtered = state.items
        .filter((i) => !state.category || i.category === state.category)
        .filter((i) => matchesQuery(i, state.query));

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
    listEl.querySelectorAll("[data-fav]").forEach((btn) => (btn.onclick = () => toggleFavorite(btn.dataset.fav)));
    listEl.querySelectorAll("[data-edit]").forEach((btn) => (btn.onclick = () => onEdit(btn.dataset.edit)));
    listEl.querySelectorAll("[data-del]").forEach((btn) => (btn.onclick = () => onDelete(btn.dataset.del)));
}

function renderCard(item) {
    const icon = CATEGORY_ICON[item.category] || "📄";
    const favIcon = item.favorite ? "⭐" : "☆";
    if (state.tab === "commands") {
        return `<div class="card">
            <div class="card-top">
                <div>
                    <span class="badge">${icon} ${item.category}</span>
                    <div class="mono">${escapeHtml(item.command)}</div>
                    <div class="desc">${escapeHtml(item.description)}</div>
                    ${item.tags ? `<div class="desc">🏷️ ${escapeHtml(item.tags)}</div>` : ""}
                </div>
                <div class="actions">
                    <button data-copy="${escapeAttr(item.command)}" title="Copiar">📋</button>
                    <button data-fav="${item.id}" title="Favorito">${favIcon}</button>
                    <button data-edit="${item.id}" title="Editar">✏️</button>
                    <button data-del="${item.id}" title="Apagar">🗑️</button>
                </div>
            </div>
        </div>`;
    }
    if (state.tab === "scenarios") {
        const steps = (item.scenario_steps || []).sort((a, b) => a.position - b.position);
        return `<div class="card">
            <div class="card-top">
                <div style="flex:1">
                    <span class="badge">${icon} ${item.category}</span>
                    <strong>${escapeHtml(item.title)}</strong>
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
                    <button data-fav="${item.id}" title="Favorito">${favIcon}</button>
                    <button data-edit="${item.id}" title="Editar">✏️</button>
                    <button data-del="${item.id}" title="Apagar">🗑️</button>
                </div>
            </div>
        </div>`;
    }
    return `<div class="card">
        <div class="card-top">
            <div>
                <span class="badge">${icon} ${item.category}</span>
                <strong>${escapeHtml(item.term)}</strong>
                <div class="desc">${escapeHtml(item.definition)}</div>
            </div>
            <div class="actions">
                <button data-edit="${item.id}" title="Editar">✏️</button>
                <button data-del="${item.id}" title="Apagar">🗑️</button>
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
// Favoritos
// ---------------------------------------------------------------------

async function toggleFavorite(id) {
    if (!requirePin()) return;
    const fn = state.tab === "commands" ? "toggle_command_favorite" : "toggle_scenario_favorite";
    if (state.tab === "glossary") return;
    const { error } = await supabase.rpc(fn, { pin: state.pin, p_id: Number(id) });
    if (error) return toast(error.message, true);
    loadAndRender();
}

// ---------------------------------------------------------------------
// Apagar
// ---------------------------------------------------------------------

async function onDelete(id) {
    if (!requirePin()) return;
    if (!confirm("Apagar este item?")) return;
    const fn = { commands: "delete_command", scenarios: "delete_scenario", glossary: "delete_term" }[state.tab];
    const { error } = await supabase.rpc(fn, { pin: state.pin, p_id: Number(id) });
    if (error) return toast(error.message, true);
    toast("Apagado");
    loadAndRender();
}

// ---------------------------------------------------------------------
// Criar / editar (dialog dinâmico por separador)
// ---------------------------------------------------------------------

function onEdit(id) {
    if (!requirePin()) return;
    const item = state.items.find((i) => String(i.id) === String(id));
    openItemDialog(item);
}

function openItemDialog(item) {
    const dlg = $("#item-dialog");
    dlg.innerHTML = buildFormHtml(item);
    dlg.showModal();

    if (state.tab === "scenarios") {
        const stepsWrap = dlg.querySelector(".steps-editor");
        const steps = item?.scenario_steps ? [...item.scenario_steps].sort((a, b) => a.position - b.position) : [];
        stepsWrap.innerHTML = "";
        steps.forEach((s) => stepsWrap.appendChild(stepRow(s.command, s.note)));
        dlg.querySelector(".add-step").onclick = () => stepsWrap.appendChild(stepRow());
    }

    dlg.querySelector(".dialog-cancel").onclick = () => dlg.close();
    dlg.querySelector(".dialog-save").onclick = () => saveItem(item, dlg);
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

function buildFormHtml(item) {
    const title = item ? "Editar" : "Novo";
    if (state.tab === "commands") {
        return `<h3>${title} comando</h3>
            <div class="form-row"><label>Comando</label><input class="f-command" value="${escapeAttr(item?.command)}"></div>
            <div class="form-row"><label>Descrição</label><input class="f-description" value="${escapeAttr(item?.description)}"></div>
            <div class="form-row"><label>Categoria</label><input class="f-category" value="${escapeAttr(item?.category || "Linux")}"></div>
            <div class="form-row"><label>Tags</label><input class="f-tags" value="${escapeAttr(item?.tags)}"></div>
            <div class="form-row"><label>Exemplo</label><textarea class="f-example" rows="2">${escapeHtml(item?.example)}</textarea></div>
            <div class="form-row"><label>Notas</label><textarea class="f-notes" rows="2">${escapeHtml(item?.notes)}</textarea></div>
            <div class="dialog-actions">
                <button class="ghost dialog-cancel" type="button">Cancelar</button>
                <button class="primary dialog-save" type="button">Guardar</button>
            </div>`;
    }
    if (state.tab === "scenarios") {
        const steps = item?.scenario_steps ? [...item.scenario_steps].sort((a, b) => a.position - b.position) : [];
        return `<h3>${title} cenário</h3>
            <div class="form-row"><label>Título</label><input class="f-title" value="${escapeAttr(item?.title)}"></div>
            <div class="form-row"><label>Descrição</label><textarea class="f-description" rows="2">${escapeHtml(item?.description)}</textarea></div>
            <div class="form-row"><label>Categoria</label><input class="f-category" value="${escapeAttr(item?.category || "Geral")}"></div>
            <div class="form-row"><label>Passos</label>
                <div class="steps-editor">${steps.map((s) => `<div></div>`).join("")}</div>
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

async function saveItem(item, dlg) {
    if (!requirePin()) return;
    const pin = state.pin;
    let error;

    if (state.tab === "commands") {
        const payload = {
            p_command: dlg.querySelector(".f-command").value.trim(),
            p_description: dlg.querySelector(".f-description").value.trim(),
            p_category: dlg.querySelector(".f-category").value.trim() || "Linux",
            p_tags: dlg.querySelector(".f-tags").value.trim(),
            p_example: dlg.querySelector(".f-example").value.trim(),
            p_notes: dlg.querySelector(".f-notes").value.trim(),
        };
        if (!payload.p_command || !payload.p_description) return toast("Comando e descrição são obrigatórios", true);
        const fn = item ? "update_command" : "add_command";
        const args = item ? { pin, p_id: item.id, ...payload } : { pin, ...payload };
        ({ error } = await supabase.rpc(fn, args));
    } else if (state.tab === "scenarios") {
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
    loadAndRender();
}

loadAndRender();
