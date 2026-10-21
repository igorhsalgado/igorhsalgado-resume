// Pequenos extras do portfólio. A página funciona igual sem este arquivo:
// tudo aqui só melhora a navegação quando o JavaScript está ligado.

// Quem pediu menos movimento no sistema não recebe rolagem animada.
const menosMovimento = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// 1. Destaca na navegação a seção que está na tela.
function destacarSecaoAtual() {
  const links = document.querySelectorAll(".nav-link");
  if (!("IntersectionObserver" in window) || links.length === 0) return;

  // Liga cada seção (pelo id) ao link que aponta para ela.
  const linkDaSecao = new Map();
  links.forEach((link) => {
    const secao = document.querySelector(link.getAttribute("href"));
    if (secao) linkDaSecao.set(secao, link);
  });

  function marcar(link) {
    links.forEach((outro) => {
      outro.classList.toggle("is-active", outro === link);
      if (outro === link) outro.setAttribute("aria-current", "true");
      else outro.removeAttribute("aria-current");
    });
  }

  // Todas as seções, na ordem da página, e quais cruzam uma faixa no alto da tela
  // (de 20% a 50% da altura, abaixo do cabeçalho fixo).
  const secoes = [...document.querySelectorAll("main section[id]")];
  const visiveis = new Set();

  // A seção atual é a primeira (na ordem da página) que cruza essa faixa.
  // No fim da página vale a última, que pode nunca subir até lá.
  // Seções sem link (o topo e a do GitHub) apagam o destaque.
  function atualizar() {
    const noFim = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2;
    const atual = noFim ? secoes[secoes.length - 1] : secoes.find((s) => visiveis.has(s));
    marcar(linkDaSecao.get(atual) || null);
  }

  const observador = new IntersectionObserver(
    (entradas) => {
      entradas.forEach((entrada) => {
        if (entrada.isIntersecting) visiveis.add(entrada.target);
        else visiveis.delete(entrada.target);
      });
      atualizar();
    },
    { rootMargin: "-20% 0px -50% 0px" }
  );
  secoes.forEach((secao) => observador.observe(secao));
  window.addEventListener("scroll", atualizar, { passive: true });
}

// 2. Botão "copiar e-mail", com aviso de que copiou.
function ativarCopiarEmail() {
  const item = document.querySelector("[data-copy-item]");
  if (!item) return;
  const botao = item.querySelector("[data-copy]");
  const aviso = item.querySelector(".copy-status");
  let timer;

  item.hidden = false;

  botao.addEventListener("click", async () => {
    const email = botao.dataset.copy;
    let copiou = false;
    try {
      await navigator.clipboard.writeText(email);
      copiou = true;
    } catch {
      copiou = copiarDoJeitoAntigo(email);
    }

    aviso.textContent = copiou ? "copiado!" : "não deu para copiar: " + email;
    clearTimeout(timer);
    timer = setTimeout(() => (aviso.textContent = ""), 2500);
  });
}

// Plano B para navegadores sem a API de área de transferência.
function copiarDoJeitoAntigo(texto) {
  const campo = document.createElement("textarea");
  campo.value = texto;
  campo.setAttribute("readonly", "");
  campo.style.position = "fixed";
  campo.style.opacity = "0";
  document.body.appendChild(campo);
  campo.select();
  let ok = false;
  try {
    ok = document.execCommand("copy");
  } catch {
    ok = false;
  }
  campo.remove();
  return ok;
}

// 3. Voltar ao topo: botão flutuante depois de rolar uma tela, e o link do rodapé.
// Sem JavaScript, o link "↑ topo" do rodapé continua funcionando (é uma âncora).
function ativarVoltarAoTopo() {
  const botao = document.querySelector(".to-top");
  const marca = document.querySelector(".nav-brand");

  function voltar(evento) {
    evento.preventDefault();
    window.scrollTo({ top: 0, behavior: menosMovimento ? "auto" : "smooth" });
    // Leva o foco do teclado de volta ao começo da página.
    if (marca) marca.focus({ preventScroll: true });
  }

  if (botao) {
    // Some no começo da página e quando o rodapé (que já tem "↑ topo") aparece.
    const rodape = document.querySelector(".site-footer");
    const mostrarOuEsconder = () => {
      const fimDaTela = window.scrollY + window.innerHeight;
      const rodapeVisivel = rodape && fimDaTela > document.documentElement.scrollHeight - rodape.offsetHeight;
      botao.hidden = window.scrollY < window.innerHeight || rodapeVisivel;
    };
    window.addEventListener("scroll", mostrarOuEsconder, { passive: true });
    mostrarOuEsconder();
    botao.addEventListener("click", voltar);
  }

  const linkDoRodape = document.querySelector(".footer-top");
  if (linkDoRodape) linkDoRodape.addEventListener("click", voltar);
}

destacarSecaoAtual();
ativarCopiarEmail();
ativarVoltarAoTopo();
