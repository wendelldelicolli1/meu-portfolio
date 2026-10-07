/* WLD FILMS — painel administrativo */
const cfg = window.WLD_SUPABASE || {};
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

const CATEGORY_LABEL = { horizontal: "Vídeo horizontal", vertical: "Vídeo vertical", foto: "Fotos" };
const REQUEST_STATUS = { novo: "Novo", em_andamento: "Em andamento", orcado: "Orçado", fechado: "Fechado", arquivado: "Arquivado" };
const QUOTE_STATUS = { rascunho: "Rascunho", enviado: "Enviado", aprovado: "Aprovado", recusado: "Recusado" };

const state = {
  projects: [],
  requests: [],
  quotes: [],
  settings: {},
  projectFilter: "all",
  requestFilter: "open",
  editingProject: null,
  photos: [],
  editingQuote: null,
  items: [],
};

let sb;

/* ---------- utilidades ---------- */
function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]
  ));
}

function toast(message, isError = false) {
  const el = $("#toast");
  el.textContent = message;
  el.classList.toggle("error", isError);
  el.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { el.hidden = true; }, isError ? 6000 : 3000);
}

function fail(error, fallback = "Algo deu errado.") {
  console.error(error);
  toast(`${fallback} ${error?.message || ""}`.trim(), true);
}

function formatDate(iso) {
  if (!iso) return "";
  const [y, m, d] = String(iso).slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

function todayIso() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

function addDays(iso, days) {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + Number(days || 0)));
  return date.toISOString().slice(0, 10);
}

function timeAgo(iso) {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 60) return `há ${Math.max(minutes, 1)} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `há ${hours} h`;
  const days = Math.round(hours / 24);
  if (days < 30) return `há ${days} ${days === 1 ? "dia" : "dias"}`;
  return formatDate(iso);
}

function phoneDigits(phone) {
  let digits = String(phone || "").replace(/\D/g, "");
  if (digits.length === 10 || digits.length === 11) digits = `55${digits}`;
  return digits;
}

function youTubeId(url) {
  const match = String(url || "").match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/))([\w-]{11})/);
  return match ? match[1] : null;
}

function posterFor(project) {
  if (project.poster_url) return project.poster_url;
  const id = youTubeId(project.video_url);
  if (id) return `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
  return project.photos?.[0] || "";
}

function quoteNumber(quote) {
  const year = (quote.issue_date || todayIso()).slice(0, 4);
  return `ORC-${year}-${String(quote.number || 0).padStart(4, "0")}`;
}

function quoteTotals(quote) {
  const subtotal = (quote.items || []).reduce((sum, item) => sum + Number(item.qty || 0) * Number(item.price || 0), 0);
  const discount = Number(quote.discount || 0);
  return { subtotal, discount, total: Math.max(subtotal - discount, 0) };
}

/* ---------- inicialização e login ---------- */
function show(id) {
  ["auth", "setup", "app"].forEach((name) => { $(`#${name}`).hidden = name !== id; });
}

function authMessage(message, isError = false) {
  const el = $("#auth-msg");
  el.textContent = message;
  el.classList.toggle("error", isError);
}

function showLogin() {
  show("auth");
  $("#login-form").hidden = false;
  $("#reset-form").hidden = true;
}

function showReset() {
  show("auth");
  $("#login-form").hidden = true;
  $("#reset-form").hidden = false;
  authMessage("");
}

async function enter(session) {
  const { data, error } = await sb.from("admins").select("user_id").eq("user_id", session.user.id).maybeSingle();
  if (error || !data) {
    await sb.auth.signOut();
    showLogin();
    authMessage("Este usuário não tem acesso ao painel.", true);
    return;
  }
  show("app");
  await Promise.all([loadSettings(), loadProjects(), loadRequests(), loadQuotes()]);
}

async function boot() {
  if (!cfg.url || !cfg.anonKey || !window.supabase) {
    show("setup");
    return;
  }
  sb = window.supabase.createClient(cfg.url, cfg.anonKey);
  const recovering = /type=recovery/.test(location.hash);

  sb.auth.onAuthStateChange((event) => {
    if (event === "PASSWORD_RECOVERY") showReset();
  });

  if (recovering) {
    showReset();
    return;
  }

  const { data } = await sb.auth.getSession();
  if (data.session) enter(data.session);
  else showLogin();
}

$("#login-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector("button[type=submit]");
  button.disabled = true;
  authMessage("Entrando...");
  const { data, error } = await sb.auth.signInWithPassword({
    email: form.email.value.trim(),
    password: form.password.value,
  });
  button.disabled = false;
  if (error) {
    authMessage("E-mail ou senha incorretos.", true);
    return;
  }
  authMessage("");
  form.password.value = "";
  enter(data.session);
});

$("#forgot").addEventListener("click", async () => {
  const email = $("#login-form").email.value.trim();
  if (!email) {
    authMessage("Digite seu e-mail acima e clique de novo em “Esqueci minha senha”.", true);
    return;
  }
  const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: `${location.origin}/admin` });
  if (error) authMessage("Não consegui enviar o e-mail agora. Tente em alguns minutos.", true);
  else authMessage("Se o e-mail estiver cadastrado, chega um link para criar uma nova senha.");
});

$("#reset-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const password = event.currentTarget.password.value;
  const { error } = await sb.auth.updateUser({ password });
  if (error) {
    authMessage(`Não foi possível trocar a senha: ${error.message}`, true);
    return;
  }
  history.replaceState(null, "", location.pathname);
  authMessage("Senha alterada!");
  const { data } = await sb.auth.getSession();
  if (data.session) enter(data.session);
  else showLogin();
});

$("#logout").addEventListener("click", async () => {
  await sb.auth.signOut();
  showLogin();
  authMessage("Você saiu do painel.");
});

/* ---------- abas ---------- */
function switchView(view) {
  $$(".tabs [data-view]").forEach((tab) => tab.classList.toggle("active", tab.dataset.view === view));
  $$(".view").forEach((section) => { section.hidden = section.id !== `view-${view}`; });
  try { localStorage.setItem("wld-admin-view", view); } catch {}
}

$$(".tabs [data-view]").forEach((tab) => tab.addEventListener("click", () => switchView(tab.dataset.view)));
try {
  const saved = localStorage.getItem("wld-admin-view");
  if (saved && $(`#view-${saved}`)) switchView(saved);
} catch {}

function bindFilters(containerId, key, render) {
  $(`#${containerId}`).addEventListener("click", (event) => {
    const button = event.target.closest("[data-filter]");
    if (!button) return;
    state[key] = button.dataset.filter;
    $$(`#${containerId} [data-filter]`).forEach((b) => b.classList.toggle("active", b === button));
    render();
  });
}

$$("dialog [data-close]").forEach((button) => button.addEventListener("click", () => button.closest("dialog").close()));

/* ---------- upload de imagens ---------- */
async function shrinkImage(file, maxSize = 2400) {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && file.size < 2_500_000) return file;
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.86));
    return blob ? new File([blob], file.name.replace(/\.\w+$/, ".jpg"), { type: "image/jpeg" }) : file;
  } catch {
    return file;
  }
}

async function uploadImage(file) {
  const image = await shrinkImage(file);
  const ext = (image.name.split(".").pop() || "jpg").toLowerCase();
  const path = `projects/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await sb.storage.from("media").upload(path, image, {
    cacheControl: "31536000",
    contentType: image.type || "image/jpeg",
  });
  if (error) throw error;
  return sb.storage.from("media").getPublicUrl(path).data.publicUrl;
}

function storagePath(url) {
  const marker = "/storage/v1/object/public/media/";
  const index = String(url || "").indexOf(marker);
  return index === -1 ? null : decodeURIComponent(url.slice(index + marker.length).split("?")[0]);
}

async function removeStoredFiles(urls) {
  const paths = urls.map(storagePath).filter(Boolean);
  if (paths.length) await sb.storage.from("media").remove(paths);
}

/* =========================================================
   PROJETOS
   ========================================================= */
async function loadProjects() {
  const { data, error } = await sb.from("projects").select("*")
    .order("position", { ascending: true }).order("created_at", { ascending: false });
  if (error) return fail(error, "Erro ao carregar projetos.");
  state.projects = data;
  renderProjects();
}

function renderProjects() {
  const filter = state.projectFilter;
  const list = state.projects.filter((p) => (
    filter === "all" ? true : filter === "off" ? !p.published : p.category === filter
  ));
  const el = $("#project-list");
  if (!list.length) {
    el.innerHTML = `<div class="empty">Nenhum projeto aqui ainda.</div>`;
    return;
  }
  el.innerHTML = list.map((p) => {
    const siblings = state.projects.filter((s) => s.category === p.category);
    const idx = siblings.indexOf(p);
    const poster = posterFor(p);
    const extra = p.category === "foto" ? `${p.photos.length} fotos` : (youTubeId(p.video_url) ? "YouTube" : "Vídeo");
    return `
    <article class="row ${p.published ? "" : "off"}" data-id="${p.id}">
      <div class="thumb ${p.category === "vertical" ? "portrait" : ""}" style="${poster ? `background-image:url('${esc(poster)}')` : ""}">${poster ? "" : "SEM CAPA"}</div>
      <div>
        <h3>${esc(p.title)}</h3>
        <div class="meta">
          <span class="pill ${p.published ? "on" : "offp"}">${p.published ? "No ar" : "Fora do ar"}</span>
          <span>${CATEGORY_LABEL[p.category]}</span>${p.year ? `<span>· ${p.year}</span>` : ""}<span>· ${extra}</span>
        </div>
      </div>
      <div class="actions">
        <div class="order">
          <button class="icon-btn" data-act="up" title="Subir" ${idx === 0 ? "disabled" : ""}>↑</button>
          <button class="icon-btn" data-act="down" title="Descer" ${idx === siblings.length - 1 ? "disabled" : ""}>↓</button>
        </div>
        <button class="btn btn-line btn-sm" data-act="edit">Editar</button>
        <button class="btn btn-line btn-sm" data-act="toggle">${p.published ? "Tirar do ar" : "Publicar"}</button>
        <button class="btn btn-danger btn-sm" data-act="delete">Apagar</button>
      </div>
    </article>`;
  }).join("");
}

$("#project-list").addEventListener("click", async (event) => {
  const button = event.target.closest("[data-act]");
  if (!button) return;
  const project = state.projects.find((p) => p.id === button.closest("[data-id]").dataset.id);
  if (!project) return;
  const act = button.dataset.act;

  if (act === "edit") return openProject(project);

  if (act === "toggle") {
    const { error } = await sb.from("projects").update({ published: !project.published }).eq("id", project.id);
    if (error) return fail(error, "Não consegui alterar.");
    toast(project.published ? "Projeto tirado do ar." : "Projeto publicado no site.");
    return loadProjects();
  }

  if (act === "delete") {
    if (!confirm(`Apagar “${project.title}” de vez? Isso não pode ser desfeito.\n\nSe quiser só esconder do site, use “Tirar do ar”.`)) return;
    const { error } = await sb.from("projects").delete().eq("id", project.id);
    if (error) return fail(error, "Não consegui apagar.");
    removeStoredFiles([project.poster_url, ...(project.photos || [])]).catch(console.warn);
    toast("Projeto apagado.");
    return loadProjects();
  }

  if (act === "up" || act === "down") {
    const siblings = state.projects.filter((p) => p.category === project.category);
    const from = siblings.indexOf(project);
    const to = act === "up" ? from - 1 : from + 1;
    if (to < 0 || to >= siblings.length) return;
    [siblings[from], siblings[to]] = [siblings[to], siblings[from]];
    const base = Math.min(...siblings.map((p) => p.position));
    const updates = siblings
      .map((p, i) => ({ id: p.id, position: base + i, old: p.position }))
      .filter((u) => u.position !== u.old);
    button.disabled = true;
    const results = await Promise.all(updates.map((u) => sb.from("projects").update({ position: u.position }).eq("id", u.id)));
    const failed = results.find((r) => r.error);
    if (failed) fail(failed.error, "Não consegui reordenar.");
    loadProjects();
  }
});

bindFilters("project-filters", "projectFilter", renderProjects);

const projectForm = $("#project-form");

function updateProjectFormMode() {
  const isPhoto = projectForm.category.value === "foto";
  $$(".only-video", projectForm).forEach((el) => { el.hidden = isPhoto; });
  $$(".only-photo", projectForm).forEach((el) => { el.hidden = !isPhoto; });
  updateCoverPreview();
}

function updateCoverPreview() {
  const poster = posterFor({
    poster_url: projectForm.poster_url.value.trim(),
    video_url: projectForm.category.value === "foto" ? "" : projectForm.video_url.value.trim(),
    photos: state.photos,
  });
  const preview = $("#cover-preview");
  preview.style.backgroundImage = poster ? `url('${poster.replace(/'/g, "%27")}')` : "";
  preview.textContent = poster ? "" : "SEM CAPA";
}

function renderPhotoGrid() {
  $("#photo-grid").innerHTML = state.photos.map((url, i) => `
    <div class="ph" style="background-image:url('${esc(url)}')" data-i="${i}">
      <div class="ph-tools">
        <button type="button" data-ph="left" title="Mover para trás" ${i === 0 ? "hidden" : ""}>←</button>
        <button type="button" data-ph="remove" title="Remover">×</button>
        <button type="button" data-ph="right" title="Mover para frente" ${i === state.photos.length - 1 ? "hidden" : ""}>→</button>
      </div>
    </div>`).join("");
  updateCoverPreview();
}

$("#photo-grid").addEventListener("click", (event) => {
  const button = event.target.closest("[data-ph]");
  if (!button) return;
  const i = Number(button.closest("[data-i]").dataset.i);
  const act = button.dataset.ph;
  if (act === "remove") state.photos.splice(i, 1);
  if (act === "left") [state.photos[i - 1], state.photos[i]] = [state.photos[i], state.photos[i - 1]];
  if (act === "right") [state.photos[i + 1], state.photos[i]] = [state.photos[i], state.photos[i + 1]];
  renderPhotoGrid();
});

function openProject(project = null) {
  state.editingProject = project;
  state.photos = [...(project?.photos || [])];
  projectForm.reset();
  $("#project-dialog-title").textContent = project ? "Editar projeto" : "Novo projeto";
  $("#project-msg").textContent = "";
  projectForm.title.value = project?.title || "";
  projectForm.category.value = project?.category || "horizontal";
  projectForm.year.value = project?.year || new Date().getFullYear();
  projectForm.client.value = project?.client || "";
  projectForm.description.value = project?.description || "";
  projectForm.video_url.value = project?.video_url || "";
  projectForm.poster_url.value = project?.poster_url || "";
  projectForm.published.checked = project ? project.published : true;
  renderPhotoGrid();
  updateProjectFormMode();
  $("#project-dialog").showModal();
  projectForm.title.focus();
}

$("#new-project").addEventListener("click", () => openProject());
projectForm.category.addEventListener("change", updateProjectFormMode);
projectForm.video_url.addEventListener("input", updateCoverPreview);
projectForm.poster_url.addEventListener("input", updateCoverPreview);

$("#cover-file").addEventListener("change", async (event) => {
  const file = event.target.files[0];
  event.target.value = "";
  if (!file) return;
  const msg = $("#project-msg");
  msg.textContent = "Enviando capa...";
  try {
    projectForm.poster_url.value = await uploadImage(file);
    msg.textContent = "Capa enviada.";
    updateCoverPreview();
  } catch (error) {
    msg.textContent = "";
    fail(error, "Erro ao enviar a capa.");
  }
});

$("#photo-files").addEventListener("change", async (event) => {
  const files = [...event.target.files];
  event.target.value = "";
  if (!files.length) return;
  const msg = $("#project-msg");
  let done = 0;
  msg.textContent = `Enviando fotos... 0/${files.length}`;
  for (const file of files) {
    try {
      state.photos.push(await uploadImage(file));
      renderPhotoGrid();
    } catch (error) {
      fail(error, `Erro ao enviar ${file.name}.`);
    }
    msg.textContent = `Enviando fotos... ${++done}/${files.length}`;
  }
  msg.textContent = `${done} ${done === 1 ? "foto enviada" : "fotos enviadas"}. Não esqueça de salvar.`;
});

projectForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const msg = $("#project-msg");
  const category = projectForm.category.value;
  const payload = {
    title: projectForm.title.value.trim(),
    category,
    year: projectForm.year.value ? Number(projectForm.year.value) : null,
    client: projectForm.client.value.trim() || null,
    description: projectForm.description.value.trim() || null,
    video_url: category === "foto" ? null : projectForm.video_url.value.trim() || null,
    poster_url: projectForm.poster_url.value.trim() || null,
    photos: category === "foto" ? state.photos : [],
    published: projectForm.published.checked,
  };

  msg.classList.add("error");
  if (!payload.title) { msg.textContent = "Dê um título ao projeto."; return; }
  if (category !== "foto" && !payload.video_url) { msg.textContent = "Cole o link do vídeo."; return; }
  if (category === "foto" && !payload.photos.length) { msg.textContent = "Envie pelo menos uma foto."; return; }
  msg.classList.remove("error");

  const button = projectForm.querySelector("button[type=submit]");
  button.disabled = true;
  msg.textContent = "Salvando...";

  let result;
  if (state.editingProject) {
    result = await sb.from("projects").update(payload).eq("id", state.editingProject.id);
  } else {
    const minPosition = state.projects.reduce((min, p) => Math.min(min, p.position), 1);
    result = await sb.from("projects").insert({ ...payload, position: minPosition - 1 });
  }
  button.disabled = false;
  if (result.error) {
    msg.textContent = "";
    return fail(result.error, "Não consegui salvar.");
  }
  $("#project-dialog").close();
  toast(payload.published ? "Projeto salvo e no ar." : "Projeto salvo (fora do ar).");
  loadProjects();
});

/* =========================================================
   PEDIDOS DE ORÇAMENTO
   ========================================================= */
async function loadRequests() {
  const { data, error } = await sb.from("quote_requests").select("*").order("created_at", { ascending: false });
  if (error) return fail(error, "Erro ao carregar pedidos.");
  state.requests = data;
  renderRequests();
}

function renderRequests() {
  const newCount = state.requests.filter((r) => r.status === "novo").length;
  const badge = $("#badge-requests");
  badge.hidden = !newCount;
  badge.textContent = newCount;

  const filter = state.requestFilter;
  const list = state.requests.filter((r) => (
    filter === "all" ? true : filter === "open" ? ["novo", "em_andamento"].includes(r.status) : r.status === filter
  ));
  const el = $("#request-list");
  if (!list.length) {
    el.innerHTML = `<div class="empty">Nenhum pedido aqui. Quando alguém preencher o formulário do site, ele aparece nesta lista.</div>`;
    return;
  }

  const row = (label, value, wide = false) => (value ? `<div class="${wide ? "wide" : ""}"><dt>${label}</dt><dd>${esc(value)}</dd></div>` : "");

  el.innerHTML = list.map((r) => {
    const wa = phoneDigits(r.phone);
    return `
    <details class="req" data-id="${r.id}" ${r.status === "novo" ? "open" : ""}>
      <summary>
        <div>
          <h3>${esc(r.name)}${r.company ? ` <span class="muted">· ${esc(r.company)}</span>` : ""}</h3>
          <div class="meta"><span class="pill ${r.status}">${REQUEST_STATUS[r.status]}</span><span>${esc(r.service)}</span><span>· ${timeAgo(r.created_at)}</span></div>
        </div>
        <span class="muted">${r.event_date ? formatDate(r.event_date) : ""}</span>
      </summary>
      <dl class="req-body">
        ${row("WhatsApp", r.phone)}
        ${row("E-mail", r.email)}
        ${row("Serviço", r.service)}
        ${row("Do que se trata", r.project_type)}
        ${row("Data prevista", formatDate(r.event_date))}
        ${row("Local", r.location)}
        ${row("Cobertura", r.duration)}
        ${row("Prazo", r.deadline)}
        ${row("Investimento", r.budget_range)}
        ${row("Como conheceu", r.source)}
        ${row("Entregas", (r.deliverables || []).join(", "), true)}
        ${row("Quantidades", r.deliverables_detail, true)}
        ${row("Sobre a ideia", r.message, true)}
        ${row("Referências", r.references_links, true)}
      </dl>
      <div class="req-foot">
        <select data-act="status" aria-label="Situação do pedido">
          ${Object.entries(REQUEST_STATUS).map(([value, label]) => `<option value="${value}" ${value === r.status ? "selected" : ""}>${label}</option>`).join("")}
        </select>
        <button class="btn btn-acid btn-sm" data-act="quote">Gerar orçamento</button>
        ${wa ? `<a class="btn btn-line btn-sm" href="https://wa.me/${wa}" target="_blank" rel="noreferrer">WhatsApp ↗</a>` : ""}
        ${r.email ? `<a class="btn btn-line btn-sm" href="mailto:${esc(r.email)}">E-mail ↗</a>` : ""}
        <button class="btn btn-danger btn-sm" data-act="delete">Apagar</button>
        <textarea data-act="notes" placeholder="Anotações internas (só você vê)">${esc(r.admin_notes || "")}</textarea>
      </div>
    </details>`;
  }).join("");
}

async function updateRequest(id, changes, message) {
  const { error } = await sb.from("quote_requests").update(changes).eq("id", id);
  if (error) return fail(error, "Não consegui atualizar o pedido.");
  const request = state.requests.find((r) => r.id === id);
  if (request) Object.assign(request, changes);
  if (message) toast(message);
}

$("#request-list").addEventListener("change", async (event) => {
  const control = event.target.closest("[data-act]");
  if (!control) return;
  const id = control.closest("[data-id]").dataset.id;
  if (control.dataset.act === "status") {
    await updateRequest(id, { status: control.value }, "Situação atualizada.");
    renderRequests();
  }
  if (control.dataset.act === "notes") {
    await updateRequest(id, { admin_notes: control.value.trim() || null }, "Anotação salva.");
  }
});

$("#request-list").addEventListener("click", async (event) => {
  const button = event.target.closest("button[data-act]");
  if (!button) return;
  const request = state.requests.find((r) => r.id === button.closest("[data-id]").dataset.id);
  if (!request) return;

  if (button.dataset.act === "quote") {
    const existing = state.quotes.find((q) => q.request_id === request.id);
    if (existing && confirm(`Já existe o orçamento ${quoteNumber(existing)} para este pedido. Abrir ele?\n\n(Cancelar cria um novo.)`)) {
      switchView("quotes");
      return openQuote(existing);
    }
    switchView("quotes");
    return openQuote(null, request);
  }

  if (button.dataset.act === "delete") {
    if (!confirm(`Apagar o pedido de ${request.name}? Isso não pode ser desfeito.`)) return;
    const { error } = await sb.from("quote_requests").delete().eq("id", request.id);
    if (error) return fail(error, "Não consegui apagar.");
    toast("Pedido apagado.");
    loadRequests();
  }
});

bindFilters("request-filters", "requestFilter", renderRequests);

/* =========================================================
   ORÇAMENTOS
   ========================================================= */
async function loadQuotes() {
  const { data, error } = await sb.from("quotes").select("*").order("number", { ascending: false });
  if (error) return fail(error, "Erro ao carregar orçamentos.");
  state.quotes = data;
  renderQuotes();
}

function renderQuotes() {
  const el = $("#quote-list");
  if (!state.quotes.length) {
    el.innerHTML = `<div class="empty">Nenhum orçamento ainda. Crie um do zero ou a partir de um pedido.</div>`;
    return;
  }
  el.innerHTML = state.quotes.map((q) => {
    const { total } = quoteTotals(q);
    return `
    <article class="row" data-id="${q.id}" style="grid-template-columns:120px minmax(0,1fr) auto">
      <div class="thumb" style="background:var(--ink);color:var(--acid);font-weight:700">${quoteNumber(q).replace("ORC-", "")}</div>
      <div>
        <h3>${esc(q.client_name)}${q.title ? ` <span class="muted">· ${esc(q.title)}</span>` : ""}</h3>
        <div class="meta"><span class="pill ${q.status}">${QUOTE_STATUS[q.status]}</span><b style="color:var(--ink)">${brl.format(total)}</b><span>· ${formatDate(q.issue_date)}</span></div>
      </div>
      <div class="actions">
        <button class="btn btn-line btn-sm" data-act="edit">Abrir</button>
        <button class="btn btn-line btn-sm" data-act="pdf">PDF</button>
        ${q.client_phone ? `<button class="btn btn-line btn-sm" data-act="wa">WhatsApp</button>` : ""}
        <button class="btn btn-line btn-sm" data-act="dup">Duplicar</button>
        <button class="btn btn-danger btn-sm" data-act="delete">Apagar</button>
      </div>
    </article>`;
  }).join("");
}

function quoteWhatsApp(quote) {
  const { total } = quoteTotals(quote);
  const first = (quote.client_name || "").split(" ")[0];
  const text = [
    `Olá, ${first}! Tudo bem?`,
    `Segue o orçamento ${quoteNumber(quote)}${quote.title ? ` — ${quote.title}` : ""}.`,
    `Valor total: ${brl.format(total)}.`,
    `Válido até ${formatDate(addDays(quote.issue_date, quote.valid_days))}.`,
    "Vou te mandar o PDF aqui. Qualquer dúvida, fico à disposição!",
  ].join("\n");
  window.open(`https://wa.me/${phoneDigits(quote.client_phone)}?text=${encodeURIComponent(text)}`, "_blank", "noopener");
}

$("#quote-list").addEventListener("click", async (event) => {
  const button = event.target.closest("[data-act]");
  if (!button) return;
  const quote = state.quotes.find((q) => q.id === button.closest("[data-id]").dataset.id);
  if (!quote) return;
  const act = button.dataset.act;

  if (act === "edit") return openQuote(quote);
  if (act === "pdf") return printQuote(quote);
  if (act === "wa") return quoteWhatsApp(quote);

  if (act === "dup") {
    const { id, number, created_at, updated_at, request_id, ...copy } = quote;
    const { error } = await sb.from("quotes").insert({ ...copy, status: "rascunho", issue_date: todayIso() });
    if (error) return fail(error, "Não consegui duplicar.");
    toast("Orçamento duplicado.");
    return loadQuotes();
  }

  if (act === "delete") {
    if (!confirm(`Apagar o orçamento ${quoteNumber(quote)} de ${quote.client_name}? Isso não pode ser desfeito.`)) return;
    const { error } = await sb.from("quotes").delete().eq("id", quote.id);
    if (error) return fail(error, "Não consegui apagar.");
    toast("Orçamento apagado.");
    loadQuotes();
  }
});

const quoteForm = $("#quote-form");

function fillCatalogPicker() {
  const catalog = state.settings.catalog || [];
  $("#catalog-pick").innerHTML = `<option value="">+ Adicionar da tabela de serviços</option>` +
    catalog.map((c, i) => `<option value="${i}">${esc(c.name)}${Number(c.price) ? ` — ${brl.format(c.price)}` : ""}</option>`).join("");
}

function renderItems() {
  const el = $("#items");
  el.innerHTML = (state.items.length ? `
    <div class="item items-head"><span>Descrição</span><span>Qtd</span><span>Valor unit. (R$)</span><span>Total</span><span></span></div>` : "") +
    state.items.map((item, i) => `
    <div class="item" data-i="${i}">
      <input data-k="desc" value="${esc(item.desc)}" placeholder="Descrição do item" aria-label="Descrição">
      <input data-k="qty" type="number" min="0" step="1" value="${esc(item.qty)}" aria-label="Quantidade">
      <input data-k="price" type="number" min="0" step="0.01" value="${esc(item.price)}" aria-label="Valor unitário">
      <span class="sub">${brl.format(Number(item.qty || 0) * Number(item.price || 0))}</span>
      <button type="button" class="icon-btn" data-remove title="Remover item">×</button>
    </div>`).join("");
  updateTotals();
}

function updateTotals() {
  const { subtotal, total } = quoteTotals({ items: state.items, discount: quoteForm.discount.value });
  $("#q-subtotal").textContent = brl.format(subtotal);
  $("#q-total").textContent = brl.format(total);
}

$("#items").addEventListener("input", (event) => {
  const input = event.target.closest("[data-k]");
  if (!input) return;
  const row = input.closest("[data-i]");
  const item = state.items[Number(row.dataset.i)];
  item[input.dataset.k] = input.dataset.k === "desc" ? input.value : input.value === "" ? "" : Number(input.value);
  row.querySelector(".sub").textContent = brl.format(Number(item.qty || 0) * Number(item.price || 0));
  updateTotals();
});

$("#items").addEventListener("click", (event) => {
  const button = event.target.closest("[data-remove]");
  if (!button) return;
  state.items.splice(Number(button.closest("[data-i]").dataset.i), 1);
  renderItems();
});

$("#add-item").addEventListener("click", () => {
  state.items.push({ desc: "", qty: 1, price: 0 });
  renderItems();
  $$("#items [data-k=desc]").pop()?.focus();
});

$("#catalog-pick").addEventListener("change", (event) => {
  const entry = state.settings.catalog?.[Number(event.target.value)];
  event.target.value = "";
  if (!entry) return;
  state.items.push({ desc: entry.name, qty: 1, price: Number(entry.price) || 0 });
  renderItems();
});

quoteForm.discount.addEventListener("input", updateTotals);

function scopeFromRequest(request) {
  return [
    request.project_type && `Projeto: ${request.project_type}`,
    request.duration && `Cobertura: ${request.duration}`,
    request.deliverables?.length && `Entregas: ${request.deliverables.join(", ")}`,
    request.deliverables_detail && `Quantidades: ${request.deliverables_detail}`,
    request.deadline && `Prazo desejado: ${request.deadline}`,
    request.message,
  ].filter(Boolean).join("\n");
}

function openQuote(quote = null, request = null) {
  const s = state.settings;
  state.editingQuote = quote;
  state.fromRequest = request;
  quoteForm.reset();
  $("#quote-msg").textContent = "";
  $("#quote-dialog-title").textContent = quote ? `Orçamento ${quoteNumber(quote)}` : "Novo orçamento";

  const values = quote || {
    client_name: request?.name,
    client_company: request?.company,
    client_email: request?.email,
    client_phone: request?.phone,
    title: request ? `${request.service}${request.project_type ? ` — ${request.project_type}` : ""}` : "",
    event_date: request?.event_date,
    location: request?.location,
    scope: request ? scopeFromRequest(request) : "",
    discount: 0,
    issue_date: todayIso(),
    valid_days: 15,
    payment_terms: s.payment_terms,
    delivery_terms: s.delivery_terms,
    notes: s.notes,
    status: "rascunho",
  };

  ["client_name", "client_company", "client_doc", "client_email", "client_phone", "title", "event_date",
    "location", "scope", "discount", "issue_date", "valid_days", "payment_terms", "delivery_terms", "notes", "status"]
    .forEach((key) => { if (quoteForm[key]) quoteForm[key].value = values[key] ?? ""; });

  state.items = (quote?.items || []).map((item) => ({ ...item }));
  fillCatalogPicker();
  renderItems();
  $("#quote-dialog").showModal();
}

$("#new-quote").addEventListener("click", () => openQuote());

function collectQuote() {
  const value = (key) => quoteForm[key].value.trim() || null;
  return {
    client_name: value("client_name"),
    client_company: value("client_company"),
    client_doc: value("client_doc"),
    client_email: value("client_email"),
    client_phone: value("client_phone"),
    title: value("title"),
    event_date: value("event_date"),
    location: value("location"),
    scope: value("scope"),
    items: state.items
      .filter((item) => String(item.desc || "").trim())
      .map((item) => ({ desc: String(item.desc).trim(), qty: Number(item.qty) || 0, price: Number(item.price) || 0 })),
    discount: Number(quoteForm.discount.value) || 0,
    issue_date: value("issue_date") || todayIso(),
    valid_days: Number(quoteForm.valid_days.value) || 15,
    payment_terms: value("payment_terms"),
    delivery_terms: value("delivery_terms"),
    notes: value("notes"),
    status: quoteForm.status.value,
  };
}

async function saveQuote() {
  const msg = $("#quote-msg");
  const payload = collectQuote();
  if (!payload.client_name) {
    msg.textContent = "Informe o nome do cliente.";
    msg.classList.add("error");
    quoteForm.client_name.focus();
    return null;
  }
  msg.classList.remove("error");
  msg.textContent = "Salvando...";

  let result;
  if (state.editingQuote) {
    result = await sb.from("quotes").update(payload).eq("id", state.editingQuote.id).select().single();
  } else {
    result = await sb.from("quotes").insert({ ...payload, request_id: state.fromRequest?.id || null }).select().single();
  }
  if (result.error) {
    msg.textContent = "";
    fail(result.error, "Não consegui salvar o orçamento.");
    return null;
  }

  const saved = result.data;
  if (!state.editingQuote && state.fromRequest && ["novo", "em_andamento"].includes(state.fromRequest.status)) {
    await updateRequest(state.fromRequest.id, { status: "orcado" });
    renderRequests();
  }
  state.editingQuote = saved;
  state.fromRequest = null;
  $("#quote-dialog-title").textContent = `Orçamento ${quoteNumber(saved)}`;
  msg.textContent = `Salvo às ${new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}.`;
  loadQuotes();
  return saved;
}

quoteForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = quoteForm.querySelector("button[type=submit]");
  button.disabled = true;
  const saved = await saveQuote();
  button.disabled = false;
  if (saved) toast(`Orçamento ${quoteNumber(saved)} salvo.`);
});

$("#quote-pdf").addEventListener("click", async () => {
  const saved = await saveQuote();
  if (saved) printQuote(saved);
});

/* ---------- PDF ---------- */
function printQuote(quote) {
  const s = state.settings;
  const { subtotal, discount, total } = quoteTotals(quote);
  const number = quoteNumber(quote);
  const validUntil = formatDate(addDays(quote.issue_date, quote.valid_days));
  const lines = (...parts) => parts.filter(Boolean).map(esc).join("<br>");

  $("#print-root").innerHTML = `
  <div class="doc">
    <header class="doc-head">
      <div>
        <p class="doc-brand">${esc((s.business_name || "WLD FILMS").replace(/\s*FILMS$/i, ""))} <span>${/FILMS$/i.test(s.business_name || "WLD FILMS") ? "FILMS" : ""}</span></p>
        <p class="doc-title">PROPOSTA<br><em>comercial.</em></p>
      </div>
      <div class="doc-num">
        Orçamento<b>${number}</b>
        Emissão ${formatDate(quote.issue_date)}<br>Válido até ${validUntil}
      </div>
    </header>

    <div class="doc-body">
      <section class="doc-parties">
        <div>
          <p class="doc-label">De</p>
          <p><strong>${esc(s.business_name || "WLD FILMS")}</strong></p>
          <p>${lines(s.owner_name, s.document && `CPF/CNPJ ${s.document}`, s.email, s.phone, s.city)}</p>
        </div>
        <div>
          <p class="doc-label">Para</p>
          <p><strong>${esc(quote.client_name)}</strong></p>
          <p>${lines(quote.client_company, quote.client_doc && `CPF/CNPJ ${quote.client_doc}`, quote.client_email, quote.client_phone)}</p>
        </div>
      </section>

      <section class="doc-project">
        <p class="doc-label">Projeto</p>
        <h2>${esc(quote.title || "Produção audiovisual")}</h2>
        ${quote.event_date || quote.location ? `<p class="doc-facts">${quote.event_date ? `<span>Data: ${formatDate(quote.event_date)}</span>` : ""}${quote.location ? `<span>Local: ${esc(quote.location)}</span>` : ""}</p>` : ""}
        ${quote.scope ? `<p class="doc-scope">${esc(quote.scope)}</p>` : ""}
      </section>

      <table class="doc-table">
        <thead><tr><th>#</th><th>Descrição</th><th class="n">Qtd</th><th class="n">Valor unit.</th><th class="n">Total</th></tr></thead>
        <tbody>
          ${(quote.items || []).map((item, i) => `
          <tr><td>${String(i + 1).padStart(2, "0")}</td><td>${esc(item.desc)}</td><td class="n">${item.qty}</td><td class="n">${brl.format(item.price)}</td><td class="n">${brl.format(item.qty * item.price)}</td></tr>`).join("")}
        </tbody>
      </table>

      <div class="doc-sum"><table>
        ${discount ? `<tr><td>Subtotal</td><td>${brl.format(subtotal)}</td></tr><tr><td>Desconto</td><td>− ${brl.format(discount)}</td></tr>` : ""}
        <tr class="grand"><td>Total</td><td>${brl.format(total)}</td></tr>
      </table></div>

      <section class="doc-terms">
        ${quote.payment_terms ? `<div><p class="doc-label">Pagamento</p><p>${esc(quote.payment_terms)}${s.pix ? `\nPIX: ${esc(s.pix)}` : ""}</p></div>` : ""}
        ${quote.delivery_terms ? `<div><p class="doc-label">Prazo de entrega</p><p>${esc(quote.delivery_terms)}</p></div>` : ""}
        ${quote.notes ? `<div class="wide"><p class="doc-label">Observações</p><p>${esc(quote.notes)}</p></div>` : ""}
      </section>

      <section class="doc-sign">
        <div>${esc(s.owner_name || s.business_name || "WLD FILMS")}</div>
        <div>De acordo — ${esc(quote.client_name)}</div>
      </section>
    </div>

    <footer class="doc-foot">
      <span>${esc(s.email || "")}</span><span>${esc(s.phone || "")}</span><span>${esc(s.instagram || "")}</span>
    </footer>
  </div>`;

  const previousTitle = document.title;
  document.title = `Orçamento ${number} - ${quote.client_name}`;
  window.addEventListener("afterprint", () => { document.title = previousTitle; }, { once: true });
  setTimeout(() => window.print(), 50);
}

/* =========================================================
   AJUSTES
   ========================================================= */
const settingsForm = $("#settings-form");
const SETTINGS_FIELDS = ["business_name", "owner_name", "document", "city", "email", "phone", "instagram", "pix", "payment_terms", "delivery_terms", "notes"];

async function loadSettings() {
  const { data, error } = await sb.from("settings").select("data").eq("id", 1).maybeSingle();
  if (error) return fail(error, "Erro ao carregar ajustes.");
  state.settings = data?.data || {};
  SETTINGS_FIELDS.forEach((key) => { settingsForm[key].value = state.settings[key] || ""; });
  renderCatalog(state.settings.catalog || []);
}

function renderCatalog(catalog) {
  $("#catalog-rows").innerHTML = catalog.map((entry) => `
    <div class="cat-row">
      <input data-k="name" value="${esc(entry.name)}" placeholder="Nome do serviço" aria-label="Nome do serviço">
      <input data-k="price" type="number" min="0" step="0.01" value="${esc(entry.price)}" placeholder="Preço (R$)" aria-label="Preço">
      <button type="button" class="icon-btn" data-remove title="Remover">×</button>
    </div>`).join("");
}

function readCatalog() {
  return $$("#catalog-rows .cat-row")
    .map((row) => ({ name: $("[data-k=name]", row).value.trim(), price: Number($("[data-k=price]", row).value) || 0 }))
    .filter((entry) => entry.name);
}

$("#add-catalog").addEventListener("click", () => {
  renderCatalog([...readCatalog(), { name: "", price: "" }]);
  $$("#catalog-rows [data-k=name]").pop()?.focus();
});

$("#catalog-rows").addEventListener("click", (event) => {
  const button = event.target.closest("[data-remove]");
  if (button) button.closest(".cat-row").remove();
});

settingsForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const data = { ...state.settings, catalog: readCatalog() };
  SETTINGS_FIELDS.forEach((key) => { data[key] = settingsForm[key].value.trim(); });
  const button = settingsForm.querySelector("button[type=submit]");
  button.disabled = true;
  const { error } = await sb.from("settings").upsert({ id: 1, data, updated_at: new Date().toISOString() });
  button.disabled = false;
  if (error) return fail(error, "Não consegui salvar os ajustes.");
  state.settings = data;
  renderCatalog(data.catalog);
  toast("Ajustes salvos.");
});

boot();
