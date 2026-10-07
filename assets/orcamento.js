const WHATSAPP = "5548996717002";
const form = document.getElementById("quote-form");
const statusEl = document.getElementById("form-status");

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.classList.toggle("error", isError);
}

function collect() {
  const data = new FormData(form);
  const value = (name) => (data.get(name) || "").toString().trim() || null;
  return {
    name: value("name"),
    phone: value("phone"),
    email: value("email"),
    company: value("company"),
    service: value("service"),
    project_type: value("project_type"),
    message: value("message"),
    event_date: value("event_date"),
    location: value("location"),
    duration: value("duration"),
    deliverables: data.getAll("deliverables").map(String),
    deliverables_detail: value("deliverables_detail"),
    deadline: value("deadline"),
    budget_range: value("budget_range"),
    source: value("source"),
    references_links: value("references_links"),
  };
}

function whatsappText(request) {
  const lines = [
    `Olá, Wendell! Sou ${request.name} e quero um orçamento.`,
    `Serviço: ${request.service}`,
    request.project_type && `Projeto: ${request.project_type}`,
    request.event_date && `Data: ${request.event_date.split("-").reverse().join("/")}`,
    request.location && `Local: ${request.location}`,
    request.deliverables.length && `Entregas: ${request.deliverables.join(", ")}`,
  ].filter(Boolean);
  return `https://wa.me/${WHATSAPP}?text=${encodeURIComponent(lines.join("\n"))}`;
}

function validate(request) {
  if (!request.name || request.name.length < 2) return ["name", "Informe seu nome."];
  if (!request.phone || request.phone.replace(/\D/g, "").length < 8) return ["phone", "Informe um WhatsApp válido."];
  if (request.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(request.email)) return ["email", "Confira o e-mail."];
  if (!request.service) return ["service", "Escolha o tipo de serviço."];
  return null;
}

function showDone(request) {
  form.hidden = true;
  const done = document.getElementById("quote-done");
  document.getElementById("done-name").textContent = `${request.name.split(" ")[0]}.`;
  document.getElementById("done-whatsapp").href = whatsappText(request);
  done.hidden = false;
  done.scrollIntoView({ behavior: "smooth", block: "start" });
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (form.website.value) return; // robôs preenchem o campo escondido

  const request = collect();
  const problem = validate(request);
  if (problem) {
    setStatus(problem[1], true);
    form.elements[problem[0]]?.focus();
    return;
  }

  const config = window.WLD_SUPABASE;
  if (!config?.url || !config?.anonKey) {
    // Sem banco configurado: segue o pedido pelo WhatsApp.
    window.open(whatsappText(request), "_blank", "noopener");
    showDone(request);
    return;
  }

  const button = form.querySelector("button[type=submit]");
  button.disabled = true;
  setStatus("Enviando...");

  try {
    const response = await fetch(`${config.url}/rest/v1/quote_requests`, {
      method: "POST",
      headers: {
        apikey: config.anonKey,
        Authorization: `Bearer ${config.anonKey}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify(request),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    setStatus("");
    showDone(request);
  } catch (error) {
    console.error(error);
    setStatus("Não consegui enviar agora. Tente de novo ou fale direto pelo WhatsApp.", true);
    button.disabled = false;
  }
});
