"""Gera docs/estatisticas.html (GitHub Pages) a partir de STATISTICS/ccal_02_v_1.

Arquivo único com os dados embutidos em formato colunar; filtros e agregações
acontecem no navegador. Também copia o CSV longo para docs/data/ (download e
fonte para o Looker Studio).

Uso (na raiz CCAL): ..\\venv\\Scripts\\python.exe -m BETA_PYTHON.site_estatisticas
"""
import json
import shutil
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / 'STATISTICS' / 'ccal_02_v_1' / 'ccal_estatisticas_bioma_uf.csv'
DOCS = ROOT / 'docs'
CHART_JS = ROOT / 'MONITOR_EMISSOES' / 'v00' / 'chart.umd.min.js'

LABELS = {
    'stock': 'Estoque de carbono', 'area_stock': 'Área com estoque', 'area': 'Área total',
    'loss_deforestation': 'Perda · desmatamento', 'loss_deforestation_secondary': 'Perda · desmatamento da secundária',
    'loss_fire': 'Perda · fogo', 'loss_selective_logging': 'Perda · corte seletivo', 'loss_edge': 'Perda · borda',
    'loss_grassland': 'Perda · campo', 'loss_convergence_degradation': 'Perda · convergência (degradação)',
    'loss_convergence_edge_fire': 'Convergência borda + fogo', 'loss_convergence_edge_logging': 'Convergência borda + corte',
    'loss_convergence_logging_fire': 'Convergência corte + fogo',
    'loss_convergence_edge_logging_fire': 'Convergência borda + corte + fogo',
    'gain_secondary_vegetation': 'Remoção · vegetação secundária', 'net_balance': 'Balanço líquido',
}

PAGE = """<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>CCAL · Estatísticas</title>
<link rel="stylesheet" href="assets/site.css">
<style>
.controls{display:flex;flex-wrap:wrap;gap:.8rem;margin:1.2rem 0}.controls label{font-size:.8rem;font-weight:700;color:var(--muted);display:flex;flex-direction:column;gap:.25rem}
select{padding:.5rem;border:1px solid var(--line);border-radius:8px;background:var(--card);color:var(--ink);font:inherit;min-width:150px}
.wrap .card{margin:1rem 0}.kpis .card{margin:0}
.chart{position:relative;height:380px}.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:.8rem}
.kpi strong{display:block;font-size:1.4rem;color:var(--accent)}.kpi span{font-size:.8rem;color:var(--muted)}
.table-wrap{overflow-x:auto}table{width:100%;border-collapse:collapse;font-size:.88rem;min-width:520px}
.num th,.num td{text-align:right}.num th:first-child,.num td:first-child{text-align:left}
</style></head><body><script src="assets/site.js"></script><div class="wrap">
<div class="eyebrow">Estatísticas</div>
<h1>Estatísticas por bioma, UF e ano</h1>
<p class="muted">Somas dos assets públicos <code>ccal_02 · _1</code> (30 m). Perdas, remoções e balanço em tCO₂e; estoque em tC; áreas em ha. Gerado em __DATE__ · <a href="data/ccal_estatisticas_bioma_uf.csv">baixar CSV</a></p>
<div class="controls">
<label>Variável<select id="var"></select></label>
<label>Bioma<select id="bioma"></select></label>
<label>UF<select id="uf"></select></label>
<label>Módulos<select id="mods"><option value="all">Todos</option></select></label>
</div>
<div class="kpis" id="kpis"></div>
<div class="card"><div class="chart"><canvas id="chart"></canvas></div></div>
<div class="card"><h3 style="margin-top:0">Último ano por UF</h3><div class="table-wrap"><table id="tbl" class="num"></table></div></div>
</div>
<script>__CHARTJS__</script>
<script>
const D=__DATA__;const L=__LABELS__;
const $=id=>document.getElementById(id);const uniq=a=>[...new Set(a)].sort();
const N=D.ano.length;const css=n=>getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const color=m=>css('--'+m.toLowerCase())||css('--accent');
document.addEventListener('ccal-theme',()=>render());
function fill(sel,vals,all,lab){sel.innerHTML=(all?'<option value="">Todos</option>':'')+vals.map(v=>`<option value="${v}">${lab?lab(v):v}</option>`).join('')}
const vars=uniq(D.variavel);fill($('var'),vars,false,v=>L[v]||v);$('var').value=vars.includes('net_balance')?'net_balance':'loss_deforestation';
fill($('bioma'),uniq(D.bioma),true);fill($('uf'),uniq(D.uf),true);
uniq(D.modulo).forEach(m=>$('mods').insertAdjacentHTML('beforeend',`<option value="${m}">${m}</option>`));
const fmt=v=>Math.abs(v)>=1e9?(v/1e9).toFixed(2)+' bi':Math.abs(v)>=1e6?(v/1e6).toFixed(2)+' mi':Math.abs(v)>=1e3?(v/1e3).toFixed(1)+' mil':v.toFixed(0);
let chart;
function render(){
 const v=$('var').value,b=$('bioma').value,u=$('uf').value,mm=$('mods').value;
 const series={},byUf={},unit={};
 for(let i=0;i<N;i++){
  if(D.variavel[i]!==v||(b&&D.bioma[i]!==b)||(u&&D.uf[i]!==u)||(mm!=='all'&&D.modulo[i]!==mm))continue;
  const m=D.modulo[i],y=D.ano[i];unit[m]=D.unidade[i];
  (series[m]=series[m]||{})[y]=(series[m][y]||0)+D.valor[i];
  ((byUf[m]=byUf[m]||{})[y]=byUf[m][y]||{})[D.uf[i]]=(byUf[m][y][D.uf[i]]||0)+D.valor[i];
 }
 const mods=Object.keys(series).sort();const years=uniq(mods.flatMap(m=>Object.keys(series[m]).map(Number)));
 const ds=mods.map(m=>({label:m,data:years.map(y=>series[m][y]??null),borderColor:color(m),backgroundColor:color(m),tension:.2,pointRadius:2,spanGaps:false}));
 if(chart)chart.destroy();
 Chart.defaults.color=css('--muted');Chart.defaults.borderColor=css('--line');
 chart=new Chart($('chart'),{type:'line',data:{labels:years,datasets:ds},options:{maintainAspectRatio:false,interaction:{mode:'index',intersect:false},
  plugins:{tooltip:{callbacks:{label:c=>`${c.dataset.label}: ${fmt(c.parsed.y)} ${unit[c.dataset.label]||''}`}}},scales:{y:{ticks:{callback:fmt}}}}});
 $('kpis').innerHTML=mods.map(m=>{const ys=Object.keys(series[m]).map(Number);const last=Math.max(...ys);const prev=series[m][last-1];
  const d=prev?((series[m][last]-prev)/Math.abs(prev)*100).toFixed(1)+'% vs '+(last-1):'';
  return `<div class="card kpi"><span>${m} · ${last}</span><strong>${fmt(series[m][last])} ${unit[m]}</strong><span>${d}</span></div>`}).join('');
 const lastY={};mods.forEach(m=>lastY[m]=Math.max(...Object.keys(series[m]).map(Number)));
 const ufs=uniq(mods.flatMap(m=>Object.keys(byUf[m][lastY[m]]||{})));
 $('tbl').innerHTML='<tr><th>UF</th>'+mods.map(m=>`<th>${m} (${lastY[m]})</th>`).join('')+'</tr>'+
  ufs.map(x=>'<tr><td>'+x+'</td>'+mods.map(m=>`<td>${fmt((byUf[m][lastY[m]]||{})[x]||0)}</td>`).join('')+'</tr>').join('');
}
['var','bioma','uf','mods'].forEach(id=>$(id).addEventListener('change',render));render();
</script></body></html>
"""


def main():
    df = pd.read_csv(SRC)
    df = df[df['uf'].notna() & df['bioma'].notna()]
    cols = ['modulo', 'ano', 'bioma', 'uf', 'variavel', 'unidade', 'valor']
    data = {c: (df[c].round(1).tolist() if c == 'valor' else df[c].tolist()) for c in cols}
    html = (PAGE.replace('__DATA__', json.dumps(data, ensure_ascii=False, separators=(',', ':')))
            .replace('__LABELS__', json.dumps(LABELS, ensure_ascii=False))
            .replace('__CHARTJS__', CHART_JS.read_text(encoding='utf-8'))
            .replace('__DATE__', pd.Timestamp.now().strftime('%d/%m/%Y')))
    (DOCS / 'data').mkdir(parents=True, exist_ok=True)
    (DOCS / 'estatisticas.html').write_text(html, encoding='utf-8')
    shutil.copy(SRC, DOCS / 'data' / SRC.name)
    shutil.copy(SRC.with_name('ccal_estatisticas_brasil.csv'), DOCS / 'data' / 'ccal_estatisticas_brasil.csv')
    print('docs/estatisticas.html', round((DOCS / 'estatisticas.html').stat().st_size / 1e6, 2), 'MB;', len(df), 'linhas')


if __name__ == '__main__':
    main()
