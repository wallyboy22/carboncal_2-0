// Menu comum, página atual e alternância de tema (claro terroso / escuro terroso).
(function () {
  var PAGES = [['index.html', 'Início'], ['modulos.html', 'Módulos'], ['estatisticas.html', 'Estatísticas'],
               ['dados.html', 'Dados'], ['fluxo.html', 'Fluxo']];
  var here = location.pathname.split('/').pop() || 'index.html';
  var root = document.documentElement;
  var theme = 'light';
  try { theme = localStorage.getItem('ccal-theme') || 'light'; } catch (e) {}
  root.dataset.theme = theme;

  var header = document.createElement('header');
  header.className = 'top';
  header.innerHTML = '<div class="top-in"><a class="brand" href="index.html">CC<span>AL</span></a><nav aria-label="Páginas">' +
    PAGES.map(function (p) {
      return '<a href="' + p[0] + '"' + (p[0] === here ? ' aria-current="page"' : '') + '>' + p[1] + '</a>';
    }).join('') + '</nav><button class="theme" type="button"></button></div>';
  document.body.insertBefore(header, document.body.firstChild);

  var button = header.querySelector('.theme');
  function label() { button.textContent = root.dataset.theme === 'dark' ? '☀ Claro' : '☾ Escuro'; }
  label();
  button.addEventListener('click', function () {
    root.dataset.theme = root.dataset.theme === 'dark' ? 'light' : 'dark';
    try { localStorage.setItem('ccal-theme', root.dataset.theme); } catch (e) {}
    label();
    document.dispatchEvent(new CustomEvent('ccal-theme'));
  });
})();
