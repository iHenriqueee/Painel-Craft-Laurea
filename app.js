(function(){
  'use strict';

  // ---------- Helpers (storage) ----------
  function lsGet(k){ try { return localStorage.getItem(k); } catch(e){ return null; } }
  function lsSet(k,v){ try { localStorage.setItem(k,v); } catch(e){} }
  function lsRemove(k){ try { localStorage.removeItem(k); } catch(e){} }

  // ---------- Status ----------
  var STATUS = document.getElementById('statusBar');
  function setStatus(kind, html){
    if (!STATUS) return;
    STATUS.className = kind ? ('ok ' + kind) : '';
    STATUS.innerHTML = html;
  }
  window.addEventListener('error', function(e){
    var msg = '';
    try{
      var err = e.error || null;
      var m = (err && (err.message || String(err))) || e.message || 'Erro';
      var src = e.filename ? (' • ' + e.filename.split('/').slice(-1)[0] + ':' + (e.lineno||0) + ':' + (e.colno||0)) : '';
      msg = m + src;
      console.error(err || e);
    }catch(_){}
    setStatus('err', '<strong>Erro no JavaScript</strong>: ' + (msg ? msg : 'Atualize a página (Ctrl+Shift+R).'));
  });
  window.addEventListener('unhandledrejection', function(e){
    var msg = '';
    try{
      var r = e.reason;
      msg = (r && (r.message || String(r))) || 'Promise rejeitada';
      console.error(r);
    }catch(_){}
    setStatus('err', '<strong>Erro no JavaScript</strong>: ' + msg);
  });

  // ---------- Config ----------
  var STATE_KEY = 'laurea_pages_state_v2';
  var THEME_KEY = 'laurea_theme_v1';
  var ADMIN_PASSWORD = 'jujuba!05';
  var ADMIN_SESSION_KEY = 'laurea_admin_session_v1';

  function isAdmin(){
    try { return sessionStorage.getItem(ADMIN_SESSION_KEY) === '1'; } catch(e){ return false; }
  }
  function setAdmin(on){
    try{
      if (on) sessionStorage.setItem(ADMIN_SESSION_KEY,'1');
      else sessionStorage.removeItem(ADMIN_SESSION_KEY);
    }catch(e){}
  }

  // ---------- Theme ----------
  function getCurrentTheme(){
    var t = document.documentElement.getAttribute('data-theme');
    return (t === 'dark' || t === 'light') ? t : 'light';
  }
  function updateThemeBtn(){
    var btn = document.getElementById('themeToggleBtn');
    if (!btn) return;
    btn.disabled = false;
    var cur = getCurrentTheme();
    btn.textContent = (cur === 'dark') ? '☀️ Tema' : '🌙 Tema';
  }
  function applyTheme(theme){
    var t = (theme === 'dark') ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', t);
    try{ localStorage.setItem(THEME_KEY, t); }catch(e){}
    updateThemeBtn();
  }
  function initTheme(){
    var t = null;
    try{ t = localStorage.getItem(THEME_KEY); }catch(e){ t = null; }
    if (t !== 'dark' && t !== 'light') t = 'light';
    applyTheme(t);
  }
  function bindThemeButton(){
    var btn = document.getElementById('themeToggleBtn');
    if (!btn) return;
    btn.disabled = false;
    updateThemeBtn();
    if (btn.__bound) return;
    btn.__bound = true;
    btn.addEventListener('click', function(){
      var cur = getCurrentTheme();
      applyTheme(cur === 'light' ? 'dark' : 'light');
    });
  }

  // ---------- Data ----------
  var DEFAULT_RECEITAS = window.LAUREA_DEFAULT_RECEITAS || {};
  var receitas = JSON.parse(JSON.stringify(DEFAULT_RECEITAS));
  // precos[produto] = { pista:number, parceria:number, alianca:number }
  var precos = {};

  // Regras de venda
  var modoVenda = 'pista';         // 'pista' | 'parceria' | 'alianca'
  var modoPrecos = 'pista';       // seletor da tabela de preços (independente)
  var descontoExtra = 0;           // % (pode ser usado por qualquer usuário)
  var itensState = null;

  function nomesProdutos(){
    return Object.keys(receitas).sort(function(a,b){
      return a.localeCompare(b,'pt-BR');
    });
  }


  function normalizePrecoEntry(v){
    // returns { pista:{limpo,sujo}, parceria:{limpo,sujo}, alianca:{limpo,sujo} }
    function normPair(x, fallbackLimpo){
      if (typeof x === 'number'){
        var n = Number(x||0)||0;
        return { limpo:n, sujo:0 };
      }
      if (x && typeof x === 'object'){
        var l = (typeof x.limpo !== 'undefined') ? Number(x.limpo||0)||0
              : (typeof x.valor !== 'undefined') ? Number(x.valor||0)||0
              : (typeof x.clean !== 'undefined') ? Number(x.clean||0)||0
              : 0;
        var s = (typeof x.sujo !== 'undefined') ? Number(x.sujo||0)||0
              : (typeof x.dirty !== 'undefined') ? Number(x.dirty||0)||0
              : 0;
        return { limpo:l, sujo:s };
      }
      return { limpo: Number(fallbackLimpo||0)||0, sujo:0 };
    }

    // número antigo = preço único
    if (typeof v === 'number'){
      var n0 = Number(v||0)||0;
      return {
        pista: { limpo:n0, sujo:0 },
        parceria: { limpo:n0, sujo:0 },
        alianca: { limpo:n0, sujo:0 }
      };
    }

    if (v && typeof v === 'object'){
      // legado: {valor:n}
      if (typeof v.valor !== 'undefined'){
        var n1 = Number(v.valor||0)||0;
        return {
          pista: { limpo:n1, sujo:0 },
          parceria: { limpo:n1, sujo:0 },
          alianca: { limpo:n1, sujo:0 }
        };
      }

      // legado v2: {pista:n, parceria:n, alianca:n}
      var looksLegacyNumbers =
        (typeof v.pista === 'number' || typeof v.parceria === 'number' || typeof v.alianca === 'number');

      if (looksLegacyNumbers){
        var p = Number(v.pista||0)||0;
        var pa = (typeof v.parceria !== 'undefined') ? Number(v.parceria||0)||0 : p;
        var al = (typeof v.alianca !== 'undefined') ? Number(v.alianca||0)||0 : p;
        return {
          pista: { limpo:p, sujo:0 },
          parceria: { limpo:pa, sujo:0 },
          alianca: { limpo:al, sujo:0 }
        };
      }

      // novo: {pista:{limpo,sujo}, ...}
      var pista = normPair(v.pista, 0);
      var parceria = normPair((typeof v.parceria !== 'undefined') ? v.parceria : v.pista, pista.limpo);
      var alianca = normPair((typeof v.alianca !== 'undefined') ? v.alianca : v.pista, pista.limpo);
      return { pista:pista, parceria:parceria, alianca:alianca };
    }

    return {
      pista:{limpo:0,sujo:0},
      parceria:{limpo:0,sujo:0},
      alianca:{limpo:0,sujo:0}
    };
  }
  function ensurePreco(prod){
    if (typeof precos[prod] === 'undefined'){
      precos[prod] = { pista:{limpo:0,sujo:0}, parceria:{limpo:0,sujo:0}, alianca:{limpo:0,sujo:0} };
    }
    precos[prod] = normalizePrecoEntry(precos[prod]);
    return precos[prod];
  }
  function getPrecosModo(prod){
    var pr = ensurePreco(prod);
    var obj = (modoVenda === 'parceria') ? pr.parceria : (modoVenda === 'alianca' ? pr.alianca : pr.pista);
    obj = obj || {limpo:0,sujo:0};
    return { limpo: Number(obj.limpo||0)||0, sujo: Number(obj.sujo||0)||0 };
  }

  function loadState(){
    var raw = lsGet(STATE_KEY);
    if (!raw) return false;
    try{
      var st = JSON.parse(raw);
      if (st.theme) applyTheme(st.theme);
      if (st.receitas && typeof st.receitas === 'object') receitas = st.receitas;
      if (st.precos && typeof st.precos === 'object') precos = st.precos;

      // Backward compat: pode vir number (v1) ou objeto {valor/pista/parceria/alianca}
      for (var k in precos){
        if (!precos.hasOwnProperty(k)) continue;
        precos[k] = normalizePrecoEntry(precos[k]);
      }

      if (typeof st.modoVenda !== 'undefined'){
        var mv = String(st.modoVenda || '').toLowerCase();
        if (mv === 'parceria' || mv === 'alianca' || mv === 'pista') modoVenda = mv;
      } else if (typeof st.vendaParceria !== 'undefined'){
        // Backward compat: boolean antigo
        modoVenda = st.vendaParceria ? 'parceria' : 'pista';
      }
      if (typeof st.modoPrecos !== 'undefined'){
        var mp = String(st.modoPrecos || '').toLowerCase();
        if (mp === 'parceria' || mp === 'alianca' || mp === 'pista') modoPrecos = mp;
      } else {
        modoPrecos = modoVenda;
      }
      if (typeof st.descontoExtra !== 'undefined'){
        var de = Number(st.descontoExtra) || 0;
        descontoExtra = Math.max(0, Math.min(100, de));
      }
      if (Array.isArray(st.itens)) itensState = st.itens;
      return true;
    }catch(e){
      return false;
    }
  }

  function getItensDaTela(){
    var rows = document.querySelectorAll('.item-row');
    var itens = [];
    for (var i=0;i<rows.length;i++){
      var r = rows[i];
      var sel = r.querySelector('.produtoSelect');
      var qtdEl = r.querySelector('.produtoQtd');
      var prod = sel ? sel.value : '';
      var qtd = Math.max(0, Math.floor(Number(qtdEl ? qtdEl.value : 0) || 0));
      if (prod && qtd > 0) itens.push({produto: prod, qtd: qtd});
    }
    return itens;
  }

  function getState(){
    return {
      theme: getCurrentTheme(),
      receitas: receitas,
      precos: precos,
      modoVenda: modoVenda,
      descontoExtra: descontoExtra,
      modoPrecos: modoPrecos,
      itens: getItensDaTela()
    };
  }

  var saveT = null;
  function saveState(){
    if (saveT) clearTimeout(saveT);
    saveT = setTimeout(function(){
      lsSet(STATE_KEY, JSON.stringify(getState()));
    }, 200);
  }

  // ---------- Remote published state (XHR) ----------
  function tryLoadRemotePublishedIfEmpty(done){
    try{
      if (lsGet(STATE_KEY)) { done(); return; }
      var xhr = new XMLHttpRequest();
      xhr.open('GET', 'laurea-state.json?cb=' + Date.now(), true);
      xhr.onreadystatechange = function(){
        if (xhr.readyState !== 4) return;
        if (xhr.status < 200 || xhr.status >= 300) { done(); return; }
        try{
          var obj = JSON.parse(xhr.responseText);
          var st = (obj && obj.state) ? obj.state : obj;
          if (!st || typeof st !== 'object' || !st.receitas) { done(); return; }
          if (!st.precos || typeof st.precos !== 'object') st.precos = {};
          // Normaliza preços (v1 number, v2 {pista/parceria}, v3 {valor}, v4 {pista/parceria/alianca})
          for (var pk in st.precos){
            if (!st.precos.hasOwnProperty(pk)) continue;
            st.precos[pk] = normalizePrecoEntry(st.precos[pk]);
          }
          if (!Array.isArray(st.itens)) st.itens = [];
          if (typeof st.modoVenda === 'undefined') st.modoVenda = (st.vendaParceria ? 'parceria' : 'pista');
          if (typeof st.descontoExtra === 'undefined') st.descontoExtra = 0;
          // Remove campos antigos de desconto fixo, se existirem
          delete st.desconto;
          lsSet(STATE_KEY, JSON.stringify(st));
        }catch(e){}
        done();
      };
      xhr.send();
    }catch(e){
      done();
    }
  }


  // ---------- UI refs ----------
  var adminBtn = document.getElementById('adminBtn');
  var importBtn = document.getElementById('importBtn');
  var exportBtn = document.getElementById('exportBtn');
  var resetBtn  = document.getElementById('resetBtn');
  var importFile = document.getElementById('importFile');

  var listaItens = document.getElementById('listaItens');
  var addItemBtn = document.getElementById('addItemBtn');

  var materiaisNecessarios = document.getElementById('materiaisNecessarios');
  var tabelaPrecos = document.getElementById('tabelaPrecos');
  var resultadoFinanceiro = document.getElementById('resultadoFinanceiro');
  var modoVendaSelect = document.getElementById('modoVendaSelect');
  var descontoExtraInput = document.getElementById('descontoExtraInput');

  // O seletor de "Cliente" dentro da tabela de preços é criado dinamicamente.

  // Modal
  var modalBackdrop = document.getElementById('modalBackdrop');
  var novoProdutoBtn = document.getElementById('novoProdutoBtn');
  var fecharModalBtn = document.getElementById('fecharModalBtn');
  var nomeProduto = document.getElementById('nomeProduto');
  var precoPistaLimpoProduto = document.getElementById('precoPistaLimpoProduto');
  var precoPistaSujoProduto = document.getElementById('precoPistaSujoProduto');
  var precoParceriaLimpoProduto = document.getElementById('precoParceriaLimpoProduto');
  var precoParceriaSujoProduto = document.getElementById('precoParceriaSujoProduto');
  var precoAliancaLimpoProduto = document.getElementById('precoAliancaLimpoProduto');
  var precoAliancaSujoProduto = document.getElementById('precoAliancaSujoProduto');
  var receitaProduto = document.getElementById('receitaProduto');
  var salvarProdutoBtn = document.getElementById('salvarProdutoBtn');
  var cancelarEdicaoBtn = document.getElementById('cancelarEdicaoBtn');
  var listaProdutos = document.getElementById('listaProdutos');

  var editing = null;

  function normalizeCliente(v){
    v = String(v || 'pista').toLowerCase();
    if (v !== 'pista' && v !== 'parceria' && v !== 'alianca') v = 'pista';
    return v;
  }

  function setClienteVenda(v){
    modoVenda = normalizeCliente(v);
    try{
      if (modoVendaSelect) modoVendaSelect.value = modoVenda;
    }catch(e){}
    // Atualiza somente o que depende do cliente de venda
    calcularFinanceiro();
    saveState();
  }

  function setClientePrecos(v){
    modoPrecos = normalizeCliente(v);
    // Atualiza somente a tabela de preços (configuração/admin)
    renderPrecos();
    saveState();
  }

  function applyPermissions(){
    var admin = isAdmin();

    // Tema e Import sempre liberados
    updateThemeBtn();
    if (importBtn) importBtn.disabled = false;

    // Admin-only buttons: keep visible, disable when not admin
    var adminEls = document.querySelectorAll('[data-admin-only="1"]');
    for (var i=0;i<adminEls.length;i++){
      adminEls[i].disabled = !admin;
    }

    // Disable price inputs if not admin
    var priceInputs = document.querySelectorAll('#tabelaPrecos input');
    for (var j=0;j<priceInputs.length;j++){
      priceInputs[j].disabled = !admin;
    }

    if (adminBtn) adminBtn.textContent = admin ? '🔓 Sair do admin' : '🔒 Admin';
  }

  // ---------- UI builders ----------
  function rebuildSelect(sel, desired){
    var nomes = nomesProdutos();
    var html = '';
    for (var i=0;i<nomes.length;i++){
      var n = nomes[i];
      html += '<option value="'+ escapeHtml(n) +'">'+ escapeHtml(n) +'</option>';
    }
    sel.innerHTML = html;
    sel.value = (desired && receitas[desired]) ? desired : (nomes[0] || '');
  }

  function escapeHtml(s){
    return String(s)
      .replace(/&/g,'&amp;')
      .replace(/</g,'&lt;')
      .replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;')
      .replace(/'/g,'&#039;');
  }

  function criarLinhaItem(prod, qtd){
    var row = document.createElement('div');
    row.className = 'item-row';
    row.innerHTML =
      '<div class="row">' +
        '<div>' +
          '<label>Produto</label>' +
          '<select class="produtoSelect"></select>' +
        '</div>' +
        '<div style="max-width:220px;">' +
          '<label>Quantidade</label>' +
          '<input class="produtoQtd" type="number" min="0" step="1" value="'+ (qtd||1) +'">' +
        '</div>' +
        '<div style="max-width:180px;">' +
          '<button type="button" class="btn-danger btnRemove" style="width:100%;">🗑 Remover</button>' +
        '</div>' +
      '</div>';

    var sel = row.querySelector('.produtoSelect');
    rebuildSelect(sel, prod);

    row.querySelector('.btnRemove').addEventListener('click', function(){
      row.parentNode.removeChild(row);
      atualizarTudo();
      saveState();
    });
    sel.addEventListener('change', function(){ atualizarTudo(); saveState(); });
    row.querySelector('.produtoQtd').addEventListener('input', function(){ atualizarTudo(); saveState(); });

    return row;
  }

  function setItensNaTela(itens){
    listaItens.innerHTML = '';
    if (!itens || !itens.length){
      var first = nomesProdutos()[0];
      if (first) listaItens.appendChild(criarLinhaItem(first, 1));
      return;
    }
    for (var i=0;i<itens.length;i++){
      var it = itens[i];
      if (it && receitas[it.produto]) listaItens.appendChild(criarLinhaItem(it.produto, it.qtd||1));
    }
    if (!listaItens.children.length){
      var f = nomesProdutos()[0];
      if (f) listaItens.appendChild(criarLinhaItem(f, 1));
    }
  }

  function somar(target, add){
    for (var k in add){
      if (!add.hasOwnProperty(k)) continue;
      target[k] = (target[k] || 0) + add[k];
    }
    return target;
  }

  function baseMaterials(item, qty, visiting){
    if (!receitas[item]){
      var o = {}; o[item] = qty; return o;
    }
    if (visiting[item]){
      var o2 = {}; o2[item] = qty; return o2;
    }
    visiting[item] = true;
    var rec = receitas[item];
    var total = {};
    for (var ing in rec){
      if (!rec.hasOwnProperty(ing)) continue;
      var need = rec[ing] * qty;
      if (receitas[ing]) total = somar(total, baseMaterials(ing, need, visiting));
      else total[ing] = (total[ing] || 0) + need;
    }
    visiting[item] = false;
    return total;
  }

  function atualizarMateriais(){
    var itens = getItensDaTela();
    var mat = {};
    for (var i=0;i<itens.length;i++){
      mat = somar(mat, baseMaterials(itens[i].produto, itens[i].qtd, {}));
    }
    var keys = Object.keys(mat).sort(function(a,b){ return a.localeCompare(b,'pt-BR'); });
    if (!keys.length){
      materiaisNecessarios.innerHTML = '<div style="opacity:.85;">Adicione produtos para ver materiais.</div>';
      return;
    }
    var totalQtd = 0;
    for (var j=0;j<itens.length;j++) totalQtd += itens[j].qtd;

    var html = '<div class="kpi"><div><b>Total de materiais</b></div><div style="opacity:.85;">Itens: <b>'+ totalQtd +'</b></div></div><div class="hr"></div>';
    html += '<div style="display:grid; grid-template-columns: 1fr auto; gap:8px;">';
    for (var x=0;x<keys.length;x++){
      var k = keys[x];
      html += '<div>'+ escapeHtml(k) +'</div><div style="text-align:right;"><b>'+ mat[k] +'</b></div>';
    }
    html += '</div>';
    materiaisNecessarios.innerHTML = html;
  }

  
  function renderPrecos(){
    var nomes = nomesProdutos();
    var html = '';

    // Mostra LIMPO e SUJO do cliente selecionado (Pista/Parceria/Aliança)
    var mode = modoPrecos || 'pista';
    var modeLabel = (mode === 'parceria') ? 'Parceria' : (mode === 'alianca' ? 'Aliança' : 'Pista');

    function th(title){
      return '<div class="col-preco" style="opacity:.85; font-size:12px;"><b>'+ title +'</b></div>';
    }
    function td(n, kind, val){
      return '<div class="col-preco"><input class="precoInp" data-prod="'+ escapeHtml(n) +'" data-mode="'+ mode +'" data-kind="'+ kind +'" type="number" min="0" step="0.01" placeholder="R$" value="'+ (Number(val||0)||0) +'"></div>';
    }

    html += '<div class="precosTitle" style="display:flex; align-items:center; justify-content:space-between; gap:10px;">'
          +   '<div>Cliente: <b>'+ modeLabel +'</b></div>'
          +   '<div style="max-width:220px; width:100%;">'
          +     '<select id="clientePrecosSelect" aria-label="Cliente (preços)">'
          +       '<option value="pista">Pista</option>'
          +       '<option value="parceria">Parceria</option>'
          +       '<option value="alianca">Aliança</option>'
          +     '</select>'
          +   '</div>'
          + '</div>';

    // Grid com 1 coluna de nomes + 2 colunas (Limpo + Sujo)
    html += '<div class="precosGrid precosGrid-2">';
    html += '<div></div>';
    html += th('Limpo');
    html += th('Sujo');

    for (var i=0;i<nomes.length;i++){
      var n = nomes[i];
      var pr = ensurePreco(n);
      html += '<div><b>'+ escapeHtml(n) +'</b></div>';
      html += td(n,'limpo', pr[mode].limpo);
      html += td(n,'sujo',  pr[mode].sujo);
    }
    html += '</div>';
    tabelaPrecos.innerHTML = html;

    // wire select inside price table
    var clientePrecosSelect = document.getElementById('clientePrecosSelect');
    if (clientePrecosSelect){
      clientePrecosSelect.value = mode;
      clientePrecosSelect.addEventListener('change', function(){
        setClientePrecos(clientePrecosSelect.value);
      });
    }

    var inps = tabelaPrecos.querySelectorAll('.precoInp');
    for (var j=0;j<inps.length;j++){
      inps[j].addEventListener('input', function(){
        if (!isAdmin()) { this.value = this.getAttribute('data-prev') || this.value; alert('Somente admin altera preços.'); return; }
        var prod = this.getAttribute('data-prod');
        var kind = this.getAttribute('data-kind');
        var val = Number(this.value || 0) || 0;
        var pr2 = ensurePreco(prod);
        if (!pr2[mode]) pr2[mode] = {limpo:0,sujo:0};
        pr2[mode][kind] = val;
        precos[prod] = pr2;
        this.setAttribute('data-prev', String(val));
        saveState();
        calcularFinanceiro();
      });
      inps[j].setAttribute('data-prev', String(Number(inps[j].value||0)||0));
    }
  }

function moneyBR(v){
    try{
      return (Number(v||0)).toLocaleString('pt-BR', {style:'currency', currency:'BRL'});
    }catch(e){
      return 'R$ ' + String(v||0);
    }
  }

  function calcularFinanceiro(){
    var itens = getItensDaTela();

    var brutoLimpo = 0;
    var brutoSujo = 0;

    for (var j=0;j<itens.length;j++){
      var p = itens[j].produto;
      var unit = getPrecosModo(p);
      brutoLimpo += unit.limpo * itens[j].qtd;
      brutoSujo  += unit.sujo  * itens[j].qtd;
    }

    var pctExtra = Math.max(0, Math.min(100, Number(descontoExtra||0) || 0));

    var totalLimpo = brutoLimpo * (1 - pctExtra/100);
    var totalSujo  = brutoSujo  * (1 - pctExtra/100);

    var modoLabel = (modoVenda === 'parceria') ? 'Parceria' : (modoVenda === 'alianca' ? 'Aliança' : 'Pista');

    var html = '';
    html += '<div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap:10px;">';
    html += '<div class="kpi"><div><b>Total (Limpo)</b></div><div><b>'+ moneyBR(totalLimpo) +'</b></div></div>';
    html += '<div class="kpi"><div><b>Total (Sujo)</b></div><div><b>'+ moneyBR(totalSujo) +'</b></div></div>';
    html += '</div>';

    html += '<div class="hr"></div>';
    html += '<div style="display:flex; gap:12px; flex-wrap:wrap; align-items:center;">';
    html += '<div><b>Cliente:</b> '+ modoLabel +'</div>';
    html += '<div><b>Desconto extra:</b> '+ pctExtra.toFixed(2).replace('.',',') +'%</div>';
    html += '</div>';

    // Itens (organizado): aqui mostramos só Produto + Quantidade.
    // Os valores já estão somados nos totais acima.
    html += '<div class="hr"></div>';
    html += '<div style="font-weight:900; margin-bottom:8px;">Itens selecionados</div>';
    html += '<div class="saleTbl">';
    html += '<div class="saleTr head">';
    html += '<div>Produto</div><div style="text-align:right;">Qtd</div>';
    html += '</div>';

    for (var i=0;i<itens.length;i++){
      var it = itens[i];
      html += '<div class="saleTr">';
      html += '<div>'+ escapeHtml(it.produto) +'</div>';
      html += '<div style="text-align:right;">'+ (Number(it.qtd||0)||0) +'</div>';
      html += '</div>';
    }

    if (!itens.length){
      html += '<div class="saleTr"><div style="opacity:.75;">Nenhum item selecionado.</div><div></div></div>';
    }

    html += '</div>';

    // Renderiza na área da Calculadora de Venda
    // (variável antiga 'financeiroOut' foi removida; usamos o container padrão do layout)
    if (resultadoFinanceiro) resultadoFinanceiro.innerHTML = html;
  }


  
  function atualizarTudo(){
    atualizarMateriais();
    calcularFinanceiro();
  }

  // ---------- Modal (admin products) ----------
  function openModal(){
    if (!modalBackdrop) return;
    modalBackdrop.style.display = 'flex';
    renderProdutos();
  }
  function closeModal(){
    if (!modalBackdrop) return;
    modalBackdrop.style.display = 'none';
    clearForm();
  }
  function clearForm(){
    editing = null;
    if (nomeProduto) nomeProduto.value = '';
    if (precoPistaLimpoProduto) precoPistaLimpoProduto.value = '';
    if (precoPistaSujoProduto) precoPistaSujoProduto.value = '';
    if (precoParceriaLimpoProduto) precoParceriaLimpoProduto.value = '';
    if (precoParceriaSujoProduto) precoParceriaSujoProduto.value = '';
    if (precoAliancaLimpoProduto) precoAliancaLimpoProduto.value = '';
    if (precoAliancaSujoProduto) precoAliancaSujoProduto.value = '';
    if (receitaProduto) receitaProduto.value = '';
    if (cancelarEdicaoBtn) cancelarEdicaoBtn.style.display = 'none';
    if (salvarProdutoBtn) salvarProdutoBtn.textContent = 'Salvar';
  }
  function parseReceita(txt){
    var rec = {};
    var lines = String(txt||'').split('\n');
    for (var i=0;i<lines.length;i++){
      var line = lines[i].trim();
      if (!line) continue;
      var parts = line.split('=');
      if (parts.length < 2) continue;
      var n = parts[0].trim();
      var q = Number(parts.slice(1).join('=').trim());
      if (!n || !isFinite(q) || q <= 0) continue;
      rec[n] = (rec[n] || 0) + q;
    }
    return rec;
  }
  function rebuildAllSelects(){
    var nomes = nomesProdutos();
    var sels = document.querySelectorAll('.produtoSelect');
    for (var i=0;i<sels.length;i++){
      var sel = sels[i];
      var prev = sel.value;
      var html = '';
      for (var j=0;j<nomes.length;j++){
        var n = nomes[j];
        html += '<option value="'+ escapeHtml(n) +'">'+ escapeHtml(n) +'</option>';
      }
      sel.innerHTML = html;
      sel.value = receitas[prev] ? prev : (nomes[0] || '');
    }
  }
  function renderProdutos(){
    var nomes = nomesProdutos();
    if (!nomes.length){
      listaProdutos.innerHTML = '<div style="opacity:.85;">Nenhum produto.</div>';
      return;
    }
    var html = '<div style="display:grid; gap:10px;">';
    for (var i=0;i<nomes.length;i++){
      var n = nomes[i];
      var count = Object.keys(receitas[n] || {}).length;
      html += '<div class="kpi" style="align-items:flex-start;">' +
        '<div style="display:grid; gap:4px;"><b>'+ escapeHtml(n) +'</b><div style="opacity:.85; font-size:12px;">'+ count +' materiais</div></div>' +
        '<div style="display:flex; gap:8px;">' +
          '<button class="btn btn-outline btn-small" type="button" data-edit="'+ escapeHtml(n) +'">✏️</button>' +
          '<button class="btn-danger btn-small" type="button" data-del="'+ escapeHtml(n) +'">🗑</button>' +
        '</div></div>';
    }
    html += '</div>';
    listaProdutos.innerHTML = html;

    var edits = listaProdutos.querySelectorAll('[data-edit]');
    for (var e=0;e<edits.length;e++){
      edits[e].addEventListener('click', function(){
        var n = this.getAttribute('data-edit');
        editing = n;
        if (nomeProduto) nomeProduto.value = n;
        var prEdit = ensurePreco(n);
        if (precoPistaLimpoProduto) precoPistaLimpoProduto.value = String(Number(prEdit.pista.limpo || 0) || 0);
        if (precoPistaSujoProduto) precoPistaSujoProduto.value = String(Number(prEdit.pista.sujo || 0) || 0);
        if (precoParceriaLimpoProduto) precoParceriaLimpoProduto.value = String(Number(prEdit.parceria.limpo || 0) || 0);
        if (precoParceriaSujoProduto) precoParceriaSujoProduto.value = String(Number(prEdit.parceria.sujo || 0) || 0);
        if (precoAliancaLimpoProduto) precoAliancaLimpoProduto.value = String(Number(prEdit.alianca.limpo || 0) || 0);
        if (precoAliancaSujoProduto) precoAliancaSujoProduto.value = String(Number(prEdit.alianca.sujo || 0) || 0);
        var lines = Object.keys(receitas[n]||{}).map(function(k){ return k + '=' + receitas[n][k]; })
          .sort(function(a,b){ return a.localeCompare(b,'pt-BR'); });
        if (receitaProduto) receitaProduto.value = lines.join('\n');
        if (cancelarEdicaoBtn) cancelarEdicaoBtn.style.display = 'inline-block';
        if (salvarProdutoBtn) salvarProdutoBtn.textContent = 'Salvar alterações';
      });
    }

    var dels = listaProdutos.querySelectorAll('[data-del]');
    for (var d=0;d<dels.length;d++){
      dels[d].addEventListener('click', function(){
        var n = this.getAttribute('data-del');
        if (!confirm('Remover o produto "'+ n +'"?')) return;
        delete receitas[n];
        delete precos[n];
        rebuildAllSelects();
        renderPrecos();
        renderProdutos();
        atualizarTudo();
        saveState();
      });
    }
  }

  // ---------- Download helper ----------
  function downloadText(filename, text){
    var blob = new Blob([text], {type:'application/json'});
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.parentNode.removeChild(a);
    setTimeout(function(){ try{ URL.revokeObjectURL(url); }catch(e){} }, 500);
  }

  // ---------- Bind actions ----------
  if (exportBtn) exportBtn.addEventListener('click', function(){
    if (!isAdmin()) { alert('Apenas admin pode exportar.'); return; }
    var payload = { app:'LAUREA_CALC', version:1, exportedAt:new Date().toISOString(), state: getState() };
    downloadText('laurea-backup.json', JSON.stringify(payload, null, 2));
  });

  if (importBtn && importFile) importBtn.addEventListener('click', function(){
    importFile.value = '';
    importFile.click();
  });

  if (importFile) importFile.addEventListener('change', function(){
    var file = importFile.files && importFile.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function(){
      try{
        var obj = JSON.parse(String(reader.result || '{}'));
        var st = (obj && obj.state) ? obj.state : obj;
        if (!st || typeof st !== 'object') throw new Error('invalid');
        if (!st.receitas || typeof st.receitas !== 'object') throw new Error('sem receitas');
        if (!st.precos || typeof st.precos !== 'object') st.precos = {};

        // Normaliza preços (v1 number, v2 {pista/parceria}, v3 {valor}, v4 {pista/parceria/alianca})
        for (var pk in st.precos){
          if (!st.precos.hasOwnProperty(pk)) continue;
          st.precos[pk] = normalizePrecoEntry(st.precos[pk]);
        }

        if (!Array.isArray(st.itens)) st.itens = [];
        if (typeof st.modoVenda === 'undefined') st.modoVenda = (st.vendaParceria ? 'parceria' : 'pista');
        if (typeof st.descontoExtra === 'undefined') st.descontoExtra = 0;

        // Remove campos antigos de desconto fixo, se existirem
        delete st.descontoParceriaAdmin;
        delete st.descontoAliancaAdmin;
        delete st.desconto;

        if (st.theme) { try{ localStorage.setItem(THEME_KEY, st.theme); }catch(e){} }
        lsSet(STATE_KEY, JSON.stringify(st));
        alert('Importado ✅\nA página vai recarregar.');
        location.reload();
      }catch(e){
        alert('Arquivo inválido.\nUse o JSON exportado pelo admin.');
      }
    };
    reader.readAsText(file);
  });

if (resetBtn) resetBtn.addEventListener('click', function(){
    if (!isAdmin()) { alert('Apenas admin pode resetar.'); return; }
    if (!confirm('Resetar tudo?\nIsso apaga produtos/preços/itens/desconto do aparelho.')) return;
    lsRemove(STATE_KEY);
    alert('Reset feito ✅\nA página vai recarregar.');
    location.reload();
  });

  if (adminBtn) adminBtn.addEventListener('click', function(){
    if (isAdmin()){
      setAdmin(false);
      applyPermissions();
      return;
    }
    var pwd = prompt('Senha do admin:');
    if (pwd === null) return;
    if (pwd === ADMIN_PASSWORD){
      setAdmin(true);
      applyPermissions();
      alert('Modo admin liberado ✅');
    } else {
      alert('Senha incorreta ❌');
    }
  });

  if (modoVendaSelect){
    modoVendaSelect.value = modoVenda || 'pista';
    modoVendaSelect.addEventListener('change', function(){
      setClienteVenda(modoVendaSelect.value);
    });
  }

  if (descontoExtraInput){
    descontoExtraInput.value = descontoExtra ? String(descontoExtra) : '';
    descontoExtraInput.addEventListener('input', function(){
      var d = Number(descontoExtraInput.value || 0);
      descontoExtra = isFinite(d) ? Math.max(0, Math.min(100, d)) : 0;
      calcularFinanceiro();
      saveState();
    });
  }

  if (novoProdutoBtn) novoProdutoBtn.addEventListener('click', function(){
    if (!isAdmin()) { alert('Apenas admin pode editar produtos.'); return; }
    openModal();
  });
  if (fecharModalBtn) fecharModalBtn.addEventListener('click', closeModal);
  if (modalBackdrop) modalBackdrop.addEventListener('click', function(e){
    if (e.target === modalBackdrop) closeModal();
  });
  if (cancelarEdicaoBtn) cancelarEdicaoBtn.addEventListener('click', clearForm);

  if (salvarProdutoBtn) salvarProdutoBtn.addEventListener('click', function(){
    if (!isAdmin()) { alert('Apenas admin pode salvar produtos.'); return; }
    var name = (nomeProduto.value || '').trim();
    var pricePistaLimpo = Number((precoPistaLimpoProduto && precoPistaLimpoProduto.value) || 0) || 0;
    var pricePistaSujo = Number((precoPistaSujoProduto && precoPistaSujoProduto.value) || 0) || 0;
    var priceParceriaLimpo = Number((precoParceriaLimpoProduto && precoParceriaLimpoProduto.value) || 0) || 0;
    var priceParceriaSujo = Number((precoParceriaSujoProduto && precoParceriaSujoProduto.value) || 0) || 0;
    var priceAliancaLimpo = Number((precoAliancaLimpoProduto && precoAliancaLimpoProduto.value) || 0) || 0;
    var priceAliancaSujo = Number((precoAliancaSujoProduto && precoAliancaSujoProduto.value) || 0) || 0;
    var rec = parseReceita(receitaProduto.value);
    if (!name) { alert('Nome obrigatório'); return; }
    if (!Object.keys(rec).length) { alert('Receita vazia'); return; }

    if (editing && editing !== name){
      receitas[name] = rec;
      precos[name] = {
        pista: { limpo: pricePistaLimpo, sujo: pricePistaSujo },
        parceria: { limpo: priceParceriaLimpo, sujo: priceParceriaSujo },
        alianca: { limpo: priceAliancaLimpo, sujo: priceAliancaSujo }
      };
      delete receitas[editing];
      delete precos[editing];
    } else {
      receitas[name] = rec;
      precos[name] = {
        pista: { limpo: pricePistaLimpo, sujo: pricePistaSujo },
        parceria: { limpo: priceParceriaLimpo, sujo: priceParceriaSujo },
        alianca: { limpo: priceAliancaLimpo, sujo: priceAliancaSujo }
      };
    }
    editing = null;
    clearForm();
    rebuildAllSelects();
    renderPrecos();
    renderProdutos();
    atualizarTudo();
    saveState();
    alert('Produto salvo ✅');
  });

  // ---------- Init ----------
  function init(){
    try{
      setStatus('ok', '<strong>Carregando</strong>…');
      initTheme();
      bindThemeButton();

    tryLoadRemotePublishedIfEmpty(function(){
      loadState();

      // ensure prices keys exist
      var nomes = nomesProdutos();
      for (var i=0;i<nomes.length;i++){
        ensurePreco(nomes[i]);
      }

      var first = nomesProdutos()[0];
      if (!first){
        setStatus('err', '<strong>Sem produtos</strong>. Importe um JSON do admin.');
        return;
      }

      setItensNaTela(itensState || [{produto:first, qtd:1}]);

      if (addItemBtn) addItemBtn.addEventListener('click', function(){
        var p = nomesProdutos()[0];
        if (!p) return;
        listaItens.appendChild(criarLinhaItem(p, 1));
        atualizarTudo();
        saveState();
      });

      renderPrecos();
      atualizarTudo();
      renderProdutos();
      applyPermissions();
      setStatus('ok', '<strong>JS OK</strong> • pronto');
    });
    }catch(e){
      try{ console.error(e); }catch(_){ }
      setStatus('err', '<strong>Erro no JavaScript</strong>: ' + (e && e.message ? e.message : String(e)));
    }
  }

  if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();