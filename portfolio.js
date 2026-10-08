const PANEL_FOR = { horizontal: "horizontal-panel", vertical: "vertical-panel", foto: "photos-panel" };

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]
  ));
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

function videoArticle(project, index) {
  const title = escapeHtml(project.title);
  const portrait = project.category === "vertical" ? " portrait" : "";
  const description = project.description
    ? `<p class="project-description">${escapeHtml(project.description)}</p>`
    : "";
  return `
  <article class="project">
    <div class="project-media${portrait}">
      <video data-src="${escapeHtml(project.video_url || "")}" poster="${escapeHtml(posterFor(project))}" aria-label="${title}" playsinline preload="none"></video><button class="video-play" type="button" aria-label="Reproduzir ${title}"></button>
      <span>${String(index).padStart(2, "0")}</span>
    </div>
    <div class="project-meta">
      <h2>${title}</h2><p class="project-year">${escapeHtml(project.year || "")}</p>
      <p class="project-tag">${escapeHtml(project.client || "Vídeos")}</p>
      ${description}
    </div>
  </article>`;
}

function photoArticle(project, index) {
  const title = escapeHtml(project.title);
  const photos = project.photos || [];
  const cover = posterFor(project);
  const description = project.description
    ? `<p class="project-description">${escapeHtml(project.description)}</p>`
    : "";
  return `
  <article class="project photo-project" data-photos="${escapeHtml(JSON.stringify(photos))}" data-title="${title}">
    <button class="project-media photo-open" type="button" aria-label="Ver fotos de ${title}">
      ${cover ? `<img src="${escapeHtml(cover)}" alt="" loading="lazy">` : ""}
      <span>${String(index).padStart(2, "0")}</span>
      <i class="photo-count">${photos.length} ${photos.length === 1 ? "foto" : "fotos"}</i>
    </button>
    <div class="project-meta">
      <h2>${title}</h2><p class="project-year">${escapeHtml(project.year || "")}</p>
      <p class="project-tag">${escapeHtml(project.client || "Fotos")}</p>
      ${description}
    </div>
  </article>`;
}

function setCount(panelId, count) {
  const tab = document.querySelector(`.project-menu [data-panel="${panelId}"]`);
  if (!tab) return;
  let badge = tab.querySelector("span");
  if (!badge) {
    badge = document.createElement("span");
    tab.append(" ", badge);
  }
  badge.textContent = `(${String(count).padStart(2, "0")})`;
}

function renderProjects(projects) {
  const groups = { horizontal: [], vertical: [], foto: [] };
  projects.forEach((project) => groups[project.category]?.push(project));

  let index = 0;
  ["horizontal", "vertical"].forEach((category) => {
    const panel = document.getElementById(PANEL_FOR[category]);
    if (!panel) return;
    panel.innerHTML = groups[category].map((project) => videoArticle(project, ++index)).join("");
    setCount(PANEL_FOR[category], groups[category].length);
  });

  const photosPanel = document.getElementById("photos-panel");
  if (photosPanel && groups.foto.length) {
    photosPanel.className = "project-list photo-list portfolio-panel";
    photosPanel.innerHTML = groups.foto.map((project) => photoArticle(project, ++index)).join("");
    setCount("photos-panel", groups.foto.length);
  }

  const total = document.querySelector("#projetos .section-heading p:last-child");
  if (total) total.textContent = `(${String(projects.length).padStart(2, "0")})`;

  // Esconde abas de vídeo sem nenhum projeto (Fotos mostra o "em breve").
  ["horizontal", "vertical"].forEach((category) => {
    const tab = document.querySelector(`.project-menu [data-panel="${PANEL_FOR[category]}"]`);
    if (tab) tab.hidden = groups[category].length === 0;
  });
  const firstVisible = document.querySelector(".project-menu [data-panel]:not([hidden])");
  if (firstVisible) activatePanel(firstVisible);
}

async function loadProjects() {
  const config = window.WLD_SUPABASE;
  if (!config?.url || !config?.anonKey) return;
  try {
    const response = await fetch(
      `${config.url}/rest/v1/projects?select=*&published=eq.true&order=position.asc,created_at.desc`,
      { headers: { apikey: config.anonKey, Authorization: `Bearer ${config.anonKey}` } }
    );
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const projects = await response.json();
    if (Array.isArray(projects) && projects.length) renderProjects(projects);
  } catch (error) {
    console.warn("Portfólio: usando a versão estática.", error);
  }
}

function activatePanel(button) {
  document.querySelectorAll(".project-menu [data-panel]").forEach((tab) => {
    const active = tab === button;
    tab.classList.toggle("active", active);
    tab.setAttribute("aria-selected", String(active));
  });

  document.querySelectorAll(".portfolio-panel").forEach((panel) => {
    panel.hidden = panel.id !== button.dataset.panel;
  });
}

document.querySelectorAll(".project-menu [data-panel]").forEach((tab) => {
  tab.addEventListener("click", () => activatePanel(tab));
});

async function playVideo(button) {
  const media = button.parentElement;
  const video = media?.querySelector("video");
  if (!video) return;

  document.querySelectorAll(".project-media video").forEach((other) => {
    if (other !== video) other.pause();
  });

  const ytId = youTubeId(video.dataset.src);
  if (ytId) {
    const frame = document.createElement("iframe");
    frame.src = `https://www.youtube-nocookie.com/embed/${ytId}?autoplay=1&rel=0&playsinline=1`;
    frame.title = video.getAttribute("aria-label") || "Vídeo";
    frame.allow = "autoplay; encrypted-media; picture-in-picture; fullscreen";
    frame.allowFullscreen = true;
    frame.className = "project-embed";
    media.append(frame);
    button.hidden = true;
    return;
  }

  if (!video.src) video.src = video.dataset.src;
  video.controls = true;
  button.hidden = true;

  try {
    await video.play();
  } catch {
    button.hidden = false;
  }
}

// Lightbox das fotos
let lightbox;
let lightboxPhotos = [];
let lightboxIndex = 0;

function showPhoto(index) {
  lightboxIndex = (index + lightboxPhotos.length) % lightboxPhotos.length;
  lightbox.querySelector("img").src = lightboxPhotos[lightboxIndex];
  lightbox.querySelector(".lightbox-count").textContent = `${lightboxIndex + 1} / ${lightboxPhotos.length}`;
}

function openLightbox(article) {
  lightboxPhotos = JSON.parse(article.dataset.photos || "[]");
  if (!lightboxPhotos.length) return;
  if (!lightbox) {
    lightbox = document.createElement("div");
    lightbox.className = "lightbox";
    lightbox.setAttribute("role", "dialog");
    lightbox.setAttribute("aria-modal", "true");
    lightbox.innerHTML = `
      <p class="lightbox-title"></p><p class="lightbox-count"></p>
      <button type="button" class="lightbox-close" aria-label="Fechar">×</button>
      <button type="button" class="lightbox-prev" aria-label="Foto anterior">←</button>
      <img alt="">
      <button type="button" class="lightbox-next" aria-label="Próxima foto">→</button>`;
    lightbox.addEventListener("click", (event) => {
      if (event.target.closest(".lightbox-prev")) showPhoto(lightboxIndex - 1);
      else if (event.target.closest(".lightbox-next")) showPhoto(lightboxIndex + 1);
      else if (event.target === lightbox || event.target.closest(".lightbox-close")) closeLightbox();
    });
    document.body.append(lightbox);
  }
  lightbox.querySelector(".lightbox-title").textContent = article.dataset.title || "";
  lightbox.hidden = false;
  document.body.style.overflow = "hidden";
  showPhoto(0);
}

function closeLightbox() {
  if (!lightbox) return;
  lightbox.hidden = true;
  document.body.style.overflow = "";
}

document.addEventListener("keydown", (event) => {
  if (!lightbox || lightbox.hidden) return;
  if (event.key === "Escape") closeLightbox();
  if (event.key === "ArrowLeft") showPhoto(lightboxIndex - 1);
  if (event.key === "ArrowRight") showPhoto(lightboxIndex + 1);
});

document.addEventListener("click", (event) => {
  const play = event.target.closest(".video-play");
  if (play) return playVideo(play);
  const photo = event.target.closest(".photo-open");
  if (photo) openLightbox(photo.closest(".photo-project"));
});

loadProjects();

const hero = document.querySelector(".hero");
const visual = document.querySelector(".hero-visual");

if (hero && visual && matchMedia("(pointer:fine)").matches) {
  hero.addEventListener("pointermove", (event) => {
    const bounds = hero.getBoundingClientRect();
    const x = (event.clientX - bounds.left) / bounds.width - 0.5;
    const y = (event.clientY - bounds.top) / bounds.height - 0.5;
    visual.style.setProperty("--mx", `${x * 24}px`);
    visual.style.setProperty("--my", `${y * 18}px`);
    visual.style.setProperty("--imx", `${x * -18}px`);
    visual.style.setProperty("--imy", `${y * -14}px`);
    visual.style.setProperty("--rx", `${x * 2}deg`);
    visual.style.setProperty("--ry", `${y * -2}deg`);
  });

  hero.addEventListener("pointerleave", () => {
    ["--mx", "--my", "--imx", "--imy"].forEach((property) => visual.style.setProperty(property, "0px"));
    ["--rx", "--ry"].forEach((property) => visual.style.setProperty(property, "0deg"));
  });
}
