import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import * as yamlLib from "https://esm.sh/js-yaml@4";

// A chave "anon" é pública por desenho (vai sempre para código client-side);
// quem escreve precisa do PIN, verificado do lado do Postgres nas funções RPC.
const SUPABASE_URL = "https://vikbhiqfgqjhghvwuchb.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZpa2JoaXFmZ3FqaGdodnd1Y2hiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYxNzAxNTUsImV4cCI6MjEwMTc0NjE1NX0.Z5tpme4pIMBcbQs94DhRmIUtNeAcdzQJNgbh-lIIi-I";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Categorias "falsas" dentro de Playbooks: nao vem da BD, sao geradores de
// YAML tratados a parte, tal como a Calculadora de Subnets e a sua propria
// tab sintetica. Icones diferentes (🧱 vs ☸️) para nao confundir um
// template Heat com um manifesto Kubernetes so pelo nome na lista.
const HEAT_GENERATOR_CATEGORY_LABEL = "Gerar Stack (YAML)";
const K8S_GENERATOR_CATEGORY_LABEL = "Gerar Manifesto (K8s)";
const YAML_CHECKER_CATEGORY_LABEL = "Verificar YAML";

const CATEGORY_ICON = {
    Linux: "🐧", Kubernetes: "☸️", OpenStack: "☁️", Geral: "🧭",
    Docker: "🐳", Redes: "🌐", Bash: "💻", Python: "🐍", Troubleshooting: "🔧",
    [HEAT_GENERATOR_CATEGORY_LABEL]: "🧱",
    [K8S_GENERATOR_CATEGORY_LABEL]: "☸️",
    [YAML_CHECKER_CATEGORY_LABEL]: "🩺",
};
const FALLBACK_ICONS = ["📄", "📦", "🔩", "🧩", "🗃️"];

const COPY_ICON_SVG =
    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
    'stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px">' +
    '<rect x="9" y="9" width="13" height="13" rx="2"/>' +
    '<path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>' +
    "</svg>";
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
    expandedSubcategory: "",
    expandedPlaybooks: false,
    expandedLinks: false,
    favoritesOnly: false,
    query: "",
    items: [],
    commandCategories: [],
    subcategoriesByCategory: {},
    scenarioCategories: [],
    linkCategories: [],
    pin: sessionStorage.getItem("cabula_pin") || "",
};

const $ = (sel) => document.querySelector(sel);
const listEl = $("#list");
const navTree = $("#nav-tree");
const breadcrumb = $("#breadcrumb");

// Regista que um comando foi copiado (usado para ordenar a Home pelos mais
// usados). Best-effort: nao bloqueia a copia nem mostra erro se falhar.
function bumpUsage(id) {
    supabase.rpc("increment_command_usage", { p_id: Number(id) }).then(() => {});
    const item = state.items.find((i) => String(i.id) === String(id));
    if (item) item.usage_count = (item.usage_count || 0) + 1;
}

function toast(msg, isError = false) {
    const el = $("#toast");
    el.textContent = msg;
    el.style.background = isError ? "var(--negative)" : "var(--primary)";
    el.classList.add("show");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.remove("show"), 2500);
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
    state.expandedSubcategory = "";
    goTo("commands", category, "");
}

function toggleSubExpand(category, subName) {
    const key = `${category}::${subName}`;
    state.expandedSubcategory = state.expandedSubcategory === key ? "" : key;
    goTo("commands", category, subName);
}

function togglePlaybooksExpand() {
    state.expandedPlaybooks = !state.expandedPlaybooks;
    goTo("scenarios");
}

function toggleLinksExpand() {
    state.expandedLinks = !state.expandedLinks;
    goTo("links");
}

// Uma subcategoria pode ter um "/" para indicar um 2º nivel (ex:
// "Rede/Floating" agrupa tudo o que é sobre IPs flutuantes dentro de
// "Rede"). Sem "/" fica ao nivel de topo, como sempre.
async function loadCommandCategories() {
    const { data, error } = await supabase.from("commands").select("category, subcategory");
    if (error) return { categories: [], byCategory: {} };
    const byCategory = {};
    data.forEach((d) => {
        if (!d.category) return;
        if (!byCategory[d.category]) byCategory[d.category] = new Map();
        if (!d.subcategory) return;
        const [parent, child] = d.subcategory.split("/").map((s) => s.trim());
        const map = byCategory[d.category];
        if (!map.has(parent)) map.set(parent, new Set());
        if (child) map.get(parent).add(child);
    });
    const categories = Object.keys(byCategory).sort();
    const result = {};
    categories.forEach((c) => {
        const map = byCategory[c];
        result[c] = [...map.keys()].sort().map((name) => ({ name, children: [...map.get(name)].sort() }));
    });
    return { categories, byCategory: result };
}

async function loadScenarioCategories() {
    const { data, error } = await supabase.from("scenarios").select("category");
    if (error) return [];
    return [...new Set(data.map((d) => d.category).filter(Boolean))].sort();
}

async function loadLinkCategories() {
    const { data, error } = await supabase.from("links").select("category");
    if (error) return [];
    return [...new Set(data.map((d) => d.category).filter(Boolean))].sort();
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
        html += navItemHtml(`cat-${c}`, iconFor(c), c, isActive, isExpanded ? "expanded" : "");
        handlers[`cat-${c}`] = () => toggleExpand(c);

        if (isExpanded) {
            const subs = state.subcategoriesByCategory[c] || [];
            if (subs.length) {
                html += `<li><ul class="nav-tree">`;
                subs.forEach((sub) => {
                    const hasChildren = sub.children.length > 0;
                    const subActive = state.tab === "commands" && state.category === c && state.subcategory === sub.name;
                    const subKey = `${c}::${sub.name}`;
                    const subExpanded = state.expandedSubcategory === subKey;
                    html += navItemHtml(
                        `sub-${c}-${sub.name}`,
                        "—",
                        sub.name,
                        subActive,
                        `sub${hasChildren && subExpanded ? " expanded" : ""}`
                    );
                    handlers[`sub-${c}-${sub.name}`] = hasChildren
                        ? () => toggleSubExpand(c, sub.name)
                        : () => goTo("commands", c, sub.name);

                    if (hasChildren && subExpanded) {
                        html += `<li><ul class="nav-tree">`;
                        sub.children.forEach((child) => {
                            const fullPath = `${sub.name}/${child}`;
                            const childActive = state.tab === "commands" && state.category === c && state.subcategory === fullPath;
                            html += navItemHtml(`sub-${c}-${sub.name}-${child}`, "—", child, childActive, "sub");
                            handlers[`sub-${c}-${sub.name}-${child}`] = () => goTo("commands", c, fullPath);
                        });
                        html += `</ul></li>`;
                    }
                });
                html += `</ul></li>`;
            }
        }
    });

    html += navItemHtml("glossary", "📘", "Conceitos", !state.favoritesOnly && state.tab === "glossary");
    handlers.glossary = () => goTo("glossary");

    const linksActive = !state.favoritesOnly && state.tab === "links" && !state.category;
    html += navItemHtml("links", "🔗", "Links Úteis", linksActive, state.expandedLinks ? "expanded" : "");
    handlers.links = toggleLinksExpand;
    if (state.expandedLinks && state.linkCategories.length) {
        html += `<li><ul class="nav-tree">`;
        state.linkCategories.forEach((c) => {
            const active = !state.favoritesOnly && state.tab === "links" && state.category === c;
            html += navItemHtml(`lk-${c}`, iconFor(c), c, active, "sub");
            handlers[`lk-${c}`] = () => goTo("links", c);
        });
        html += `</ul></li>`;
    }

    const playbooksActive = !state.favoritesOnly && state.tab === "scenarios" && !state.category;
    html += navItemHtml("scenarios", "🗂️", "Playbooks", playbooksActive, state.expandedPlaybooks ? "expanded" : "");
    handlers.scenarios = togglePlaybooksExpand;
    if (state.expandedPlaybooks && state.scenarioCategories.length) {
        html += `<li><ul class="nav-tree">`;
        state.scenarioCategories.forEach((c) => {
            const active = !state.favoritesOnly && state.tab === "scenarios" && state.category === c;
            html += navItemHtml(`sc-${c}`, iconFor(c), c, active, "sub");
            handlers[`sc-${c}`] = () => goTo("scenarios", c);
        });
        html += `</ul></li>`;
    }

    html += navItemHtml("subnet", "🧮", "Calc. de Subnets", !state.favoritesOnly && state.tab === "subnet");
    handlers.subnet = () => goTo("subnet");
    html += navItemHtml("favorites", "⭐", "Favoritos", state.favoritesOnly);
    handlers.favorites = goToFavorites;

    navTree.innerHTML = html;
    Object.entries(handlers).forEach(([key, fn]) => {
        navTree.querySelector(`[data-key="${key}"]`).onclick = fn;
    });
}

$("#search").oninput = (e) => {
    state.query = e.target.value;
    if (state.tab === "subnet" && !state.favoritesOnly) return;
    render();
};

$("#add-btn").onclick = () => {
    if (!requirePin()) return;
    openItemDialog(null);
};

// ---------------------------------------------------------------------
// Command palette (Ctrl/Cmd+K) — pesquisa rapida de comandos por cima da
// pagina, sem ter de ir ate a barra lateral.
// ---------------------------------------------------------------------

let paletteCommands = null; // cache da 1ª abertura; refeito a cada load da pagina
let paletteResults = [];
let paletteActiveIndex = 0;
let paletteCategoryFilter = null; // null = todas as categorias

function paletteCategories() {
    return [...new Set((paletteCommands || []).map((c) => c.category).filter(Boolean))].sort();
}

// Tab avanca para a categoria seguinte (por ordem alfabetica), Shift+Tab
// recua; passar do ultimo/primeiro volta a "todas as categorias" (null).
function cyclePaletteCategory(direction) {
    const cats = paletteCategories();
    if (!cats.length) return;
    if (paletteCategoryFilter === null) {
        paletteCategoryFilter = direction > 0 ? cats[0] : cats[cats.length - 1];
    } else {
        const nextIdx = cats.indexOf(paletteCategoryFilter) + direction;
        paletteCategoryFilter = nextIdx < 0 || nextIdx >= cats.length ? null : cats[nextIdx];
    }
    renderPaletteResults($("#palette-input").value);
}

function updatePaletteFilterLabel() {
    const el = $("#palette-filter");
    el.innerHTML = paletteCategoryFilter
        ? `Categoria: <b>${escapeHtml(paletteCategoryFilter)}</b> · <span class="kbd-chip">Tab</span> seguinte · <span class="kbd-chip">Shift Tab</span> anterior`
        : `Todas as categorias · <span class="kbd-chip">Tab</span> para filtrar`;
}

async function openPalette() {
    const input = $("#palette-input");
    input.value = "";
    paletteCategoryFilter = null;
    if (!paletteCommands) {
        const { data } = await supabase.from("commands").select("id, command, description, category, subcategory, tags");
        paletteCommands = data || [];
    }
    renderPaletteResults("");
    $("#palette-dialog").showModal();
    input.focus();
}

function renderPaletteResults(q) {
    q = q.toLowerCase().trim();
    const byRelevance = (a, b) => (b.usage_count || 0) - (a.usage_count || 0);
    const pool = paletteCategoryFilter ? paletteCommands.filter((c) => c.category === paletteCategoryFilter) : paletteCommands;
    paletteResults = (
        !q
            ? [...pool].sort(byRelevance)
            : pool.filter((c) => [c.command, c.description, c.tags].some((f) => (f || "").toLowerCase().includes(q))).sort(byRelevance)
    ).slice(0, 30);
    paletteActiveIndex = 0;
    updatePaletteFilterLabel();
    const el = $("#palette-results");
    if (!paletteResults.length) {
        el.innerHTML = '<div class="palette-empty">// nada encontrado</div>';
        return;
    }
    el.innerHTML = paletteResults
        .map(
            (c, i) => `<button class="palette-item${i === 0 ? " active" : ""}" data-idx="${i}">
                <div class="mono">${escapeHtml(c.command)}</div>
                <div class="desc">${escapeHtml(c.description)}</div>
            </button>`
        )
        .join("");
    el.querySelectorAll(".palette-item").forEach((btn) => {
        btn.onclick = () => selectPaletteItem(Number(btn.dataset.idx));
    });
}

function movePaletteActive(delta) {
    if (!paletteResults.length) return;
    paletteActiveIndex = (paletteActiveIndex + delta + paletteResults.length) % paletteResults.length;
    const items = $("#palette-results").querySelectorAll(".palette-item");
    items.forEach((el, i) => el.classList.toggle("active", i === paletteActiveIndex));
    items[paletteActiveIndex]?.scrollIntoView({ block: "nearest" });
}

function selectPaletteItem(idx) {
    const item = paletteResults[idx];
    if (!item) return;
    navigator.clipboard.writeText(item.command);
    toast("Comando copiado");
    bumpUsage(item.id);
    $("#palette-dialog").close();
    state.expandedCategory = item.category;
    goTo("commands", item.category, item.subcategory || "");
}

document.addEventListener("keydown", (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        openPalette();
    }
});
$("#palette-input").oninput = (e) => renderPaletteResults(e.target.value);
$("#palette-input").onkeydown = (e) => {
    if (e.key === "ArrowDown") {
        e.preventDefault();
        movePaletteActive(1);
    } else if (e.key === "ArrowUp") {
        e.preventDefault();
        movePaletteActive(-1);
    } else if (e.key === "Enter") {
        e.preventDefault();
        selectPaletteItem(paletteActiveIndex);
    } else if (e.key === "Tab") {
        e.preventDefault();
        cyclePaletteCategory(e.shiftKey ? -1 : 1);
    }
};

// ---------------------------------------------------------------------
// Dialogo de atalhos de teclado ("?")
// ---------------------------------------------------------------------

function isTypingTarget(el) {
    const tag = (el.tagName || "").toLowerCase();
    return tag === "input" || tag === "textarea" || tag === "select" || el.isContentEditable;
}

$("#shortcuts-btn").onclick = () => $("#shortcuts-dialog").showModal();
$("#shortcuts-close").onclick = () => $("#shortcuts-dialog").close();
document.addEventListener("keydown", (e) => {
    if (e.key === "?" && !isTypingTarget(document.activeElement)) {
        e.preventDefault();
        $("#shortcuts-dialog").showModal();
    }
});

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

const TABLE_FOR_TAB = { commands: "commands", scenarios: "scenarios", glossary: "glossary", links: "links" };

async function refreshNav() {
    const [{ categories, byCategory }, scenarioCategories, linkCategories] = await Promise.all([
        loadCommandCategories(),
        loadScenarioCategories(),
        loadLinkCategories(),
    ]);
    state.commandCategories = categories;
    state.subcategoriesByCategory = byCategory;
    state.scenarioCategories = [HEAT_GENERATOR_CATEGORY_LABEL, K8S_GENERATOR_CATEGORY_LABEL, YAML_CHECKER_CATEGORY_LABEL, ...scenarioCategories];
    state.linkCategories = linkCategories;
    renderNavTree();
}

async function loadAndRender() {
    renderNavTree();
    listEl.innerHTML = '<div class="empty"><div class="term-loading">❯ <span class="cursor-blink">_</span></div></div>';
    const isHeatGenerator = state.tab === "scenarios" && state.category === HEAT_GENERATOR_CATEGORY_LABEL;
    const isK8sGenerator = state.tab === "scenarios" && state.category === K8S_GENERATOR_CATEGORY_LABEL;
    const isYamlChecker = state.tab === "scenarios" && state.category === YAML_CHECKER_CATEGORY_LABEL;
    $("#add-btn").style.display =
        state.favoritesOnly || state.tab === "subnet" || isHeatGenerator || isK8sGenerator || isYamlChecker ? "none" : "";

    if (state.tab === "subnet" && !state.favoritesOnly) {
        renderBreadcrumb(null);
        renderSubnetCalculator();
        return;
    }

    if (isHeatGenerator && !state.favoritesOnly) {
        renderBreadcrumb(null);
        renderHeatGenerator();
        return;
    }

    if (isK8sGenerator && !state.favoritesOnly) {
        renderBreadcrumb(null);
        renderK8sGenerator();
        return;
    }

    if (isYamlChecker && !state.favoritesOnly) {
        renderBreadcrumb(null);
        renderYamlChecker();
        return;
    }

    if (state.favoritesOnly) {
        const [cmds, scs] = await Promise.all([
            supabase.from("commands").select("*").eq("favorite", true).order("command"),
            supabase.from("scenarios").select("*, scenario_steps(*)").eq("favorite", true).order("title"),
        ]);
        if (cmds.error || scs.error) {
            listEl.innerHTML = `<div class="empty"><div class="empty-code">// erro ao carregar favoritos</div></div>`;
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
    const orderCol =
        state.tab === "commands" ? "command" : state.tab === "scenarios" ? "title" : state.tab === "links" ? "title" : "term";
    // Na Home (sem categoria escolhida) mostra primeiro o que é mais usado,
    // em vez de uma lista alfabética gigante sem sinal nenhum de relevância.
    if (state.tab === "commands" && !state.category) {
        query = query.order("usage_count", { ascending: false, nullsFirst: false }).order(orderCol);
    } else {
        query = query.order(orderCol);
    }
    let { data, error } = await query;
    if (error && state.tab === "commands" && !state.category) {
        // provavelmente a coluna usage_count ainda nao foi migrada no Supabase;
        // tenta outra vez sem ordenar por ela em vez de mostrar erro na Home.
        ({ data, error } = await supabase.from(table).select("*").order(orderCol));
    }
    if (error) {
        listEl.innerHTML = `<div class="empty"><div class="empty-code">// erro ao carregar: ${escapeHtml(error.message)}</div></div>`;
        return;
    }
    state.items = data.map((i) => ({ ...i, _kind: state.tab }));
    render();
}

function currentLabel() {
    if (state.favoritesOnly) return "Favoritos";
    if (state.tab === "glossary") return "Conceitos";
    if (state.tab === "scenarios" && state.category === HEAT_GENERATOR_CATEGORY_LABEL) return HEAT_GENERATOR_CATEGORY_LABEL;
    if (state.tab === "scenarios" && state.category === K8S_GENERATOR_CATEGORY_LABEL) return K8S_GENERATOR_CATEGORY_LABEL;
    if (state.tab === "scenarios" && state.category === YAML_CHECKER_CATEGORY_LABEL) return YAML_CHECKER_CATEGORY_LABEL;
    if (state.tab === "scenarios") return "Playbooks";
    if (state.tab === "links") return "Links Úteis";
    if (state.tab === "subnet") return "Calculadora de Subnets";
    if (state.category && state.subcategory) return `${state.category} / ${state.subcategory.split("/").join(" / ")}`;
    return state.category || "Home";
}

function renderBreadcrumb(count) {
    const suffix = count === null ? "" : ` · ${count} ${count === 1 ? "item" : "itens"}`;
    breadcrumb.innerHTML = `<b>${escapeHtml(currentLabel())}</b>${suffix}`;
}

// ---------------------------------------------------------------------
// Variaveis {{nome}} nos passos dos playbooks
// ---------------------------------------------------------------------

const scenarioVarValues = {}; // { [scenarioId]: { [varName]: valorPreenchido } }
const scenarioVarOptions = {}; // { [scenarioId]: { [varName]: [opcoes extraidas de um output colado] } }
let pasteTarget = null; // { scenarioId, varName }

// playbooks (cenarios) colapsados por defeito — os passos so aparecem depois
// de clicar no titulo do cartao. Guarda os IDs que o utilizador expandiu.
const expandedScenarioCards = new Set();

// ---------------------------------------------------------------------
// Modo checklist nos playbooks: marcar passos como feitos, com progresso
// guardado no localStorage (por playbook), para sobreviver a um reload a
// meio de uma intervencao.
// ---------------------------------------------------------------------

const scenarioStepsDone = {}; // { [scenarioId]: Set(indices de passos concluidos) } — cache em memoria
function loadStepsDone(scenarioId) {
    if (scenarioStepsDone[scenarioId]) return scenarioStepsDone[scenarioId];
    let set = new Set();
    try {
        const raw = localStorage.getItem(`cabula_steps_${scenarioId}`);
        if (raw) set = new Set(JSON.parse(raw));
    } catch {
        set = new Set();
    }
    scenarioStepsDone[scenarioId] = set;
    return set;
}
function saveStepsDone(scenarioId, set) {
    scenarioStepsDone[scenarioId] = set;
    try {
        localStorage.setItem(`cabula_steps_${scenarioId}`, JSON.stringify([...set]));
    } catch {
        // localStorage indisponivel (modo privado, quota, etc.) — falha em silencio,
        // o checklist so deixa de persistir entre reloads, nao bloqueia o uso.
    }
}

// interpreta o output de comandos de tabela (OpenStack "+---+---+", kubectl
// com colunas separadas por 2+ espacos) e devolve a lista de valores da
// coluna mais provavel (procura uma coluna "Name"/"NAME"; senao usa a 2a
// coluna nas tabelas OpenStack ou a 1a nas outras)
function parseTableOutput(raw) {
    const lines = raw.split("\n").map((l) => l.replace(/\r$/, "")).filter((l) => l.trim());
    const pipeLines = lines.filter((l) => l.includes("|") && !/^\+[-+]+\+$/.test(l.trim()));

    if (pipeLines.length >= 2) {
        const rows = pipeLines.map((l) =>
            l.split("|").map((c) => c.trim()).filter((c, i, arr) => !((i === 0 || i === arr.length - 1) && c === ""))
        );
        const header = rows[0].map((h) => h.toLowerCase());
        let colIdx = header.indexOf("name");
        if (colIdx === -1) colIdx = header.length > 1 ? 1 : 0;
        return [...new Set(rows.slice(1).map((r) => r[colIdx]).filter(Boolean))];
    }

    const dataLines = lines.filter((l) => !l.trim().startsWith("$"));
    if (dataLines.length < 2) return [];
    const header = dataLines[0].trim().split(/\s{2,}/).map((h) => h.toLowerCase());
    let colIdx = header.indexOf("name");
    if (colIdx === -1) colIdx = 0;
    return [...new Set(
        dataLines.slice(1).map((l) => (l.trim().split(/\s{2,}/)[colIdx] || "").trim()).filter(Boolean)
    )];
}

$("#paste-cancel").onclick = () => $("#paste-dialog").close();
$("#paste-use").onclick = () => {
    if (!pasteTarget) return;
    const options = parseTableOutput($("#paste-textarea").value);
    if (!options.length) {
        toast("Não consegui identificar uma lista de valores nesse texto", true);
        return;
    }
    const { scenarioId, varName } = pasteTarget;
    if (scenarioId === HEAT_GEN_PASTE_TARGET) {
        heatGenState.pasteOptions[varName] = options;
        heatGenState.values[varName] = options[0];
        $("#paste-textarea").value = "";
        $("#paste-dialog").close();
        renderHeatGenerator();
        return;
    }
    if (scenarioId === K8S_GEN_PASTE_TARGET) {
        k8sGenState.pasteOptions[varName] = options;
        k8sGenState.values[varName] = options[0];
        $("#paste-textarea").value = "";
        $("#paste-dialog").close();
        renderK8sGenerator();
        return;
    }
    scenarioVarOptions[scenarioId] = scenarioVarOptions[scenarioId] || {};
    scenarioVarOptions[scenarioId][varName] = options;
    scenarioVarValues[scenarioId] = scenarioVarValues[scenarioId] || {};
    scenarioVarValues[scenarioId][varName] = options[0];
    $("#paste-textarea").value = "";
    $("#paste-dialog").close();
    render();
};

function extractVars(text) {
    const matches = (text || "").matchAll(/\{\{(\w+)\}\}/g);
    return [...new Set([...matches].map((m) => m[1]))];
}
function prettifyVar(name) {
    const s = name.replace(/_/g, " ");
    return s.charAt(0).toUpperCase() + s.slice(1);
}

const VAR_HINTS = {
    nome_chave: "Nome que vais dar ao par de chaves SSH (é criado agora, não precisas de o consultar antes). Ex.: minha-chave.",
    grupo_seguranca: "Nome do grupo de segurança (firewall). Consulta os existentes com 'openstack security group list', ou inventa um nome novo se estiveres a criar um.",
    imagem: "Nome da imagem do sistema operativo a usar. Consulta com 'openstack image list' (usa o botão 📥 para colar o resultado e escolher).",
    flavor: "Tamanho da instância (vCPUs/RAM/disco). Consulta com 'openstack flavor list'.",
    rede: "Rede interna onde a instância vai ficar. Consulta com 'openstack network list'.",
    rede_externa: "Rede externa/pública usada para o IP flutuante. Consulta com 'openstack network list' (normalmente chamada 'ext-net' ou 'public').",
    nome_servidor: "Nome que a instância vai ter (à tua escolha, ou consulta as já existentes com 'openstack server list').",
    ip_publico: "IP flutuante (público). Consulta os já reservados com 'openstack floating ip list', ou usa o que acabaste de criar.",
    namespace: "Namespace do Kubernetes. Consulta com 'kubectl get namespaces'.",
    nome_pod: "Nome exato do pod. Consulta com 'kubectl get pods' (ou 'kubectl get pods -A' para todos os namespaces).",
    nome_no: "Nome exato do nó do cluster. Consulta com 'kubectl get nodes'.",
    diretoria: "Caminho da pasta a verificar (ex.: /var/log). Ajusta consoante o que 'df -h' apontou como cheio.",
    padrao: "Padrão de nome de ficheiro a procurar (ex.: *.log ou *.tmp).",
    nome_arquivo: "Nome a dar ao ficheiro comprimido que vais criar (ex.: backup.tar.gz).",
    pasta: "Caminho da pasta a arquivar/comprimir.",
    caminho_a_apagar: "Caminho exato a remover. Confirma bem antes de correr — 'rm -rf' é irreversível.",
    utilizador: "Utilizador remoto para a ligação SSH (ex.: ubuntu, root, azureuser).",
    host: "IP ou nome do servidor a que te vais ligar.",
    dominio: "Domínio a testar (ex.: exemplo.com).",
    porta: "Número da porta de rede a verificar (ex.: 443, 22, 8080).",
    servico: "Nome do serviço systemd (ex.: nginx, docker). Consulta com 'systemctl list-units --type=service'.",
    id_porta: "ID da porta de rede (Neutron) ligada à instância. Consulta com 'openstack port list --server <nome-da-instância>'.",
    subrede: "Sub-rede a verificar. Consulta com 'openstack subnet list'.",
    router: "Router a verificar. Consulta com 'openstack router list'.",
};
function varHint(name) {
    return VAR_HINTS[name] || `Substitui pelo valor real de "${prettifyVar(name).toLowerCase()}" antes de copiar o comando.`;
}

// so estas variaveis correspondem a um comando de listagem real (com uma
// tabela de onde se consegue tirar valores) — as outras sao "inventadas"
// pelo utilizador (nomes novos, caminhos, etc.) e nao tem output nenhum
// para colar, por isso nao mostram o botao de colar output.
const VAR_LIST_COMMAND = {
    imagem: "openstack image list",
    flavor: "openstack flavor list",
    rede: "openstack network list",
    rede_externa: "openstack network list",
    ip_publico: "openstack floating ip list",
    namespace: "kubectl get namespaces",
    nome_pod: "kubectl get pods",
    nome_no: "kubectl get nodes",
    id_porta: "openstack port list",
    subrede: "openstack subnet list",
    router: "openstack router list",
};
// realca flags (--proto, -v, etc.) num texto ja escapado para HTML — exige
// que a "-" venha logo a seguir a um espaco ou ao inicio, para nao apanhar
// travessoes dentro de palavras (ex: "m1.custom" fica intacto).
function highlightFlags(escapedText) {
    return escapedText.replace(/(^|\s)(--?[A-Za-z][\w-]*)/g, (m, pre, flag) => `${pre}<span class="tpl-flag">${flag}</span>`);
}

function renderTemplate(text, values) {
    return (text || "")
        .split(/("[^"]*")/g)
        .map((part) => {
            if (part.startsWith('"') && part.endsWith('"')) {
                return `<span class="tpl-filled">${escapeHtml(part)}</span>`;
            }
            const withVars = escapeHtml(part).replace(/\{\{(\w+)\}\}/g, (match, name) => {
                const val = values[name];
                return val
                    ? `<span class="tpl-filled">${escapeHtml(val)}</span>`
                    : `<span class="tpl-empty">${match}</span>`;
            });
            return highlightFlags(withVars);
        })
        .join("");
}
// realca em verde as partes entre aspas de um comando/exemplo (ex: "ext-net"),
// tipicamente o que o utilizador deve substituir, e as flags (--proto, -v)
// num tom mais discreto — da uma leitura mais rapida tipo syntax highlighting.
function highlightEditable(text) {
    return (text || "")
        .split(/("[^"]*")/g)
        .map((part) => (part.startsWith('"') && part.endsWith('"') ? `<span class="tpl-filled">${escapeHtml(part)}</span>` : highlightFlags(escapeHtml(part))))
        .join("");
}

function resolveTemplate(text, values) {
    return (text || "").replace(/\{\{(\w+)\}\}/g, (match, name) => values[name] || match);
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
    if (item._kind === "links") {
        return [item.title, item.description, item.url].some((f) => (f || "").toLowerCase().includes(q));
    }
    return [item.term, item.definition].some((f) => (f || "").toLowerCase().includes(q));
}

function render() {
    const filtered = state.items
        .filter((i) => !state.category || i.category === state.category)
        .filter(
            (i) =>
                !state.subcategory ||
                i.subcategory === state.subcategory ||
                (i.subcategory || "").startsWith(state.subcategory + "/")
        )
        .filter((i) => matchesQuery(i, state.query));

    renderBreadcrumb(filtered.length);

    if (!filtered.length) {
        listEl.innerHTML = '<div class="empty"><div class="empty-code">// nada encontrado</div></div>';
        return;
    }

    listEl.innerHTML = filtered.map((item) => renderCard(item)).join("");
    listEl.querySelectorAll("[data-copy]").forEach((btn) => {
        btn.onclick = () => {
            navigator.clipboard.writeText(btn.dataset.copy);
            toast("Comando copiado");
            if (btn.dataset.copyId) bumpUsage(btn.dataset.copyId);
        };
    });
    listEl.querySelectorAll("[data-seealso]").forEach((btn) => {
        btn.onclick = () => {
            navigator.clipboard.writeText(btn.dataset.seealso);
            toast("Comando copiado");
            bumpUsage(btn.dataset.seealsoId);
        };
    });
    listEl.querySelectorAll("[data-fav]").forEach((btn) => (btn.onclick = () => toggleFavorite(btn.dataset.fav, btn.dataset.kind)));
    listEl.querySelectorAll("[data-edit]").forEach((btn) => (btn.onclick = () => onEdit(btn.dataset.edit)));
    listEl.querySelectorAll("[data-del]").forEach((btn) => (btn.onclick = () => onDelete(btn.dataset.del, btn.dataset.kind)));
    listEl.querySelectorAll("[data-toggle-scenario]").forEach((btn) => {
        btn.onclick = () => {
            const id = btn.dataset.toggleScenario;
            if (expandedScenarioCards.has(id)) expandedScenarioCards.delete(id);
            else expandedScenarioCards.add(id);
            render();
        };
    });
    listEl.querySelectorAll("[data-step-toggle]").forEach((btn) => {
        btn.onclick = () => {
            const sid = btn.dataset.scenario;
            const idx = Number(btn.dataset.stepIdx);
            const set = loadStepsDone(sid);
            if (set.has(idx)) set.delete(idx);
            else set.add(idx);
            saveStepsDone(sid, set);
            render();
        };
    });
    listEl.querySelectorAll("[data-reset-steps]").forEach((btn) => {
        btn.onclick = () => {
            const sid = btn.dataset.resetSteps;
            saveStepsDone(sid, new Set());
            render();
        };
    });
    listEl.querySelectorAll("[data-share]").forEach((btn) => {
        btn.onclick = () => {
            const url = `${location.origin}${location.pathname}?kind=${btn.dataset.shareKind}&id=${btn.dataset.share}`;
            navigator.clipboard.writeText(url);
            toast("Link copiado");
        };
    });

    listEl.querySelectorAll(".tpl-input, .tpl-select").forEach((inp) => {
        inp.oninput = () => {
            const sid = inp.dataset.scenario;
            scenarioVarValues[sid] = scenarioVarValues[sid] || {};
            scenarioVarValues[sid][inp.dataset.var] = inp.value;
            updateScenarioCommands(sid);
        };
    });
    listEl.querySelectorAll("[data-paste-var]").forEach((btn) => {
        btn.onclick = () => {
            pasteTarget = { scenarioId: btn.dataset.scenario, varName: btn.dataset.var };
            const suggestion = VAR_LIST_COMMAND[pasteTarget.varName];
            $("#paste-suggestion").innerHTML = suggestion
                ? `Corre <span class="mono" style="font-size:0.8rem">${escapeHtml(suggestion)}</span> e cola o resultado abaixo.`
                : "";
            $("#paste-dialog").showModal();
        };
    });
    listEl.querySelectorAll("[data-clear-options]").forEach((btn) => {
        btn.onclick = () => {
            const sid = btn.dataset.scenario;
            delete (scenarioVarOptions[sid] || {})[btn.dataset.var];
            render();
        };
    });
    listEl.querySelectorAll("[data-copy-scenario]").forEach((btn) => {
        btn.onclick = () => {
            const sid = btn.dataset.copyScenario;
            const idx = Number(btn.dataset.copyIndex);
            const scenario = state.items.find((i) => String(i.id) === String(sid));
            const steps = (scenario?.scenario_steps || []).sort((a, b) => a.position - b.position);
            const text = resolveTemplate(steps[idx]?.command || "", scenarioVarValues[sid] || {});
            navigator.clipboard.writeText(text);
            toast("Comando copiado");
        };
    });
}

function updateScenarioCommands(sid) {
    const scenario = state.items.find((i) => String(i.id) === String(sid));
    if (!scenario) return;
    const steps = (scenario.scenario_steps || []).sort((a, b) => a.position - b.position);
    const values = scenarioVarValues[sid] || {};
    steps.forEach((s, idx) => {
        const el = document.getElementById(`step-cmd-${sid}-${idx}`);
        if (el) el.innerHTML = renderTemplate(s.command, values);
    });
}

function siblingCommands(item) {
    if (!item.subcategory) return [];
    return state.items.filter(
        (i) => i._kind === "commands" && i.id !== item.id && i.category === item.category && i.subcategory === item.subcategory
    );
}

function renderCard(item) {
    const icon = iconFor(item.category);
    const favIcon = item.favorite ? "⭐" : "☆";
    if (item._kind === "commands") {
        const siblings = siblingCommands(item).slice(0, 6);
        return `<div class="entry">
            <div class="entry-top">
                <div class="entry-body">
                    <span class="badge">${icon} ${escapeHtml(item.category)}${item.subcategory ? " / " + escapeHtml(item.subcategory.split("/").join(" / ")) : ""}</span>${item.usage_count ? `<span class="usage-count" title="Vezes copiado">🔥 ${item.usage_count}×</span>` : ""}
                    <div class="mono">${highlightEditable(item.command)}</div>
                    <div class="desc">${escapeHtml(item.description)}</div>
                    ${item.example ? `<div class="mono" style="margin-top:6px;font-size:0.82rem">${highlightEditable(item.example)}</div>` : ""}
                    ${item.notes ? `<div class="desc" style="margin-top:6px">💡 ${escapeHtml(item.notes)}</div>` : ""}
                    ${item.tags ? `<div class="tags-line">🏷️ ${escapeHtml(item.tags)}</div>` : ""}
                    ${
                        siblings.length
                            ? `<div class="see-also">👀 Ver também: ${siblings
                                  .map(
                                      (s) =>
                                          `<button class="see-also-item" data-seealso="${escapeAttr(s.command)}" data-seealso-id="${s.id}">${escapeHtml(s.command)}</button>`
                                  )
                                  .join("")}</div>`
                            : ""
                    }
                </div>
                <div class="actions">
                    <button data-copy="${escapeAttr(item.command)}" data-copy-id="${item.id}" title="Copiar">${COPY_ICON_SVG}</button>
                    <button data-share="${item.id}" data-share-kind="commands" title="Copiar link direto">🔗</button>
                    <button data-fav="${item.id}" data-kind="commands" title="Favorito">${favIcon}</button>
                    <button data-edit="${item.id}" title="Editar">✏️</button>
                    <button data-del="${item.id}" data-kind="commands" title="Apagar">🗑️</button>
                </div>
            </div>
        </div>`;
    }
    if (item._kind === "scenarios") {
        const steps = (item.scenario_steps || []).sort((a, b) => a.position - b.position);
        const vars = [...new Set(steps.flatMap((s) => extractVars(s.command)))];
        const values = scenarioVarValues[item.id] || {};
        const expanded = expandedScenarioCards.has(String(item.id));

        const varOptions = scenarioVarOptions[item.id] || {};
        const varsPanel = vars.length
            ? `<div class="tpl-vars">${vars
                  .map((v) => {
                      const options = varOptions[v];
                      const field = options
                          ? `<select class="tpl-select" data-scenario="${item.id}" data-var="${escapeAttr(v)}">
                                ${options
                                    .map(
                                        (o) =>
                                            `<option value="${escapeAttr(o)}" ${values[v] === o ? "selected" : ""}>${escapeHtml(o)}</option>`
                                    )
                                    .join("")}
                            </select>
                            <button class="tpl-control-btn" data-clear-options data-scenario="${item.id}" data-var="${escapeAttr(v)}" title="Voltar a texto livre">✕</button>`
                          : `<input class="tpl-input" data-scenario="${item.id}" data-var="${escapeAttr(v)}"
                               placeholder="${escapeAttr(v)}" value="${escapeAttr(values[v] || "")}">
                            ${
                                VAR_LIST_COMMAND[v]
                                    ? `<button class="tpl-control-btn" data-paste-var data-scenario="${item.id}" data-var="${escapeAttr(v)}" title="Colar output e criar lista">📥</button>`
                                    : ""
                            }`;
                      return `<div class="tpl-var-field">
                        <label>${escapeHtml(prettifyVar(v))} <span class="tpl-hint" title="${escapeAttr(varHint(v))}">?</span></label>
                        <div class="tpl-control">${field}</div>
                    </div>`;
                  })
                  .join("")}</div>`
            : "";

        const doneSet = loadStepsDone(item.id);
        const doneCount = steps.reduce((n, _, idx) => n + (doneSet.has(idx) ? 1 : 0), 0);
        const progressPct = steps.length ? Math.round((doneCount / steps.length) * 100) : 0;

        return `<div class="entry">
            <div class="entry-top">
                <div class="entry-body">
                    <span class="badge">${icon} ${escapeHtml(item.category)}</span>
                    <button class="entry-title scenario-toggle" data-toggle-scenario="${item.id}" style="background:none;border:none;padding:0;cursor:pointer;display:flex;align-items:center;gap:6px;text-align:left;color:inherit;font:inherit">
                        <span style="display:inline-block;transition:transform 0.15s;transform:rotate(${expanded ? "90deg" : "0deg"})">▸</span>
                        ${escapeHtml(item.title)}
                        <span class="desc" style="margin:0;font-weight:400">(${steps.length} ${steps.length === 1 ? "passo" : "passos"}${doneCount ? ` · ${doneCount} feito${doneCount === 1 ? "" : "s"}` : ""})</span>
                    </button>
                    ${item.description ? `<div class="desc">${escapeHtml(item.description)}</div>` : ""}
                    ${
                        expanded
                            ? `${
                                  steps.length
                                      ? `<div class="step-progress">
                                    <div class="step-progress-bar"><div class="step-progress-fill" style="width:${progressPct}%"></div></div>
                                    <span>${doneCount}/${steps.length}</span>
                                    ${doneCount ? `<button class="step-reset" data-reset-steps="${item.id}">Reiniciar</button>` : ""}
                                </div>`
                                      : ""
                              }
                    ${varsPanel}
                    ${steps
                        .map((s, idx) => {
                            const done = doneSet.has(idx);
                            return `<div class="step${done ? " step-done" : ""}">
                                    <div style="display:flex;align-items:center;gap:6px">
                                        ${
                                            s.command
                                                ? `<button class="step-check" data-step-toggle data-scenario="${item.id}" data-step-idx="${idx}" title="${done ? "Marcar como por fazer" : "Marcar como feito"}">${done ? "✅" : "⬜"}</button>`
                                                : ""
                                        }
                                        <span class="mono step-cmd" id="step-cmd-${item.id}-${idx}">${renderTemplate(s.command, values)}</span>
                                        ${s.command ? `<button class="step-copy" data-copy-scenario="${item.id}" data-copy-index="${idx}" title="Copiar">${COPY_ICON_SVG}</button>` : ""}
                                    </div>
                                    ${s.note ? `<div class="desc">${escapeHtml(s.note)}</div>` : ""}
                                </div>`;
                        })
                        .join("")}`
                            : ""
                    }
                </div>
                <div class="actions">
                    <button data-share="${item.id}" data-share-kind="scenarios" title="Copiar link direto">🔗</button>
                    <button data-fav="${item.id}" data-kind="scenarios" title="Favorito">${favIcon}</button>
                    <button data-edit="${item.id}" title="Editar">✏️</button>
                    <button data-del="${item.id}" data-kind="scenarios" title="Apagar">🗑️</button>
                </div>
            </div>
        </div>`;
    }
    if (item._kind === "links") {
        return `<div class="entry">
            <div class="entry-top">
                <div class="entry-body">
                    <span class="badge">${icon} ${escapeHtml(item.category)}</span>
                    <div class="entry-title">
                        <a href="${escapeAttr(item.url)}" target="_blank" rel="noopener" style="color:inherit;text-decoration:none">
                            ${escapeHtml(item.title)} ↗
                        </a>
                    </div>
                    ${item.description ? `<div class="desc">${escapeHtml(item.description)}</div>` : ""}
                    <div class="tags-line">${escapeHtml(item.url)}</div>
                </div>
                <div class="actions">
                    <button data-share="${item.id}" data-share-kind="links" title="Copiar link direto">🔗</button>
                    <button data-edit="${item.id}" title="Editar">✏️</button>
                    <button data-del="${item.id}" data-kind="links" title="Apagar">🗑️</button>
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
                <button data-share="${item.id}" data-share-kind="glossary" title="Copiar link direto">🔗</button>
                <button data-edit="${item.id}" title="Editar">✏️</button>
                <button data-del="${item.id}" data-kind="glossary" title="Apagar">🗑️</button>
            </div>
        </div>
    </div>`;
}

function escapeHtml(s) {
    // String(s ?? "") em vez de (s || "") — aceita numeros/outros tipos sem
    // rebentar (ex: valores numericos por defeito em campos do gerador K8s),
    // so trata null/undefined como vazio (0 continua "0", nao "").
    return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
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
    const fn = { commands: "delete_command", scenarios: "delete_scenario", glossary: "delete_term", links: "delete_link" }[kind];
    const { error } = await supabase.rpc(fn, { pin: state.pin, p_id: Number(id) });
    if (error) return toast(error.message, true);
    toast("Apagado");
    if (kind === "commands" || kind === "scenarios" || kind === "links") await refreshNav();
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
            <div class="form-row"><label>Subcategoria (opcional)</label><input class="f-subcategory" placeholder="ex: Rede/Floating para um 2º nível" value="${escapeAttr(item?.subcategory)}"></div>
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
    if (kind === "links") {
        return `<h3>${title} link</h3>
            <div class="form-row"><label>Título</label><input class="f-title" value="${escapeAttr(item?.title)}"></div>
            <div class="form-row"><label>URL</label><input class="f-url" value="${escapeAttr(item?.url)}" placeholder="https://..."></div>
            <div class="form-row"><label>Descrição</label><textarea class="f-description" rows="2">${escapeHtml(item?.description)}</textarea></div>
            <div class="form-row"><label>Categoria</label><input class="f-category" value="${escapeAttr(item?.category || "Geral")}"></div>
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
    } else if (kind === "links") {
        const payload = {
            p_title: dlg.querySelector(".f-title").value.trim(),
            p_url: dlg.querySelector(".f-url").value.trim(),
            p_description: dlg.querySelector(".f-description").value.trim(),
            p_category: dlg.querySelector(".f-category").value.trim() || "Geral",
        };
        if (!payload.p_title || !payload.p_url) return toast("Título e URL são obrigatórios", true);
        const fn = item ? "update_link" : "add_link";
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
    if (kind === "commands" || kind === "scenarios" || kind === "links") await refreshNav();
    loadAndRender();
}

// ---------------------------------------------------------------------
// Calculadora de subnets IPv4
// ---------------------------------------------------------------------

function ipToInt(ip) {
    const parts = ip.split(".");
    if (parts.length !== 4 || parts.some((p) => !/^\d+$/.test(p) || Number(p) > 255)) return null;
    return parts.reduce((acc, p) => (acc << 8) + Number(p), 0) >>> 0;
}
function intToIp(n) {
    return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join(".");
}
function intToBinary(n) {
    return n.toString(2).padStart(32, "0").match(/.{8}/g).join(".");
}

function maskForPrefix(prefix) {
    return prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
}

function cidrDetails(ip, prefix) {
    const maskInt = maskForPrefix(prefix);
    const wildcardInt = (~maskInt) >>> 0;
    const network = (ip & maskInt) >>> 0;
    const broadcast = (network | wildcardInt) >>> 0;
    const totalAddresses = 2 ** (32 - prefix);
    const usableHosts = prefix >= 31 ? 0 : totalAddresses - 2;
    const firstHost = prefix >= 31 ? network : network + 1;
    const lastHost = prefix >= 31 ? broadcast : broadcast - 1;
    return {
        prefix, network: intToIp(network), broadcast: intToIp(broadcast),
        netmask: intToIp(maskInt), wildcard: intToIp(wildcardInt),
        firstHost: intToIp(firstHost >>> 0), lastHost: intToIp(lastHost >>> 0),
        totalAddresses, usableHosts,
        networkBinary: intToBinary(network), maskBinary: intToBinary(maskInt),
    };
}

// devolve a lista minima de blocos CIDR que cobre exatamente [start, end]
// (algoritmo classico de "IP range to CIDR")
function rangeToCidrs(start, end) {
    const blocks = [];
    while (end >= start) {
        let maxSize = 32;
        while (maxSize > 0) {
            const mask = maskForPrefix(maxSize - 1);
            if ((start & mask) >>> 0 !== start) break;
            maxSize--;
        }
        const spanBits = Math.floor(Math.log2(end - start + 1));
        const minPrefix = 32 - spanBits;
        if (maxSize < minPrefix) maxSize = minPrefix;
        blocks.push(`${intToIp(start)}/${maxSize}`);
        start = (start + 2 ** (32 - maxSize)) >>> 0;
        if (maxSize === 0) break;
    }
    return blocks;
}

// menor bloco CIDR unico que contem tanto `a` como `b`
function smallestCidrContaining(a, b) {
    const prefix = Math.clz32((a ^ b) >>> 0);
    const network = (a & maskForPrefix(prefix)) >>> 0;
    return { prefix, network };
}

function calculateSubnet(input) {
    const raw = input.trim();

    const rangeMatch = raw.match(/^(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\s*[-–]\s*(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
    if (rangeMatch) {
        const start = ipToInt(rangeMatch[1]);
        const end = ipToInt(rangeMatch[2]);
        if (start === null || end === null) return { error: "IP inválido no intervalo." };
        if (start > end) return { error: "O primeiro IP tem de ser menor (ou igual) ao segundo." };
        const cidrs = rangeToCidrs(start, end);
        const smallest = smallestCidrContaining(start, end);
        return {
            mode: "range",
            rangeStart: intToIp(start), rangeEnd: intToIp(end),
            totalAddresses: end - start + 1,
            cidrs,
            containing: `${intToIp(smallest.network)}/${smallest.prefix}`,
            containingDetails: cidrDetails(start, smallest.prefix),
        };
    }

    const cidrMatch = raw.match(/^(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\s*\/\s*(\d{1,2})$/);
    if (!cidrMatch) {
        return { error: "Formato inválido. Usa IP/CIDR (192.168.1.10/24) ou um intervalo (192.168.1.0 - 192.168.1.63)." };
    }
    const ip = ipToInt(cidrMatch[1]);
    const prefix = Number(cidrMatch[2]);
    if (ip === null) return { error: "IP inválido." };
    if (prefix < 0 || prefix > 32) return { error: "Prefixo CIDR tem de estar entre 0 e 32." };
    return { mode: "cidr", ip: cidrMatch[1], ...cidrDetails(ip, prefix) };
}

function resultRow(label, value) {
    return `<div style="display:flex;justify-content:space-between;gap:12px;padding:6px 0;border-bottom:1px solid var(--border)">
        <span class="desc" style="margin:0">${label}</span><span class="mono" style="margin:0">${value}</span>
    </div>`;
}

function renderSubnetCalculator() {
    listEl.innerHTML = `
        <div class="entry">
            <div class="entry-body" style="width:100%">
                <div class="entry-title">Calculadora de Subnets (IPv4)</div>
                <div class="desc">
                    IP com CIDR (ex.: 192.168.1.10/24) ou um intervalo de IPs
                    (ex.: 192.168.1.0 - 192.168.1.63)
                </div>
                <div class="form-row" style="max-width:360px;margin-top:12px">
                    <input id="subnet-input" placeholder="192.168.1.0 - 192.168.1.63" value="192.168.1.10/24">
                </div>
                <button class="primary" id="subnet-calc-btn" style="margin-top:4px">Calcular</button>
                <div id="subnet-result" style="margin-top:16px"></div>
            </div>
        </div>`;

    const run = () => {
        const result = calculateSubnet($("#subnet-input").value);
        const resultEl = $("#subnet-result");
        if (result.error) {
            resultEl.innerHTML = `<p class="desc" style="color:var(--negative)">${escapeHtml(result.error)}</p>`;
            return;
        }

        if (result.mode === "range") {
            const rows = [
                resultRow("Intervalo", `${result.rangeStart} — ${result.rangeEnd}`),
                resultRow("Total de endereços no intervalo", result.totalAddresses.toLocaleString("pt-PT")),
                resultRow("Menor bloco CIDR que contém o intervalo", result.containing),
                resultRow("Máscara desse bloco", result.containingDetails.netmask),
            ];
            resultEl.innerHTML =
                rows.join("") +
                `<div class="desc" style="margin-top:14px">Blocos CIDR que cobrem exatamente este intervalo:</div>` +
                result.cidrs.map((c) => `<div class="mono" style="margin:4px 0">${c}</div>`).join("");
            return;
        }

        const rows = [
            resultRow("Endereço", `${result.ip}/${result.prefix}`),
            resultRow("Endereço de rede", result.network),
            resultRow("Máscara de sub-rede", result.netmask),
            resultRow("Wildcard mask", result.wildcard),
            resultRow("Endereço de broadcast", result.broadcast),
            resultRow("Primeiro host utilizável", result.firstHost),
            resultRow("Último host utilizável", result.lastHost),
            resultRow("Total de endereços", result.totalAddresses.toLocaleString("pt-PT")),
            resultRow("Hosts utilizáveis", result.usableHosts.toLocaleString("pt-PT")),
            resultRow("Rede (binário)", result.networkBinary),
            resultRow("Máscara (binário)", result.maskBinary),
        ];
        resultEl.innerHTML = rows.join("");
    };

    $("#subnet-calc-btn").onclick = run;
    $("#subnet-input").onkeydown = (e) => {
        if (e.key === "Enter") run();
    };
    run();
}

// ---------------------------------------------------------------------
// Gerador de stack Heat (OpenStack) — rede, sub-rede, router e instancias
// escolhidas por checkboxes, reaproveitando o mesmo mecanismo de "colar
// output e criar lista" (📥) usado nas variaveis {{...}} dos playbooks.
// ---------------------------------------------------------------------

// scenarioId sintetico usado no pasteTarget partilhado, para o distinguir
// dos playbooks reais guardados na BD.
const HEAT_GEN_PASTE_TARGET = "__heat__";

const HEAT_VAR_LIST_COMMAND = {
    rede_existente: "openstack network list",
    subnet_existente: "openstack subnet list",
    rede_externa: "openstack network list --external",
    imagem: "openstack image list",
    flavor: "openstack flavor list",
};

const heatGenState = {
    educational: true,
    network: false,
    subnet: false,
    router: false,
    instances: false,
    values: {
        descricao: "Stack gerado pelo Cábula",
        ficheiro: "stack.yaml",
        nome_stack: "minha-stack",
        nome_rede: "",
        nome_subnet: "",
        cidr: "192.168.100.0/24",
        rede_existente: "",
        subnet_existente: "",
        nome_router: "",
        rede_externa: "",
        imagem: "",
        flavor: "",
        instanceCount: 1,
        instanceNames: ["servidor-1"],
        floatingIp: false,
    },
    pasteOptions: {},
};

function heatFileName() {
    return heatGenState.values.ficheiro.trim() || "stack.yaml";
}
function heatStackName() {
    return heatGenState.values.nome_stack.trim() || "minha-stack";
}
function heatCreateCmd() {
    return `openstack stack create -t ${heatFileName()} ${heatStackName()}`;
}
function heatDryRunCmd() {
    return `openstack stack create --dry-run --template ${heatFileName()} ${heatStackName()}`;
}

function heatYamlString(val) {
    // aspas duplas escapadas: valido tanto em YAML "flow scalar" como para
    // qualquer caracter especial que o utilizador tenha escrito (espacos, etc.)
    return JSON.stringify(String(val ?? ""));
}

const CIDR_RE = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\/\d{1,2}$/;

// HTML partilhado pelo corretor do Heat e do K8s: lista de erros/avisos, ou
// uma confirmacao verde se nao houver nenhum.
function renderValidationPanel(issues) {
    if (!issues.length) {
        return `<div class="validation-ok">✅ Sem problemas encontrados na verificação estrutural.</div>`;
    }
    return `<div class="validation-panel">${issues
        .map(
            (i) => `<div class="validation-item ${i.level}">
                <span>${i.level === "error" ? "❌" : "⚠️"}</span><span>${escapeHtml(i.message)}</span>
            </div>`
        )
        .join("")}</div>`;
}

// Corretor do gerador Heat: nao corre nada contra uma cloud real (isso
// exigiria credenciais OpenStack), mas verifica campos obrigatorios e
// erros estruturais obvios antes de sequer chegares ao "openstack stack
// create". Devolve uma lista de { level: "error"|"warning", message }.
function heatValidate() {
    const s = heatGenState;
    const v = s.values;
    const issues = [];
    const err = (message) => issues.push({ level: "error", message });
    const warn = (message) => issues.push({ level: "warning", message });

    if (!s.network && !s.subnet && !s.router && !s.instances) {
        err("Nada selecionado — marca pelo menos Rede, Sub-rede, Router ou Instância(s).");
        return issues;
    }

    if (s.network && !v.nome_rede.trim()) err("Rede marcada mas sem \"Nome da rede\".");

    if (s.subnet) {
        if (!v.nome_subnet.trim()) err("Sub-rede marcada mas sem \"Nome da sub-rede\".");
        if (v.cidr.trim() && !CIDR_RE.test(v.cidr.trim())) err(`CIDR "${v.cidr.trim()}" não parece válido (formato esperado: 192.168.1.0/24).`);
        if (!s.network && !v.rede_existente.trim()) err("Sub-rede sem Rede marcada nem \"Rede existente\" — não vai saber onde criar a sub-rede.");
    }

    if (s.router) {
        if (!v.nome_router.trim()) err("Router marcado mas sem \"Nome do router\".");
        if (!v.rede_externa.trim()) warn("Router sem \"Rede externa\" — fica sem gateway definido (sem acesso de saída).");
    }

    if (s.instances) {
        if (!v.imagem.trim()) err("Instância(s) marcadas mas sem \"Imagem\".");
        if (!v.flavor.trim()) err("Instância(s) marcadas mas sem \"Flavor\".");
        if (!s.network && !v.rede_existente.trim()) err("Instância(s) sem Rede marcada nem \"Rede existente\" — não vão ter a que rede ligar.");
        const count = Math.max(1, Math.min(20, Number(v.instanceCount) || 1));
        const names = v.instanceNames.slice(0, count).map((n) => n.trim()).filter(Boolean);
        const dup = names.filter((n, i) => names.indexOf(n) !== i);
        if (dup.length) warn(`Nomes de instância repetidos: ${[...new Set(dup)].join(", ")}.`);
        if (v.floatingIp && !s.router) warn("\"Ligar ao router\" está marcado mas o Router não está — o IP flutuante vai ficar sem gateway.");
    }

    return issues;
}

function buildHeatTemplate() {
    const s = heatGenState;
    const v = s.values;
    const lines = [];
    const push = (indent, text) => lines.push("  ".repeat(indent) + text);
    // so escreve comentarios "#" quando o modo educativo esta ligado — o
    // toggle deixa o YAML "limpo" para quem so quer o ficheiro pronto a usar.
    const comment = (indent, ...linesOfText) => {
        if (s.educational) linesOfText.forEach((t) => push(indent, `# ${t}`));
    };

    comment(0, "HOT (Heat Orchestration Template) language version used by this file.");
    push(0, "heat_template_version: 2015-10-15");
    comment(0, "Free-text description of the stack — shown in Horizon and 'openstack stack show'.");
    push(0, `description: ${heatYamlString(v.descricao || "Stack generated by Cábula")}`);
    push(0, "");
    comment(
        0,
        "Each block below is an OpenStack resource to create. 'get_resource: X' references",
        "another resource in this file by its name — that's how Heat knows the creation order."
    );
    push(0, "resources:");

    const hasNetwork = s.network && v.nome_rede.trim();
    const hasSubnet = s.subnet && v.nome_subnet.trim();
    const hasRouter = s.router && v.nome_router.trim();
    const networkRef = hasNetwork ? "{ get_resource: network }" : heatYamlString(v.rede_existente);
    // sub-rede existente (para ligar ao router sem a criar de novo): so conta
    // se o utilizador desmarcou "Sub-rede (Subnet)" e escreveu um nome.
    const subnetRef = hasSubnet
        ? "{ get_resource: subnet }"
        : !s.subnet && v.subnet_existente.trim()
          ? heatYamlString(v.subnet_existente)
          : null;
    let wroteAny = false;

    if (hasNetwork) {
        comment(1, "Isolated virtual network (logically equivalent to a VLAN) where the", "subnet(s) and instance(s) below will live.");
        push(1, "network:");
        push(2, "type: OS::Neutron::Net");
        push(2, "properties:");
        push(3, `name: ${heatYamlString(v.nome_rede)}`);
        push(0, "");
        wroteAny = true;
    }

    if (hasSubnet) {
        comment(1, "Subnet inside the network above: defines the IP address block (CIDR)", "that will be assigned to instances attached to this network.");
        push(1, "subnet:");
        push(2, "type: OS::Neutron::Subnet");
        push(2, "properties:");
        push(3, `name: ${heatYamlString(v.nome_subnet)}`);
        push(3, `network_id: ${networkRef}`);
        push(3, `cidr: ${heatYamlString(v.cidr)}`);
        push(3, "ip_version: 4");
        push(0, "");
        wroteAny = true;
    }

    if (hasRouter) {
        comment(
            1,
            "Router: connects the internal network to the external network given in",
            "'external_gateway_info', enabling outbound access (and, further below,",
            "floating IP association)."
        );
        push(1, "router:");
        push(2, "type: OS::Neutron::Router");
        push(2, "properties:");
        push(3, `name: ${heatYamlString(v.nome_router)}`);
        push(3, "external_gateway_info:");
        push(4, `network: ${heatYamlString(v.rede_externa)}`);
        push(0, "");
        wroteAny = true;

        if (subnetRef) {
            comment(1, "Attaches the router to the subnet (created above or already existing) —", "without this the router exists but doesn't route traffic for that subnet.");
            push(1, "router_interface:");
            push(2, "type: OS::Neutron::RouterInterface");
            push(2, "properties:");
            push(3, "router_id: { get_resource: router }");
            push(3, `subnet: ${subnetRef}`);
            push(0, "");
        }
    }

    if (s.instances) {
        const count = Math.max(1, Math.min(20, Number(v.instanceCount) || 1));
        for (let idx = 0; idx < count; idx++) {
            const key = `server${idx + 1}`;
            const name = (v.instanceNames[idx] || "").trim() || `server-${idx + 1}`;
            comment(1, `Instance (VM) ${idx + 1}: created from the chosen image and flavor,`, "attached to the network defined above.");
            push(1, `${key}:`);
            push(2, "type: OS::Nova::Server");
            push(2, "properties:");
            push(3, `name: ${heatYamlString(name)}`);
            push(3, `image: ${heatYamlString(v.imagem)}`);
            push(3, `flavor: ${heatYamlString(v.flavor)}`);
            push(3, "networks:");
            push(4, `- network: ${networkRef}`);
            push(0, "");
            wroteAny = true;

            if (v.floatingIp && hasRouter) {
                comment(1, "Public (floating) IP reserved on the router's external network, to give", "this instance access from outside.");
                push(1, `floating_ip_${idx + 1}:`);
                push(2, "type: OS::Neutron::FloatingIP");
                push(2, "properties:");
                push(3, `floating_network: ${heatYamlString(v.rede_externa)}`);
                push(0, "");

                comment(1, "Associates the floating IP above with this specific instance.");
                push(1, `floating_ip_assoc_${idx + 1}:`);
                push(2, "type: OS::Nova::FloatingIPAssociation");
                push(2, "properties:");
                push(3, `floating_ip: { get_resource: floating_ip_${idx + 1} }`);
                push(3, `server_id: { get_resource: ${key} }`);
                push(0, "");
            }
        }
    }

    if (!wroteAny) {
        push(1, "# Marca pelo menos uma opcao acima (Rede, Sub-rede, Router ou Instancia(s)).");
        push(1, "{}");
    }
    if (lines[lines.length - 1] === "") lines.pop();
    return lines.join("\n") + "\n";
}

// checkboxes de secao (network/subnet/router/instances) ligam a heatGenState
// diretamente; checkboxes de valor (ex: floatingIp) ligam a heatGenState.values,
// tal como os outros campos de input/select — por isso tem atributo diferente.
function heatCheckboxHtml(key, label) {
    return `<label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:0.9rem">
        <input type="checkbox" data-heat-toggle="${key}" ${heatGenState[key] ? "checked" : ""} style="width:16px;height:16px;accent-color:var(--primary)">
        ${escapeHtml(label)}
    </label>`;
}

function heatValueCheckboxHtml(key, label) {
    return `<label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:0.9rem">
        <input type="checkbox" data-heat-value-toggle="${key}" ${heatGenState.values[key] ? "checked" : ""} style="width:16px;height:16px;accent-color:var(--primary)">
        ${escapeHtml(label)}
    </label>`;
}

function heatFieldWrap(label, hint, fieldHtml) {
    return `<div class="tpl-var-field">
        <label>${escapeHtml(label)} ${hint ? `<span class="tpl-hint" title="${escapeAttr(hint)}">?</span>` : ""}</label>
        ${fieldHtml}
    </div>`;
}

function heatTextField(key, placeholder) {
    const value = heatGenState.values[key] || "";
    return `<div class="tpl-control"><input class="tpl-input" data-heat-input="${key}" placeholder="${escapeAttr(placeholder)}" value="${escapeAttr(value)}"></div>`;
}

function heatPasteField(key, placeholder) {
    const options = heatGenState.pasteOptions[key];
    const value = heatGenState.values[key] || "";
    if (options) {
        return `<div class="tpl-control">
            <select class="tpl-select" data-heat-select="${key}">
                ${options.map((o) => `<option value="${escapeAttr(o)}" ${value === o ? "selected" : ""}>${escapeHtml(o)}</option>`).join("")}
            </select>
            <button class="tpl-control-btn" data-heat-clear="${key}" title="Voltar a texto livre">✕</button>
        </div>`;
    }
    return `<div class="tpl-control">
        <input class="tpl-input" data-heat-input="${key}" placeholder="${escapeAttr(placeholder)}" value="${escapeAttr(value)}">
        <button class="tpl-control-btn" data-heat-paste="${key}" title="Colar output e criar lista">📥</button>
    </div>`;
}

function renderHeatGenerator() {
    const s = heatGenState;
    const v = s.values;

    let fieldsHtml = `<div class="tpl-vars">
        ${heatFieldWrap("Descrição do stack", "Fica na linha 'description' do template.", heatTextField("descricao", "Stack gerado pelo Cábula"))}
        ${heatFieldWrap("Nome do ficheiro", "Nome a dar ao ficheiro .yaml quando o descarregares.", heatTextField("ficheiro", "stack.yaml"))}
        ${heatFieldWrap("Nome da stack", "Nome a dar à stack ao correr 'openstack stack create'.", heatTextField("nome_stack", "minha-stack"))}
    </div>`;

    if (s.network) {
        fieldsHtml += `<div class="tpl-vars">
            ${heatFieldWrap("Nome da rede", "Nome a dar à rede a criar.", heatTextField("nome_rede", "minha-rede"))}
        </div>`;
    }

    if (s.subnet) {
        fieldsHtml += `<div class="tpl-vars">
            ${heatFieldWrap("Nome da sub-rede", "Nome a dar à sub-rede.", heatTextField("nome_subnet", "minha-subrede"))}
            ${heatFieldWrap("CIDR", "Bloco de endereços da sub-rede (ex.: 192.168.100.0/24).", heatTextField("cidr", "192.168.100.0/24"))}
            ${!s.network ? heatFieldWrap("Rede existente", "Rede onde criar esta sub-rede (já tem de existir).", heatPasteField("rede_existente", "nome da rede")) : ""}
        </div>`;
    }

    if (s.router) {
        fieldsHtml += `<div class="tpl-vars">
            ${heatFieldWrap("Nome do router", "Nome a dar ao router.", heatTextField("nome_router", "meu-router"))}
            ${heatFieldWrap("Rede externa", "Rede externa/pública para o gateway do router. Confirma que existe mesmo com 'openstack network list --external' antes de correr a stack.", heatPasteField("rede_externa", "ext-net"))}
            ${!s.subnet ? heatFieldWrap("Sub-rede existente", "Opcional: liga o router a uma sub-rede já existente (em vez de criar uma nova). Deixa em branco para não ligar a nenhuma.", heatPasteField("subnet_existente", "nome da sub-rede")) : ""}
        </div>`;
    }

    if (s.instances) {
        fieldsHtml += `<div class="tpl-vars">
            ${heatFieldWrap("Imagem", "Imagem do sistema operativo.", heatPasteField("imagem", "ubuntu"))}
            ${heatFieldWrap("Flavor", "Tamanho da instância (vCPUs/RAM/disco).", heatPasteField("flavor", "m1.small"))}
            ${!s.network ? heatFieldWrap("Rede existente", "Rede onde ligar as instâncias (já tem de existir).", heatPasteField("rede_existente", "nome da rede")) : ""}
            ${heatFieldWrap("Nº de instâncias", "Quantas instâncias criar (1–20).", `<div class="tpl-control"><input type="number" min="1" max="20" class="tpl-input" data-heat-count value="${v.instanceCount}"></div>`)}
        </div>
        <div class="tpl-vars">
            ${v.instanceNames
                .slice(0, v.instanceCount)
                .map((name, idx) =>
                    heatFieldWrap(
                        `Nome da instância ${idx + 1}`,
                        "",
                        `<div class="tpl-control"><input class="tpl-input" data-heat-name="${idx}" placeholder="servidor-${idx + 1}" value="${escapeAttr(name)}"></div>`
                    )
                )
                .join("")}
        </div>`;

        if (s.router) {
            fieldsHtml += `<div style="margin:10px 0">${heatValueCheckboxHtml("floatingIp", "Ligar instâncias ao router (atribuir IP flutuante pela rede externa)")}</div>`;
        }
    }

    listEl.innerHTML = `
        <div class="entry">
            <div class="entry-body" style="width:100%">
                <div class="entry-title">Gerar Stack (YAML) — OpenStack Heat</div>
                <div class="desc">
                    Marca o que queres criar. O template é gerado em baixo, pronto para
                    <span class="mono" id="heat-create-cmd" style="padding:1px 6px">${escapeHtml(heatCreateCmd())}</span>.
                </div>
                <div style="margin-top:10px">
                    ${heatCheckboxHtml("educational", "Modo educativo (comentários # a explicar cada bloco do YAML)")}
                </div>
                <div style="display:flex;flex-wrap:wrap;gap:16px;margin:16px 0">
                    ${heatCheckboxHtml("network", "Rede (Network)")}
                    ${heatCheckboxHtml("subnet", "Sub-rede (Subnet)")}
                    ${heatCheckboxHtml("router", "Router")}
                    ${heatCheckboxHtml("instances", "Instância(s)")}
                </div>
                ${fieldsHtml}
                <div id="heat-validation">${renderValidationPanel(heatValidate())}</div>
                <div style="display:flex;gap:8px;margin:16px 0 10px">
                    <button class="primary" id="heat-copy">Copiar YAML</button>
                    <button class="ghost" id="heat-download">Descarregar .yaml</button>
                </div>
                <pre class="mono" id="heat-output" style="display:block;white-space:pre;overflow-x:auto;padding:14px;font-size:0.8rem;line-height:1.5">${escapeHtml(buildHeatTemplate())}</pre>
                <div class="desc" style="margin-top:14px">
                    Antes de criar a stack a sério, valida o template (não cria nada, só verifica):
                </div>
                <div style="display:flex;align-items:center;gap:6px;margin-top:4px">
                    <span class="mono" id="heat-dryrun-cmd" style="flex:1">${escapeHtml(heatDryRunCmd())}</span>
                    <button class="tpl-control-btn" id="heat-copy-dryrun" title="Copiar comando" style="border:1px solid var(--border);border-radius:7px">${COPY_ICON_SVG}</button>
                </div>
            </div>
        </div>`;

    const refreshOutput = () => {
        const pre = $("#heat-output");
        if (pre) pre.textContent = buildHeatTemplate();
        const createCmd = $("#heat-create-cmd");
        if (createCmd) createCmd.textContent = heatCreateCmd();
        const dryrunCmd = $("#heat-dryrun-cmd");
        if (dryrunCmd) dryrunCmd.textContent = heatDryRunCmd();
        const validation = $("#heat-validation");
        if (validation) validation.innerHTML = renderValidationPanel(heatValidate());
    };

    listEl.querySelectorAll("[data-heat-toggle]").forEach((el) => {
        el.onchange = () => {
            s[el.dataset.heatToggle] = el.checked;
            renderHeatGenerator();
        };
    });
    listEl.querySelectorAll("[data-heat-value-toggle]").forEach((el) => {
        el.onchange = () => {
            v[el.dataset.heatValueToggle] = el.checked;
            refreshOutput();
        };
    });
    listEl.querySelectorAll("[data-heat-input]").forEach((el) => {
        el.oninput = () => {
            v[el.dataset.heatInput] = el.value;
            refreshOutput();
        };
    });
    listEl.querySelectorAll("[data-heat-select]").forEach((el) => {
        el.onchange = () => {
            v[el.dataset.heatSelect] = el.value;
            refreshOutput();
        };
    });
    listEl.querySelectorAll("[data-heat-name]").forEach((el) => {
        el.oninput = () => {
            v.instanceNames[Number(el.dataset.heatName)] = el.value;
            refreshOutput();
        };
    });
    const countInput = listEl.querySelector("[data-heat-count]");
    if (countInput) {
        // "oninput" (nao "onchange") para reagir logo enquanto se escreve —
        // com "onchange" so atualizava ao perder o foco, o que parecia que a
        // opcao de varias instancias nao existia.
        countInput.oninput = () => {
            const n = Math.max(1, Math.min(20, Number(countInput.value) || 1));
            v.instanceCount = n;
            while (v.instanceNames.length < n) v.instanceNames.push(`servidor-${v.instanceNames.length + 1}`);
            renderHeatGenerator();
        };
    }
    listEl.querySelectorAll("[data-heat-paste]").forEach((btn) => {
        btn.onclick = () => {
            pasteTarget = { scenarioId: HEAT_GEN_PASTE_TARGET, varName: btn.dataset.heatPaste };
            const suggestion = HEAT_VAR_LIST_COMMAND[pasteTarget.varName];
            $("#paste-suggestion").innerHTML = suggestion
                ? `Corre <span class="mono" style="font-size:0.8rem">${escapeHtml(suggestion)}</span> e cola o resultado abaixo.`
                : "";
            $("#paste-dialog").showModal();
        };
    });
    listEl.querySelectorAll("[data-heat-clear]").forEach((btn) => {
        btn.onclick = () => {
            delete s.pasteOptions[btn.dataset.heatClear];
            renderHeatGenerator();
        };
    });

    $("#heat-copy").onclick = () => {
        navigator.clipboard.writeText(buildHeatTemplate());
        toast("YAML copiado");
    };
    $("#heat-download").onclick = () => {
        const blob = new Blob([buildHeatTemplate()], { type: "text/yaml" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = heatFileName();
        a.click();
        URL.revokeObjectURL(url);
    };
    $("#heat-copy-dryrun").onclick = () => {
        navigator.clipboard.writeText($("#heat-dryrun-cmd").textContent);
        toast("Comando copiado");
    };
}

// ---------------------------------------------------------------------
// Gerador de manifesto Kubernetes — namespace, deployment, service e
// configmap escolhidos por checkboxes, mesmo mecanismo de "colar output e
// criar lista" (📥) do gerador Heat, mas produzindo YAML multi-documento
// (separado por "---", convencao do kubectl) em vez de um template Heat.
// ---------------------------------------------------------------------

const K8S_GEN_PASTE_TARGET = "__k8s__";

const K8S_VAR_LIST_COMMAND = {
    namespace_existente: "kubectl get namespaces",
};

const k8sGenState = {
    educational: true,
    namespace: false,
    deployment: false,
    service: false,
    configmap: false,
    values: {
        ficheiro: "manifesto.yaml",
        nome_namespace: "",
        namespace_existente: "",
        nome_deployment: "",
        imagem_container: "",
        replicas: 1,
        porta_container: 80,
        nome_service: "",
        tipo_service: "ClusterIP",
        porta_service: 80,
        porta_alvo: 80,
        app_existente: "",
        nome_configmap: "",
        configmap_dados: "CHAVE=valor",
    },
    pasteOptions: {},
};

function k8sFileName() {
    return k8sGenState.values.ficheiro.trim() || "manifesto.yaml";
}
function k8sApplyCmd() {
    return `kubectl apply -f ${k8sFileName()}`;
}
function k8sDryRunCmd() {
    return `kubectl apply -f ${k8sFileName()} --dry-run=client`;
}
// namespace efetivo a usar nos recursos: o criado agora, ou um ja existente
// indicado pelo utilizador, ou "default" se nada for dito — tal como o
// kubectl faz quando --namespace nao e passado.
function k8sNamespaceName() {
    const s = k8sGenState;
    const v = s.values;
    if (s.namespace && v.nome_namespace.trim()) return v.nome_namespace.trim();
    return v.namespace_existente.trim() || "default";
}

// nomes de recursos Kubernetes tem de ser um "DNS-1123 label": minusculas,
// numeros e hifens, sem comecar/acabar em hifen.
const K8S_NAME_RE = /^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/;
function k8sNameIssue(name) {
    return K8S_NAME_RE.test(name) ? null : "só pode ter minúsculas, números e hífens, sem começar/acabar em hífen (RFC 1123)";
}

// Corretor do gerador K8s: tal como o do Heat, verifica campos obrigatorios
// e regras estruturais (nomes validos, portas no intervalo certo, etc.) sem
// precisar de um cluster real ligado.
function k8sValidate() {
    const s = k8sGenState;
    const v = s.values;
    const issues = [];
    const err = (message) => issues.push({ level: "error", message });
    const warn = (message) => issues.push({ level: "warning", message });
    const validPort = (n) => Number.isInteger(n) && n >= 1 && n <= 65535;

    if (!s.namespace && !s.deployment && !s.service && !s.configmap) {
        err("Nada selecionado — marca pelo menos Namespace, Deployment, Service ou ConfigMap.");
        return issues;
    }

    if (s.namespace) {
        if (!v.nome_namespace.trim()) err("Namespace marcado mas sem \"Nome do namespace\".");
        else {
            const issue = k8sNameIssue(v.nome_namespace.trim());
            if (issue) err(`Nome do namespace inválido: ${issue}.`);
        }
    }

    if (s.deployment) {
        if (!v.nome_deployment.trim()) err("Deployment marcado mas sem \"Nome do deployment\".");
        else {
            const issue = k8sNameIssue(v.nome_deployment.trim());
            if (issue) err(`Nome do deployment inválido: ${issue}.`);
        }
        if (!v.imagem_container.trim()) err("Deployment marcado mas sem \"Imagem do container\".");
        if (!(Number(v.replicas) >= 1)) err("\"Réplicas\" tem de ser pelo menos 1.");
        if (!validPort(Number(v.porta_container))) warn(`Porta do container (${v.porta_container}) fora do intervalo válido (1–65535).`);
    }

    if (s.service) {
        if (!v.nome_service.trim()) err("Service marcado mas sem \"Nome do service\".");
        if (!validPort(Number(v.porta_service))) warn(`Porta do service (${v.porta_service}) fora do intervalo válido (1–65535).`);
        if (!validPort(Number(v.porta_alvo))) warn(`Porta de destino (${v.porta_alvo}) fora do intervalo válido (1–65535).`);
        if (!s.deployment && !v.app_existente.trim()) warn("Service sem Deployment marcado nem \"App existente (selector)\" — não vai encontrar nenhum pod.");
    }

    if (s.configmap) {
        if (!v.nome_configmap.trim()) err("ConfigMap marcado mas sem \"Nome do configmap\".");
        const linhasSemIgual = v.configmap_dados
            .split("\n")
            .map((l) => l.trim())
            .filter(Boolean)
            .filter((l) => !l.includes("="));
        if (linhasSemIgual.length) warn(`Linha(s) sem "=" nos dados do ConfigMap vão ficar com valor vazio: ${linhasSemIgual.join(", ")}.`);
    }

    return issues;
}

function buildK8sManifest() {
    const s = k8sGenState;
    const v = s.values;
    const docs = [];

    const comment = (lines, ...text) => {
        if (s.educational) text.forEach((t) => lines.push(`# ${t}`));
    };

    const ns = k8sNamespaceName();
    const hasNamespace = s.namespace && v.nome_namespace.trim();
    const hasDeployment = s.deployment && v.nome_deployment.trim();
    // selector do Service: usa o Deployment criado agora, ou um "app" ja
    // existente indicado pelo utilizador (para ligar a pods que ja existem).
    const appSelector = hasDeployment ? v.nome_deployment.trim() : v.app_existente.trim();

    if (hasNamespace) {
        const lines = [];
        comment(lines, "Namespace: agrupa os recursos abaixo, isolando-os de outros", "projetos/equipas dentro do mesmo cluster.");
        lines.push("apiVersion: v1", "kind: Namespace", "metadata:", `  name: ${v.nome_namespace.trim()}`);
        docs.push(lines.join("\n"));
    }

    if (hasDeployment) {
        const lines = [];
        comment(
            lines,
            "Deployment: garante que 'replicas' copias dos pods (com a imagem",
            "indicada) estao sempre a correr, recriando-os se falharem."
        );
        lines.push(
            "apiVersion: apps/v1",
            "kind: Deployment",
            "metadata:",
            `  name: ${v.nome_deployment.trim()}`,
            `  namespace: ${ns}`,
            "spec:",
            `  replicas: ${Math.max(1, Number(v.replicas) || 1)}`,
            "  selector:",
            "    matchLabels:",
            `      app: ${v.nome_deployment.trim()}`,
            "  template:",
            "    metadata:",
            "      labels:",
            `        app: ${v.nome_deployment.trim()}`,
            "    spec:",
            "      containers:",
            `        - name: ${v.nome_deployment.trim()}`,
            `          image: ${v.imagem_container.trim() || "imagem:tag"}`,
            "          ports:",
            `            - containerPort: ${Number(v.porta_container) || 80}`
        );
        docs.push(lines.join("\n"));
    }

    if (s.service && v.nome_service.trim()) {
        const lines = [];
        comment(
            lines,
            "Service: expõe os pods do Deployment (via o selector 'app') num",
            "endereço estavel dentro (ou fora, consoante o 'type') do cluster."
        );
        lines.push(
            "apiVersion: v1",
            "kind: Service",
            "metadata:",
            `  name: ${v.nome_service.trim()}`,
            `  namespace: ${ns}`,
            "spec:",
            `  type: ${v.tipo_service}`,
            "  selector:",
            `    app: ${appSelector || v.nome_service.trim()}`,
            "  ports:",
            `    - port: ${Number(v.porta_service) || 80}`,
            `      targetPort: ${Number(v.porta_alvo) || 80}`
        );
        docs.push(lines.join("\n"));
    }

    if (s.configmap && v.nome_configmap.trim()) {
        const lines = [];
        comment(lines, "ConfigMap: configuracao (pares chave/valor) que os pods podem", "montar como variaveis de ambiente ou ficheiros.");
        lines.push("apiVersion: v1", "kind: ConfigMap", "metadata:", `  name: ${v.nome_configmap.trim()}`, `  namespace: ${ns}`, "data:");
        const pairs = v.configmap_dados
            .split("\n")
            .map((l) => l.trim())
            .filter(Boolean)
            .map((l) => {
                const eq = l.indexOf("=");
                return eq === -1 ? [l, ""] : [l.slice(0, eq).trim(), l.slice(eq + 1).trim()];
            });
        if (pairs.length) {
            pairs.forEach(([k, val]) => lines.push(`  ${k}: ${heatYamlString(val)}`));
        } else {
            lines.push("  {}");
        }
        docs.push(lines.join("\n"));
    }

    if (!docs.length) {
        const lines = [];
        comment(lines, "Marca pelo menos uma opcao acima (Namespace, Deployment, Service ou ConfigMap).");
        lines.push("{}");
        return lines.join("\n") + "\n";
    }

    return docs.join("\n---\n") + "\n";
}

function k8sCheckboxHtml(key, label) {
    return `<label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:0.9rem">
        <input type="checkbox" data-k8s-toggle="${key}" ${k8sGenState[key] ? "checked" : ""} style="width:16px;height:16px;accent-color:var(--primary)">
        ${escapeHtml(label)}
    </label>`;
}

function k8sTextField(key, placeholder, type = "text") {
    const value = k8sGenState.values[key];
    return `<div class="tpl-control"><input type="${type}" class="tpl-input" data-k8s-input="${key}" placeholder="${escapeAttr(placeholder)}" value="${escapeAttr(String(value ?? ""))}"></div>`;
}

function k8sSelectField(key, options) {
    const value = k8sGenState.values[key];
    return `<div class="tpl-control"><select class="tpl-select" data-k8s-select="${key}">
        ${options.map((o) => `<option value="${escapeAttr(o)}" ${value === o ? "selected" : ""}>${escapeHtml(o)}</option>`).join("")}
    </select></div>`;
}

function k8sPasteField(key, placeholder) {
    const options = k8sGenState.pasteOptions[key];
    const value = k8sGenState.values[key] || "";
    if (options) {
        return `<div class="tpl-control">
            <select class="tpl-select" data-k8s-select="${key}">
                ${options.map((o) => `<option value="${escapeAttr(o)}" ${value === o ? "selected" : ""}>${escapeHtml(o)}</option>`).join("")}
            </select>
            <button class="tpl-control-btn" data-k8s-clear="${key}" title="Voltar a texto livre">✕</button>
        </div>`;
    }
    return `<div class="tpl-control">
        <input class="tpl-input" data-k8s-input="${key}" placeholder="${escapeAttr(placeholder)}" value="${escapeAttr(value)}">
        <button class="tpl-control-btn" data-k8s-paste="${key}" title="Colar output e criar lista">📥</button>
    </div>`;
}

function renderK8sGenerator() {
    const s = k8sGenState;
    const v = s.values;

    let fieldsHtml = `<div class="tpl-vars">
        ${heatFieldWrap("Nome do ficheiro", "Nome a dar ao ficheiro .yaml quando o descarregares.", k8sTextField("ficheiro", "manifesto.yaml"))}
    </div>`;

    if (s.namespace) {
        fieldsHtml += `<div class="tpl-vars">
            ${heatFieldWrap("Nome do namespace", "Namespace a criar.", k8sTextField("nome_namespace", "minha-app"))}
        </div>`;
    }

    const needsNamespaceExisting = !s.namespace && (s.deployment || s.service || s.configmap);
    if (needsNamespaceExisting) {
        fieldsHtml += `<div class="tpl-vars">
            ${heatFieldWrap("Namespace existente", "Onde colocar os recursos abaixo (em branco = 'default').", k8sPasteField("namespace_existente", "default"))}
        </div>`;
    }

    if (s.deployment) {
        fieldsHtml += `<div class="tpl-vars">
            ${heatFieldWrap("Nome do deployment", "Nome do deployment (e dos pods que gera).", k8sTextField("nome_deployment", "minha-app"))}
            ${heatFieldWrap("Imagem do container", "Imagem e tag a usar (ex.: nginx:1.27).", k8sTextField("imagem_container", "nginx:1.27"))}
            ${heatFieldWrap("Réplicas", "Quantos pods manter sempre a correr.", k8sTextField("replicas", "3", "number"))}
            ${heatFieldWrap("Porta do container", "Porta em que a aplicação escuta dentro do container.", k8sTextField("porta_container", "80", "number"))}
        </div>`;
    }

    if (s.service) {
        fieldsHtml += `<div class="tpl-vars">
            ${heatFieldWrap("Nome do service", "Nome a dar ao service.", k8sTextField("nome_service", "minha-app"))}
            ${heatFieldWrap("Tipo", "ClusterIP (só dentro do cluster), NodePort ou LoadBalancer (acesso externo).", k8sSelectField("tipo_service", ["ClusterIP", "NodePort", "LoadBalancer"]))}
            ${heatFieldWrap("Porta do service", "Porta exposta pelo service.", k8sTextField("porta_service", "80", "number"))}
            ${heatFieldWrap("Porta de destino", "Porta do container para onde o tráfego é encaminhado.", k8sTextField("porta_alvo", "80", "number"))}
            ${!s.deployment ? heatFieldWrap("App existente (selector)", "Valor do label 'app' dos pods já existentes a expor (consulta com 'kubectl get pods --show-labels').", k8sTextField("app_existente", "minha-app")) : ""}
        </div>`;
    }

    if (s.configmap) {
        fieldsHtml += `<div class="tpl-vars">
            ${heatFieldWrap("Nome do configmap", "Nome a dar ao configmap.", k8sTextField("nome_configmap", "minha-config"))}
        </div>
        <div class="tpl-var-field" style="margin:0 0 12px">
            <label>Dados (um CHAVE=valor por linha) <span class="tpl-hint" title="Cada linha vira uma entrada em 'data:'. Ex.: LOG_LEVEL=info">?</span></label>
            <textarea data-k8s-textarea="configmap_dados" rows="4" style="width:100%;font-family:'JetBrains Mono',monospace;font-size:0.82rem;padding:8px;border-radius:8px;border:1px solid var(--border);background:var(--bg);color:var(--text)">${escapeHtml(v.configmap_dados)}</textarea>
        </div>`;
    }

    listEl.innerHTML = `
        <div class="entry">
            <div class="entry-body" style="width:100%">
                <div class="entry-title">Gerar Manifesto (K8s) — Kubernetes</div>
                <div class="desc">
                    Marca o que queres criar. O manifesto é gerado em baixo, pronto para
                    <span class="mono" id="k8s-apply-cmd" style="padding:1px 6px">${escapeHtml(k8sApplyCmd())}</span>.
                </div>
                <div style="margin-top:10px">
                    ${k8sCheckboxHtml("educational", "Modo educativo (comentários # a explicar cada bloco do YAML)")}
                </div>
                <div style="display:flex;flex-wrap:wrap;gap:16px;margin:16px 0">
                    ${k8sCheckboxHtml("namespace", "Namespace")}
                    ${k8sCheckboxHtml("deployment", "Deployment")}
                    ${k8sCheckboxHtml("service", "Service")}
                    ${k8sCheckboxHtml("configmap", "ConfigMap")}
                </div>
                ${fieldsHtml}
                <div id="k8s-validation">${renderValidationPanel(k8sValidate())}</div>
                <div style="display:flex;gap:8px;margin:16px 0 10px">
                    <button class="primary" id="k8s-copy">Copiar YAML</button>
                    <button class="ghost" id="k8s-download">Descarregar .yaml</button>
                </div>
                <pre class="mono" id="k8s-output" style="display:block;white-space:pre;overflow-x:auto;padding:14px;font-size:0.8rem;line-height:1.5">${escapeHtml(buildK8sManifest())}</pre>
                <div class="desc" style="margin-top:14px">
                    Antes de aplicar a sério, valida o manifesto (não cria nada, só verifica):
                </div>
                <div style="display:flex;align-items:center;gap:6px;margin-top:4px">
                    <span class="mono" id="k8s-dryrun-cmd" style="flex:1">${escapeHtml(k8sDryRunCmd())}</span>
                    <button class="tpl-control-btn" id="k8s-copy-dryrun" title="Copiar comando" style="border:1px solid var(--border);border-radius:7px">${COPY_ICON_SVG}</button>
                </div>
            </div>
        </div>`;

    const refreshOutput = () => {
        const pre = $("#k8s-output");
        if (pre) pre.textContent = buildK8sManifest();
        const applyCmd = $("#k8s-apply-cmd");
        if (applyCmd) applyCmd.textContent = k8sApplyCmd();
        const dryrunCmd = $("#k8s-dryrun-cmd");
        if (dryrunCmd) dryrunCmd.textContent = k8sDryRunCmd();
        const validation = $("#k8s-validation");
        if (validation) validation.innerHTML = renderValidationPanel(k8sValidate());
    };

    listEl.querySelectorAll("[data-k8s-toggle]").forEach((el) => {
        el.onchange = () => {
            s[el.dataset.k8sToggle] = el.checked;
            renderK8sGenerator();
        };
    });
    listEl.querySelectorAll("[data-k8s-input]").forEach((el) => {
        el.oninput = () => {
            v[el.dataset.k8sInput] = el.value;
            refreshOutput();
        };
    });
    listEl.querySelectorAll("[data-k8s-select]").forEach((el) => {
        el.onchange = () => {
            v[el.dataset.k8sSelect] = el.value;
            refreshOutput();
        };
    });
    listEl.querySelectorAll("[data-k8s-textarea]").forEach((el) => {
        el.oninput = () => {
            v[el.dataset.k8sTextarea] = el.value;
            refreshOutput();
        };
    });
    listEl.querySelectorAll("[data-k8s-paste]").forEach((btn) => {
        btn.onclick = () => {
            pasteTarget = { scenarioId: K8S_GEN_PASTE_TARGET, varName: btn.dataset.k8sPaste };
            const suggestion = K8S_VAR_LIST_COMMAND[pasteTarget.varName];
            $("#paste-suggestion").innerHTML = suggestion
                ? `Corre <span class="mono" style="font-size:0.8rem">${escapeHtml(suggestion)}</span> e cola o resultado abaixo.`
                : "";
            $("#paste-dialog").showModal();
        };
    });
    listEl.querySelectorAll("[data-k8s-clear]").forEach((btn) => {
        btn.onclick = () => {
            delete s.pasteOptions[btn.dataset.k8sClear];
            renderK8sGenerator();
        };
    });

    $("#k8s-copy").onclick = () => {
        navigator.clipboard.writeText(buildK8sManifest());
        toast("YAML copiado");
    };
    $("#k8s-download").onclick = () => {
        const blob = new Blob([buildK8sManifest()], { type: "text/yaml" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = k8sFileName();
        a.click();
        URL.revokeObjectURL(url);
    };
    $("#k8s-copy-dryrun").onclick = () => {
        navigator.clipboard.writeText($("#k8s-dryrun-cmd").textContent);
        toast("Comando copiado");
    };
}

// ---------------------------------------------------------------------
// Verificar YAML: cola um template Heat ou manifesto Kubernetes qualquer
// (nao tem de ter sido feito pelos geradores acima) e diz o que esta
// errado. Usa o js-yaml (parser real, nao feito a mao) para ler o YAML e
// depois aplica os mesmos tipos de verificacao estrutural dos corretores
// dos geradores, mas sobre o documento tal como foi colado.
// ---------------------------------------------------------------------

const KNOWN_HEAT_RESOURCE_CHECKS = {
    "OS::Neutron::Net": (props, err, warn) => {
        if (!props?.name) warn('Falta "name" nas properties.');
    },
    "OS::Neutron::Subnet": (props, err, warn) => {
        if (!props?.cidr) err('Falta "cidr" nas properties.');
        if (!props?.network_id && !props?.network) err('Falta "network_id" (ou "network") nas properties.');
    },
    "OS::Neutron::Router": (props, err, warn) => {
        if (!props?.external_gateway_info) warn('Sem "external_gateway_info" — o router fica sem gateway externo.');
    },
    "OS::Neutron::RouterInterface": (props, err, warn) => {
        if (!props?.router_id && !props?.router) err('Falta "router_id" (ou "router") nas properties.');
        if (!props?.subnet && !props?.subnet_id) err('Falta "subnet" (ou "subnet_id") nas properties.');
    },
    "OS::Nova::Server": (props, err, warn) => {
        if (!props?.image) err('Falta "image" nas properties.');
        if (!props?.flavor) err('Falta "flavor" nas properties.');
    },
    "OS::Neutron::FloatingIP": (props, err, warn) => {
        if (!props?.floating_network && !props?.floating_network_id) err('Falta "floating_network" (ou "floating_network_id") nas properties.');
    },
};

// procura recursivamente todos os "{ get_resource: X }" dentro de um valor
// ja interpretado pelo js-yaml (objetos/arrays JS, nao texto).
function collectGetResourceRefs(value, refs = []) {
    if (value && typeof value === "object") {
        if (!Array.isArray(value) && typeof value.get_resource === "string") refs.push(value.get_resource);
        for (const v of Object.values(value)) collectGetResourceRefs(v, refs);
    }
    return refs;
}

function validateHeatDoc(doc) {
    const issues = [];
    const err = (message) => issues.push({ level: "error", message });
    const warn = (message) => issues.push({ level: "warning", message });

    if (!doc.heat_template_version) err('Falta "heat_template_version" no topo do ficheiro.');

    const resources = doc.resources;
    if (!resources || typeof resources !== "object" || Array.isArray(resources) || !Object.keys(resources).length) {
        err('Falta a secção "resources" (ou está vazia).');
        return issues;
    }

    for (const [key, res] of Object.entries(resources)) {
        if (!res || typeof res !== "object") {
            err(`Recurso "${key}" está vazio ou mal formado.`);
            continue;
        }
        if (!res.type) {
            err(`Recurso "${key}" sem "type".`);
            continue;
        }
        if (!String(res.type).startsWith("OS::")) {
            warn(`Recurso "${key}" tem type "${res.type}", que não parece um tipo OpenStack válido (o esperado é começar por "OS::").`);
        }
        const check = KNOWN_HEAT_RESOURCE_CHECKS[res.type];
        if (check) check(res.properties, (m) => err(`Recurso "${key}" (${res.type}): ${m}`), (m) => warn(`Recurso "${key}" (${res.type}): ${m}`));
    }

    const refs = collectGetResourceRefs(resources);
    [...new Set(refs)].filter((r) => !(r in resources)).forEach((r) => err(`"get_resource: ${r}" aponta para um recurso que não existe no ficheiro.`));

    return issues;
}

function validateK8sDoc(doc, index, total) {
    const issues = [];
    const label = doc?.kind ? `${doc.kind}${total > 1 ? ` (documento ${index + 1})` : ""}` : `Documento ${index + 1}`;
    const err = (message) => issues.push({ level: "error", message: `${label}: ${message}` });
    const warn = (message) => issues.push({ level: "warning", message: `${label}: ${message}` });

    if (!doc || typeof doc !== "object") {
        err("documento vazio ou mal formado.");
        return issues;
    }
    if (!doc.apiVersion) err('falta "apiVersion".');
    if (!doc.kind) err('falta "kind".');
    if (!doc.metadata?.name) err('falta "metadata.name".');
    else {
        const issue = k8sNameIssue(doc.metadata.name);
        if (issue) err(`"metadata.name" inválido: ${issue}.`);
    }

    if (doc.kind === "Deployment") {
        const containers = doc.spec?.template?.spec?.containers;
        if (!doc.spec?.selector?.matchLabels) err('falta "spec.selector.matchLabels".');
        if (!containers || !containers.length) err('falta "spec.template.spec.containers" (ou está vazio).');
        else containers.forEach((c, i) => { if (!c.image) err(`container #${i + 1} sem "image".`); });
        const selectorLabels = doc.spec?.selector?.matchLabels;
        const templateLabels = doc.spec?.template?.metadata?.labels;
        if (selectorLabels && templateLabels) {
            const mismatch = Object.entries(selectorLabels).some(([k, v]) => templateLabels[k] !== v);
            if (mismatch) err('"spec.selector.matchLabels" não corresponde a "spec.template.metadata.labels" — o Deployment não vai gerir os próprios pods.');
        }
        if (!(Number(doc.spec?.replicas) >= 1)) warn('"spec.replicas" em falta ou inválido — o Kubernetes assume 1 por defeito.');
    }

    if (doc.kind === "Service") {
        if (!doc.spec?.selector) warn('sem "spec.selector" — só faz sentido se for propositadamente um Service sem selector (ex.: ligado a um Endpoints manual).');
        if (!doc.spec?.ports?.length) err('falta "spec.ports" (ou está vazio).');
    }

    return issues;
}

function checkYamlContent(text) {
    if (!text.trim()) return { empty: true };
    let docs;
    try {
        docs = yamlLib.loadAll(text).filter((d) => d != null);
    } catch (e) {
        const where = e?.mark ? ` (linha ${e.mark.line + 1}, coluna ${e.mark.column + 1})` : "";
        return { syntaxError: `YAML inválido${where}: ${e.reason || e.message}` };
    }
    if (!docs.length) return { empty: true };

    const isHeat = docs.length === 1 && docs[0] && typeof docs[0] === "object" && "heat_template_version" in docs[0];
    const isK8s = docs.every((d) => d && typeof d === "object" && d.apiVersion && d.kind);

    if (isHeat) return { kind: "heat", docCount: 1, issues: validateHeatDoc(docs[0]) };
    if (isK8s) return { kind: "k8s", docCount: docs.length, issues: docs.flatMap((d, i) => validateK8sDoc(d, i, docs.length)) };
    return {
        kind: "unknown",
        docCount: docs.length,
        issues: [{ level: "warning", message: "Sintaxe YAML válida, mas isto não parece um template Heat nem um manifesto Kubernetes — só a sintaxe foi verificada." }],
    };
}

function renderYamlChecker() {
    listEl.innerHTML = `
        <div class="entry">
            <div class="entry-body" style="width:100%">
                <div class="entry-title">Verificar YAML — Heat ou Kubernetes</div>
                <div class="desc">
                    Cola aqui um YAML — template Heat ou manifesto Kubernetes, feito ou não pelos
                    geradores acima — e diz-te o que está errado. Não precisa de cloud/cluster ligados.
                </div>
                <textarea id="yaml-checker-input" rows="16" placeholder="Cola o YAML aqui..."
                    style="width:100%;margin-top:12px;font-family:'JetBrains Mono',monospace;font-size:0.82rem;padding:12px;border-radius:8px;border:1px solid var(--border);background:var(--code-bg);color:var(--text)"></textarea>
                <div style="display:flex;gap:8px;margin:10px 0">
                    <button class="primary" id="yaml-checker-run">Verificar</button>
                    <button class="ghost" id="yaml-checker-clear">Limpar</button>
                </div>
                <div id="yaml-checker-result"></div>
            </div>
        </div>`;

    const input = $("#yaml-checker-input");
    const resultEl = $("#yaml-checker-result");

    const KIND_LABEL = { heat: "Template Heat (OpenStack)", k8s: "Manifesto Kubernetes", unknown: "Tipo não reconhecido" };

    const run = () => {
        const result = checkYamlContent(input.value);
        if (result.empty) {
            resultEl.innerHTML = "";
            return;
        }
        if (result.syntaxError) {
            resultEl.innerHTML = `<div class="validation-panel"><div class="validation-item error"><span>❌</span><span>${escapeHtml(result.syntaxError)}</span></div></div>`;
            return;
        }
        const header = `<div class="desc" style="margin:14px 0 4px">
            Detetado: <b>${escapeHtml(KIND_LABEL[result.kind] || "?")}</b>${result.docCount > 1 ? ` · ${result.docCount} documentos` : ""}
        </div>`;
        resultEl.innerHTML = header + renderValidationPanel(result.issues);
    };

    let debounceTimer = null;
    input.oninput = () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(run, 400);
    };
    $("#yaml-checker-run").onclick = run;
    $("#yaml-checker-clear").onclick = () => {
        input.value = "";
        resultEl.innerHTML = "";
        input.focus();
    };
}

// ---------------------------------------------------------------------
// Link direto para um comando/playbook (?kind=commands&id=42), criado
// pelo botao 🔗 de cada cartao — abre logo na categoria certa e destaca
// o item, sem o utilizador ter de o procurar manualmente.
// ---------------------------------------------------------------------

async function openDeepLink() {
    const params = new URLSearchParams(location.search);
    const kind = params.get("kind");
    const id = params.get("id");
    if (!kind || !id || !TABLE_FOR_TAB[kind]) return false;

    const { data } = await supabase.from(TABLE_FOR_TAB[kind]).select("*").eq("id", id).maybeSingle();
    if (!data) return false;

    if (kind === "scenarios") expandedScenarioCards.add(String(id));
    state.favoritesOnly = false;
    state.tab = kind;
    state.category = data.category || "";
    state.subcategory = data.subcategory || "";
    state.expandedCategory = data.category || "";
    if (kind === "scenarios") state.expandedPlaybooks = true;
    if (kind === "links") state.expandedLinks = true;

    await loadAndRender();
    highlightSharedCard(id);
    return true;
}

function highlightSharedCard(id) {
    // data-del existe em todos os tipos de cartao (commands/scenarios/links/glossary),
    // ao contrario de data-fav (so commands/scenarios) — marcador mais fiavel aqui.
    const marker = listEl.querySelector(`[data-del="${id}"]`);
    const card = marker?.closest(".entry");
    if (!card) return;
    card.scrollIntoView({ behavior: "smooth", block: "center" });
    card.classList.add("highlight-pulse");
    setTimeout(() => card.classList.remove("highlight-pulse"), 2000);
}

(async () => {
    await refreshNav();
    const opened = await openDeepLink();
    if (!opened) await loadAndRender();
})();
