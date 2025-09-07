var typed = new Typed('.multiple-text', {
  strings: ['Filmmaker', 'Editor de Vídeo', 'Fotógrafo'],
  typeSpeed: 100,
  backSpeed: 100,
  backDelay: 1000,
  loop: true
});

// Rolagem suave (caso o navegador não suporte scroll-behavior do CSS)
document.querySelectorAll('a[href^="#"]').forEach(link => {
  link.addEventListener("click", function (e) {
    e.preventDefault();
    const alvo = document.querySelector(this.getAttribute("href"));
    alvo.scrollIntoView({
      behavior: "smooth"
    });
  });
});

fetch("JS/portfolio.json")
  .then(response => response.json())
  .then(videos => {
    const container = document.getElementById("portfolio-container");

    videos.forEach(video => {
      const div = document.createElement("div");
      div.classList.add("portfolio-item");

      // Se for YouTube (iframe) ou arquivo local (video tag)
      if (video.type === "youtube") {
        div.innerHTML = `<iframe src="${video.src}" frameborder="0" allowfullscreen></iframe>`;
      } else if (video.type === "video") {
        div.innerHTML = `<video src="${video.src}" controls></video>`;
      }

      container.appendChild(div);
    });
  })
  .catch(err => console.error("Erro ao carregar vídeos:", err));
