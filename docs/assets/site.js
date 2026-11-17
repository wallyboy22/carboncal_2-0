// Aviso, menu, rodapé e tema comuns às páginas.
(function () {
  var PAGES = [['index.html', 'Início'], ['metodo.html', 'Método'], ['processos.html', 'Processos'], ['estatisticas.html', 'Estatísticas'], ['dados.html', 'Dados']];
  var here = location.pathname.split('/').pop() || 'index.html';
  var root = document.documentElement;
  var theme = 'light';
  try { theme = localStorage.getItem('ccal-theme') || 'light'; } catch (e) {}
  root.dataset.theme = theme;

  var NOTICE = 'Página <strong>não oficial e exploratória</strong>. Todo o conteúdo pertence e está reservado ao IPAM. ' +
    'Sites oficiais: <a href="https://carboncal.org.br" target="_blank" rel="noopener">carboncal.org.br</a> · ' +
    '<a href="https://ipam.org.br" target="_blank" rel="noopener">ipam.org.br</a>';

  var bar = document.createElement('div');
  bar.className = 'notice';
  bar.innerHTML = NOTICE;
  var header = document.createElement('header');
  header.className = 'top';
  header.innerHTML = '<div class="top-in"><a class="brand" href="index.html"><img src="assets/logos/ccal.png" alt="CCAL"><small>exploratório</small></a>' +
    '<nav aria-label="Páginas">' + PAGES.map(function (p) {
      return '<a href="' + p[0] + '"' + (p[0] === here ? ' aria-current="page"' : '') + '>' + p[1] + '</a>';
    }).join('') + '</nav><button class="theme" type="button"></button></div>';
  document.body.insertBefore(header, document.body.firstChild);
  document.body.insertBefore(bar, header);

  var button = header.querySelector('.theme');
  function label() { button.innerHTML = root.dataset.theme === 'dark' ? '☀<span class="tl"> Claro</span>' : '☾<span class="tl"> Escuro</span>'; }
  label();
  button.addEventListener('click', function () {
    root.dataset.theme = root.dataset.theme === 'dark' ? 'light' : 'dark';
    try { localStorage.setItem('ccal-theme', root.dataset.theme); } catch (e) {}
    label();
    document.dispatchEvent(new CustomEvent('ccal-theme'));
  });

  document.addEventListener('DOMContentLoaded', function () {
    var foot = document.createElement('footer');
    foot.className = 'site';
    foot.innerHTML = '<div class="in"><div class="foot-logos"><img class="ccal" src="assets/logos/ccal.png" alt="CCAL"><img src="assets/logos/ipam.png" alt="IPAM"><div><strong>CCAL · Calculadora de Carbono</strong><br>Instituto de Pesquisa Ambiental da Amazônia (IPAM)</div></div>' +
      '<div>' + NOTICE + '</div>' +
      '<div class="muted">Como citar: ALENCAR, A. A. C. et al. <em>Nota metodológica: monitoramento de estoques de carbono e suas mudanças ocasionadas por corte raso, fogo e corte seletivo via plataforma CCAL</em>. Versão 2.1. Brasília, DF: IPAM, 2025.</div></div>';
    document.body.appendChild(foot);
  });
})();

// Utilitários para gráficos: cores do tema atual.
window.ccalColor = function (name) {
  return getComputedStyle(document.documentElement).getPropertyValue('--' + name).trim();
};
