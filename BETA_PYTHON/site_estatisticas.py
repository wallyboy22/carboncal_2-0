"""Gera docs/estatisticas.html (GitHub Pages) a partir de STATISTICS/ccal_02_v_1.

Painel em arquivo único (dados embutidos em formato colunar indexado); Chart.js vem de
docs/assets. Também copia os CSVs para docs/data/.

Uso (na raiz CCAL): ..\\venv\\Scripts\\python.exe -m BETA_PYTHON.site_estatisticas
"""
import json
import shutil
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / 'STATISTICS' / 'ccal_02_v_1' / 'ccal_estatisticas_bioma_uf.csv'
DOCS = ROOT / 'docs'

# variável do asset -> (rótulo, cor do tema, tipo)
PROCESSES = {
    'loss_deforestation': ('Desmatamento', 'defor', 'loss'),
    'loss_fire': ('Fogo', 'fire', 'loss'),
    'loss_selective_logging': ('Corte seletivo', 'logging', 'loss'),
    'loss_edge': ('Borda', 'edge', 'loss'),
    'loss_grassland': ('Fogo em campo', 'grass', 'loss'),
    'loss_deforestation_secondary': ('Desmat. de secundária', 'rose', 'loss'),
    'gain_secondary_vegetation': ('Regeneração', 'regen', 'gain'),
    'net_balance': ('Balanço líquido', 'net', 'net'),
    'stock': ('Estoque', 'stock', 'stock'),
}
REGIONS = {'Norte': ['AC', 'AM', 'AP', 'PA', 'RO', 'RR', 'TO'], 'Nordeste': ['AL', 'BA', 'CE', 'MA', 'PB', 'PE', 'PI', 'RN', 'SE'],
           'Centro-Oeste': ['DF', 'GO', 'MS', 'MT'], 'Sudeste': ['ES', 'MG', 'RJ', 'SP'], 'Sul': ['PR', 'RS', 'SC']}

PAGE = r"""<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>CCAL · Estatísticas</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600&family=IBM+Plex+Mono:wght@500;600&family=Source+Sans+3:wght@400;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="assets/site.css">
<style>
.layout{display:grid;grid-template-columns:270px minmax(0,1fr);gap:1.4rem;align-items:start}
.filters{position:sticky;top:76px;display:grid;gap:1rem;background:var(--card);border:1px solid var(--line);border-radius:18px;padding:1rem;box-shadow:var(--shadow)}
.filters .seg{border-radius:14px}
.filters .seg button{font-size:.82rem;padding:.32rem .65rem}
.content{display:grid;gap:1.2rem;min-width:0}.content>*{min-width:0}
.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(150px,100%),1fr));gap:.8rem}
.kpi{border-top:4px solid var(--c);padding:1rem}
.kpi .l{font:600 .72rem var(--mono);color:var(--muted);text-transform:uppercase;letter-spacing:.06em}
.kpi .v{font:600 1.7rem/1.1 var(--display);margin:.3rem 0}
.kpi .d{font-size:.85rem;color:var(--muted)}
.up{color:var(--defor)}.down{color:var(--sage)}
.card-head{display:flex;flex-wrap:wrap;justify-content:space-between;gap:.6rem;align-items:flex-start;margin-bottom:.6rem}
.card-head h2{font-size:1.3rem;margin:0}
.card-head p{margin:.15rem 0 0;font-size:.88rem;color:var(--muted)}
.seg.small button{font-size:.8rem;padding:.3rem .6rem}
.mx{overflow-x:auto}
.mx table{min-width:0;font-size:.8rem;border-collapse:separate;border-spacing:2px}
.mx th,.mx td{padding:.3rem .4rem;border:0;text-align:right;white-space:nowrap}
.mx th{background:none}
.mx td.h{border-radius:4px;color:var(--ink)}
.mx th:first-child,.mx td:first-child{text-align:left;position:sticky;left:0;background:var(--card)}
.hint{font-size:.85rem;color:var(--muted)}
.sm{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(260px,100%),1fr));gap:1rem}
.sm>div{border:1px solid var(--line);border-radius:14px;padding:.7rem .8rem;background:var(--paper)}
.sm h3{font-size:1rem;margin:0 0 .2rem;display:flex;align-items:center;gap:.4rem}
.sm .u{font-size:.75rem;color:var(--muted)}
.sm .box{position:relative;height:170px}
.sm button{all:unset;cursor:pointer}
@media (max-width:960px){.layout{grid-template-columns:minmax(0,1fr)}.filters{position:static}}
@media (max-width:640px){.kpi .v{font-size:1.35rem}.card-head{flex-direction:column}}
</style></head><body><script src="assets/site.js"></script>
<main>
<section class="hero"><div class="eyebrow">Estatísticas</div><h1>Os números por bioma, estado e ano.</h1>
<p class="lead">Somas dos mapas anuais da CCAL a 30 m. Emissões e remoções em toneladas de CO₂ equivalente; estoque em toneladas de carbono. Atualizado em __DATE__.</p></section>
<div class="layout">
<aside class="filters" aria-label="Filtros">
  <div><span class="flabel">Processo</span><div class="seg wrap" id="fProc"></div></div>
  <div><span class="flabel">Módulos</span><div class="seg wrap" id="fMod"></div></div>
  <div><span class="flabel">Período</span><div class="seg wrap" id="fPer"></div></div>
  <div><span class="flabel">Bioma</span><div class="seg wrap" id="fBio"></div></div>
  <div><span class="flabel">Região</span><div class="seg wrap" id="fReg"></div></div>
  <div><span class="flabel">Estado</span><div class="seg wrap" id="fUF"></div></div>
  <p class="hint" id="scope"></p>
</aside>
<div class="content">
  <div class="kpis" id="kpis"></div>
  <section class="card"><div class="card-head"><div><h2>Comparar módulos</h2><p>O mesmo recorte lido pelos quatro módulos, processo a processo. Cada módulo usa fontes e regras próprias (veja o <a href="metodo.html#transversal">método</a>).</p></div></div>
    <div class="sm" id="sm"></div></section>
  <section class="card"><div class="card-head"><div><h2 id="tLine">Série anual</h2><p id="sLine"></p></div><div class="seg small" id="fLineMode"></div></div><div class="chart-box"><canvas id="cLine"></canvas></div></section>
  <section class="card"><div class="card-head"><div><h2>De onde vêm as emissões</h2><p>Perdas por processo e remoções pela regeneração, a cada ano, para um módulo.</p></div><div class="seg small" id="fStackMod"></div></div><div class="chart-box"><canvas id="cStack"></canvas></div></section>
  <div class="grid two">
    <section class="card"><div class="card-head"><div><h2>Ranking</h2><p id="sRank"></p></div><div class="seg small" id="fRank"></div></div><div class="chart-box" style="height:420px"><canvas id="cRank"></canvas></div></section>
    <section class="card"><div class="card-head"><div><h2>Processo × módulo</h2><p id="sMP"></p></div></div><div class="mx" id="mxMP"></div><p class="hint">Cada célula é a soma do período selecionado. As cores comparam os módulos dentro de cada processo.</p></section>
  </div>
  <section class="card"><div class="card-head"><div><h2>Matriz no tempo</h2><p id="sMx"></p></div><div style="display:flex;gap:.5rem;flex-wrap:wrap"><div class="seg small" id="fMxRows"></div><div class="seg small" id="fMxMod"></div></div></div><div class="mx" id="mx"></div></section>
  <p class="hint">Convergências (sobreposição de processos) não aparecem aqui porque já estão dentro das perdas. No M3, o desmatamento já inclui o da vegetação secundária; só o M4 o mostra separado. As remoções aparecem como valores negativos. Os módulos 1 e 2 começam em 2016; os módulos 3 e 4, em 1986. <a href="dados.html#limitacoes">Limitações de 2025</a> · <a href="data/ccal_estatisticas_bioma_uf.csv">baixar CSV</a></p>
</div></div>
</main>
<script src="assets/chart.umd.min.js"></script>
<script>
const D=__DATA__;const P=__PROC__;const REG=__REG__;
const $=id=>document.getElementById(id);const C=n=>window.ccalColor(n);
const MODS=D.mod,BIO=D.bio,UFS=D.uf,VARS=D.var;const N=D.v.length;
const S={proc:'loss_deforestation',mods:['M1','M2','M3','M4'],per:'2016-2025',bio:'',reg:'',uf:'',lineMode:'abs',stackMod:'M3',rank:'uf',mxRows:'bio',mxMod:'M3'};
const vIdx=Object.fromEntries(VARS.map((v,i)=>[v,i]));
const sign=(v,x)=>P[v][2]==='gain'?-Math.abs(x):x;
function seg(id,items,cur,cb,multi){const el=$(id);el.innerHTML=items.map(([v,l,c])=>`<button type="button" data-v="${v}" aria-pressed="${multi?cur.includes(v):v===cur}">${c?`<i class="dot" style="background:var(--${c});margin-right:.3rem"></i>`:''}${l}</button>`).join('');el.onclick=e=>{const b=e.target.closest('button');if(b)cb(b.dataset.v)}}
function scale(v){return P[v][2]==='stock'?{k:1e9,u:'Gt C'}:{k:1e6,u:'Mt CO₂e'}}
const fmt=(x,d=1)=>x==null?'–':Math.abs(x)>=100?x.toLocaleString('pt-BR',{maximumFractionDigits:0}):x.toLocaleString('pt-BR',{maximumFractionDigits:d,minimumFractionDigits:d});
function inScope(i){if(S.bio&&BIO[D.b[i]]!==S.bio)return false;const u=UFS[D.u[i]];if(S.uf)return u===S.uf;if(S.reg)return REG[S.reg].includes(u);return true}
function yrRange(){return S.per.split('-').map(Number)}
function agg(filter,key){const o={};for(let i=0;i<N;i++){if(!filter(i))continue;const k=key(i);o[k]=(o[k]||0)+D.v[i]}return o}
const charts={};
function mk(id,cfg){if(charts[id])charts[id].destroy();Chart.defaults.color=C('muted');Chart.defaults.borderColor=C('line');Chart.defaults.font.family=getComputedStyle(document.body).fontFamily;charts[id]=new Chart($(id),cfg)}
function filters(){
  seg('fProc',Object.entries(P).map(([v,p])=>[v,p[0],p[1]]),S.proc,v=>{S.proc=v;render()});
  seg('fMod',MODS.map(m=>[m,m,m.toLowerCase()]),S.mods,v=>{S.mods=S.mods.includes(v)?S.mods.filter(x=>x!==v):[...S.mods,v].sort();if(!S.mods.length)S.mods=[v];render()},true);
  seg('fPer',[['1986-2025','1986–2025'],['2016-2025','2016–2025'],['2021-2025','2021–2025'],['2025-2025','2025']],S.per,v=>{S.per=v;render()});
  seg('fBio',[['','Todos'],...BIO.map(b=>[b,b])],S.bio,v=>{S.bio=v;render()});
  seg('fReg',[['','Todas'],...Object.keys(REG).map(r=>[r,r])],S.reg,v=>{S.reg=v;S.uf='';render()});
  const ufs=(S.reg?REG[S.reg]:UFS.slice().sort());seg('fUF',[['','Todos'],...ufs.map(u=>[u,u])],S.uf,v=>{S.uf=v;render()});
  seg('fLineMode',[['abs','anual'],['idx','acumulado']],S.lineMode,v=>{S.lineMode=v;render()});
  seg('fStackMod',MODS.map(m=>[m,m]),S.stackMod,v=>{S.stackMod=v;render()});
  seg('fRank',[['uf','estados'],['bio','biomas']],S.rank,v=>{S.rank=v;render()});
  seg('fMxRows',[['bio','biomas'],['uf','estados']],S.mxRows,v=>{S.mxRows=v;render()});
  seg('fMxMod',MODS.map(m=>[m,m]),S.mxMod,v=>{S.mxMod=v;render()});
}
function scopeTxt(){return [S.bio||'todos os biomas',S.uf||S.reg||'Brasil'].join(' · ')}
function render(){
  filters();const v=S.proc,vi=vIdx[v],sc=scale(v),[y0,y1]=yrRange();
  $('scope').textContent='Recorte: '+scopeTxt()+' · '+S.per.replace('-','–');
  const series=agg(i=>D.p[i]===vi&&inScope(i),i=>MODS[D.m[i]]+'|'+D.y[i]);
  const years=[];for(let y=Math.max(1986,y0);y<=y1;y++)years.push(y);
  $('kpis').innerHTML=MODS.filter(m=>S.mods.includes(m)).map(m=>{const ys=years.filter(y=>series[m+'|'+y]!=null);if(!ys.length)return `<div class="card kpi" style="--c:var(--${m.toLowerCase()})"><div class="l">${m} · ${P[v][0]}</div><div class="v">–</div><div class="d">não se aplica a este módulo</div></div>`;
    const last=ys[ys.length-1],val=sign(v,series[m+'|'+last])/sc.k,prev=series[m+'|'+(last-1)];let d='';
    if(prev!=null&&prev!==0){const p=(series[m+'|'+last]-prev)/Math.abs(prev)*100;d=`<span class="${(p>0)===(P[v][2]!=='gain')?'up':'down'}">${p>0?'▲':'▼'} ${fmt(Math.abs(p))}%</span> vs ${last-1}`}
    return `<div class="card kpi" style="--c:var(--${m.toLowerCase()})"><div class="l">${m} · ${P[v][0]} · ${last}</div><div class="v">${fmt(val)}</div><div class="d">${sc.u}${d?' · '+d:''}</div></div>`}).join('');
  // comparar módulos (pequenos múltiplos)
  const SMV=['loss_deforestation','loss_fire','loss_selective_logging','gain_secondary_vegetation','loss_edge','stock'].filter(k=>P[k]);
  $('sm').innerHTML=SMV.map(k=>`<div><button type="button" data-k="${k}" title="Ver no gráfico principal"><h3><i class="dot" style="background:var(--${P[k][1]})"></i>${P[k][0]}</h3></button><div class="u">${scale(k).u}</div><div class="box"><canvas id="sm_${k}"></canvas></div></div>`).join('');
  $('sm').onclick=e=>{const b=e.target.closest('button');if(b){S.proc=b.dataset.k;render();$('tLine').scrollIntoView({behavior:'smooth',block:'center'})}};
  SMV.forEach(k=>{const ki=vIdx[k],sk=scale(k),ser=agg(i=>D.p[i]===ki&&inScope(i),i=>MODS[D.m[i]]+'|'+D.y[i]);
    mk('sm_'+k,{type:'line',data:{labels:years,datasets:MODS.filter(m=>S.mods.includes(m)).map(m=>({label:m,data:years.map(y=>ser[m+'|'+y]==null?null:sign(k,ser[m+'|'+y])/sk.k),borderColor:C(m.toLowerCase()),backgroundColor:C(m.toLowerCase()),pointRadius:0,borderWidth:2,tension:.2}))},
      options:{maintainAspectRatio:false,animation:false,interaction:{mode:'index',intersect:false},plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>`${c.dataset.label}: ${fmt(c.parsed.y)} ${sk.u}`}}},scales:{x:{ticks:{maxTicksLimit:5}},y:{ticks:{maxTicksLimit:4}}}}})});
  const lineDs=MODS.filter(m=>S.mods.includes(m)).map(m=>{let acc=0;return{label:m,data:years.map(y=>{const x=series[m+'|'+y];if(x==null)return null;const s=sign(v,x)/sc.k;if(S.lineMode==='idx'){acc+=s;return acc}return s}),borderColor:C(m.toLowerCase()),backgroundColor:C(m.toLowerCase()),tension:.2,pointRadius:2,borderWidth:2.5,spanGaps:false}});
  $('tLine').textContent=P[v][0]+(S.lineMode==='idx'?' · acumulado':'');$('sLine').textContent=sc.u+' · '+scopeTxt();
  mk('cLine',{type:'line',data:{labels:years,datasets:lineDs},options:{maintainAspectRatio:false,interaction:{mode:'index',intersect:false},plugins:{legend:{position:'bottom',labels:{boxWidth:12}},tooltip:{callbacks:{label:c=>`${c.dataset.label}: ${fmt(c.parsed.y)} ${sc.u}`}}}}});
  const sm=MODS.indexOf(S.stackMod),comp=agg(i=>D.m[i]===sm&&inScope(i)&&['loss','gain'].includes(P[VARS[D.p[i]]][2]),i=>VARS[D.p[i]]+'|'+D.y[i]);
  const sv=Object.keys(P).filter(k=>P[k][2]==='loss'||P[k][2]==='gain').filter(k=>years.some(y=>comp[k+'|'+y]));
  mk('cStack',{type:'bar',data:{labels:years,datasets:sv.map(k=>({label:P[k][0],data:years.map(y=>comp[k+'|'+y]==null?null:sign(k,comp[k+'|'+y])/1e6),backgroundColor:C(P[k][1]),stack:'a',borderRadius:2}))},options:{maintainAspectRatio:false,interaction:{mode:'index',intersect:false},plugins:{legend:{position:'bottom',labels:{boxWidth:12}},tooltip:{callbacks:{label:c=>`${c.dataset.label}: ${fmt(c.parsed.y)} Mt CO₂e`}}},scales:{x:{stacked:true},y:{stacked:true,title:{display:true,text:'Mt CO₂e'}}}}});
  const rm=S.mods.find(m=>years.some(y=>series[m+'|'+y]!=null))||S.mods[0],rmi=MODS.indexOf(rm);
  const isStock=P[v][2]==='stock';const rk=agg(i=>D.m[i]===rmi&&D.p[i]===vi&&inScope(i)&&(isStock?D.y[i]===y1:(D.y[i]>=y0&&D.y[i]<=y1)),i=>S.rank==='uf'?UFS[D.u[i]]:BIO[D.b[i]]);
  const top=Object.entries(rk).map(([k,x])=>[k,sign(v,x)/sc.k]).sort((a,b)=>Math.abs(b[1])-Math.abs(a[1])).slice(0,15);
  $('sRank').textContent=`${rm} · ${P[v][0]} · ${isStock?y1:S.per.replace('-','–')} · ${sc.u}`;
  mk('cRank',{type:'bar',data:{labels:top.map(t=>t[0]),datasets:[{data:top.map(t=>t[1]),backgroundColor:C(rm.toLowerCase()),borderRadius:4}]},options:{indexAxis:'y',maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>`${fmt(c.parsed.x)} ${sc.u}`}}}}});
  const mp=agg(i=>inScope(i)&&D.y[i]>=y0&&D.y[i]<=y1&&P[VARS[D.p[i]]][2]!=='stock',i=>MODS[D.m[i]]+'|'+VARS[D.p[i]]);
  const pv=Object.keys(P).filter(k=>P[k][2]!=='stock');
  $('sMP').textContent=`Mt CO₂e · ${S.per.replace('-','–')} · ${scopeTxt()}`;
  $('mxMP').innerHTML='<table><tr><th></th>'+MODS.map(m=>`<th>${m}</th>`).join('')+'</tr>'+pv.map(k=>{const row=MODS.map(m=>mp[m+'|'+k]==null?null:sign(k,mp[m+'|'+k])/1e6);const mx=Math.max(...row.filter(x=>x!=null).map(Math.abs),1e-9);
    return `<tr><td><i class="dot" style="background:var(--${P[k][1]});margin-right:.35rem"></i><b>${P[k][0]}</b></td>`+row.map(x=>x==null?'<td class="muted">·</td>':`<td class="h" style="background:color-mix(in srgb,var(--${P[k][1]}) ${Math.round(Math.abs(x)/mx*70)+6}%,transparent)">${fmt(x)}</td>`).join('')+'</tr>'}).join('')+'</table>';
  const mi=MODS.indexOf(S.mxMod),mt=agg(i=>D.m[i]===mi&&D.p[i]===vi&&inScope(i),i=>(S.mxRows==='uf'?UFS[D.u[i]]:BIO[D.b[i]])+'|'+D.y[i]);
  const rows=[...new Set(Object.keys(mt).map(k=>k.split('|')[0]))].sort();const my=years.filter(y=>rows.some(r=>mt[r+'|'+y]!=null));
  const mmax=Math.max(...Object.values(mt).map(x=>Math.abs(x)),1e-9);
  $('sMx').textContent=`${S.mxMod} · ${P[v][0]} · ${sc.u}`;
  $('mx').innerHTML=!rows.length?'<p class="hint">Sem dados para este módulo e processo.</p>':'<table><tr><th></th>'+my.map(y=>`<th>${String(y).slice(2)}</th>`).join('')+'</tr>'+rows.map(r=>`<tr><td><b>${r}</b></td>`+my.map(y=>{const x=mt[r+'|'+y];if(x==null)return'<td></td>';const a=Math.sqrt(Math.abs(x)/mmax);return `<td class="h" title="${r} ${y}: ${fmt(sign(v,x)/sc.k,2)} ${sc.u}" style="background:color-mix(in srgb,var(--${P[v][1]}) ${Math.round(a*85)+4}%,transparent)">${Math.abs(x)/sc.k>=1?fmt(sign(v,x)/sc.k,0):''}</td>`}).join('')+'</tr>').join('')+'</table>';
}
document.addEventListener('ccal-theme',render);render();
</script></body></html>
"""


def main():
    df = pd.read_csv(SRC)
    df = df[df['uf'].notna() & df['bioma'].notna() & df['variavel'].isin(PROCESSES)]
    # M1/M2: 2016 é o ano-base do estoque; fluxos começam em 2017
    df = df[~(df['modulo'].isin(['M1', 'M2']) & (df['ano'] == 2016) & (df['variavel'] != 'stock'))]
    cats = {c: sorted(df[c].unique().tolist()) for c in ('modulo', 'bioma', 'uf', 'variavel')}
    cats['variavel'] = [v for v in PROCESSES if v in cats['variavel']]
    idx = {c: {k: i for i, k in enumerate(v)} for c, v in cats.items()}
    data = {'mod': cats['modulo'], 'bio': cats['bioma'], 'uf': cats['uf'], 'var': cats['variavel'],
            'm': df['modulo'].map(idx['modulo']).tolist(), 'b': df['bioma'].map(idx['bioma']).tolist(),
            'u': df['uf'].map(idx['uf']).tolist(), 'p': df['variavel'].map(idx['variavel']).tolist(),
            'y': df['ano'].astype(int).tolist(), 'v': df['valor'].round(0).astype('int64').tolist()}
    proc = {k: v for k, v in PROCESSES.items() if k in cats['variavel']}
    html = (PAGE.replace('__DATA__', json.dumps(data, ensure_ascii=False, separators=(',', ':')))
            .replace('__PROC__', json.dumps(proc, ensure_ascii=False))
            .replace('__REG__', json.dumps(REGIONS, ensure_ascii=False))
            .replace('__DATE__', pd.Timestamp.now().strftime('%d/%m/%Y')))
    (DOCS / 'data').mkdir(parents=True, exist_ok=True)
    (DOCS / 'estatisticas.html').write_text(html, encoding='utf-8')
    shutil.copy(SRC, DOCS / 'data' / SRC.name)
    shutil.copy(SRC.with_name('ccal_estatisticas_brasil.csv'), DOCS / 'data' / 'ccal_estatisticas_brasil.csv')
    print('docs/estatisticas.html', round((DOCS / 'estatisticas.html').stat().st_size / 1e6, 2), 'MB;', len(df), 'linhas')


if __name__ == '__main__':
    main()
