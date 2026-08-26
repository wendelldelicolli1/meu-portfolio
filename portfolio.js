const tabs = [...document.querySelectorAll(".project-menu [data-panel]")];
const panels = [...document.querySelectorAll(".portfolio-panel")];

function activatePanel(button) {
  tabs.forEach((tab) => {
    const active = tab === button;
    tab.classList.toggle("active", active);
    tab.setAttribute("aria-selected", String(active));
  });

  panels.forEach((panel) => {
    panel.hidden = panel.id !== button.dataset.panel;
  });

  const panel = document.getElementById(button.dataset.panel);
  panel?.querySelectorAll("iframe[data-src]").forEach((frame) => {
    frame.src = frame.dataset.src;
    frame.removeAttribute("data-src");
  });
}

tabs.forEach((tab) => tab.addEventListener("click", () => activatePanel(tab)));

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
