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
    try{ console.error(e.error || e.message || e); }catch(_){}
    setStatus('err', '<strong>Erro</strong> no JavaScript. Atualize a página (Ctrl+Shift+R).');
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
  var precos = {};
  var desconto = 0;
  var itensState = null;

  function nomesProdutos(){
    return Object.keys(receitas).sort(function(a,b){
      return a.localeCompare(b,'pt-BR');
    });
  }

  function loadState(){
    var raw = lsGet(STATE_KEY);
    if (!raw) return false;
    try{
      var st = JSON.parse(raw);
      if (st.theme) applyTheme(st.theme);
      if (st.receitas && typeof st.receitas === 'object') receitas = st.receitas;
      if (st.precos && typeof st.precos === 'object') precos = st.precos;
      if (typeof st.desconto !== 'undefined'){
        var d = Number(st.desconto) || 0;
        desconto = Math.max(0, Math.min(100, d));
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
    return { theme: getCurrentTheme(), receitas: receitas, precos: precos, desconto: desconto, itens: getItensDaTela() };
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
          if (!Array.isArray(st.itens)) st.itens = [];
          if (typeof st.desconto === 'undefined') st.desconto = 0;
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
  var descontoInput = document.getElementById('descontoInput');

  // Modal
  var modalBackdrop = document.getElementById('modalBackdrop');
  var novoProdutoBtn = document.getElementById('novoProdutoBtn');
  var fecharModalBtn = document.getElementById('fecharModalBtn');
  var nomeProduto = document.getElementById('nomeProduto');
  var precoProduto = document.getElementById('precoProduto');
  var receitaProduto = document.getElementById('receitaProduto');
  var salvarProdutoBtn = document.getElementById('salvarProdutoBtn');
  var cancelarEdicaoBtn = document.getElementById('cancelarEdicaoBtn');
  var listaProdutos = document.getElementById('listaProdutos');

  var editing = null;

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
    var html = '<div style="display:grid; grid-template-columns: 1fr 180px; gap:10px; align-items:center;">';
    for (var i=0;i<nomes.length;i++){
      var n = nomes[i];
      html += '<div><b>'+ escapeHtml(n) +'</b></div>';
      var v = (precos[n] || '');
      html += '<div><input class="precoInp" data-prod="'+ escapeHtml(n) +'" type="number" min="0" step="0.01" placeholder="R$" value="'+ v +'"></div>';
    }
    html += '</div>';
    tabelaPrecos.innerHTML = html;

    var inps = tabelaPrecos.querySelectorAll('.precoInp');
    for (var j=0;j<inps.length;j++){
      inps[j].addEventListener('input', function(ev){
        var p = this.getAttribute('data-prod');
        precos[p] = Number(this.value || 0) || 0;
        calcularFinanceiro();
        saveState();
      });
    }

    applyPermissions();
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
    var bruto = 0;
    for (var i=0;i<itens.length;i++){
      var p = itens[i].produto;
      bruto += (Number(precos[p] || 0) || 0) * itens[i].qtd;
    }
    var pct = Math.max(0, Math.min(100, Number(desconto||0) || 0));
    var descValor = bruto * (pct / 100);
    var totalCobrar = bruto - descValor;

    var html = '<div class="kpi"><div><b>Total a cobrar</b></div><div><b>'+ moneyBR(totalCobrar) +'</b></div></div>' +
      '<div class="hr"></div>' +
      '<div style="display:grid; grid-template-columns: 1fr auto; gap:8px;">' +
        '<div>Desconto (parcerias)</div><div style="text-align:right;"><b>- '+ pct +'% ('+ moneyBR(descValor) +')</b></div>' +
      '</div>';

    if (itens.length){
      html += '<div style="margin-top:10px; opacity:.92;"><b>Detalhe por produto</b></div>';
      html += '<div style="display:grid; grid-template-columns: 1fr auto auto; gap:8px; margin-top:8px;">' +
        '<div style="opacity:.8;">Produto</div><div style="text-align:right; opacity:.8;">Qtd</div><div style="text-align:right; opacity:.8;">Subtotal</div>';
      for (var j=0;j<itens.length;j++){
        var it = itens[j];
        var sub = (Number(precos[it.produto] || 0) || 0) * it.qtd;
        html += '<div>'+ escapeHtml(it.produto) +'</div><div style="text-align:right;"><b>'+ it.qtd +'</b></div><div style="text-align:right;"><b>'+ moneyBR(sub) +'</b></div>';
      }
      html += '</div><div style="margin-top:10px; font-size:12px; color:var(--muted);">O desconto de parceria é aplicado no <b>total</b>.</div>';
    } else {
      html += '<div style="opacity:.85; margin-top:10px;">Adicione produtos e quantidades.</div>';
    }

    resultadoFinanceiro.innerHTML = html;
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
    if (precoProduto) precoProduto.value = '';
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
        if (precoProduto) precoProduto.value = precos[n] ? precos[n] : '';
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
        if (!Array.isArray(st.itens)) st.itens = [];
        if (typeof st.desconto === 'undefined') st.desconto = 0;
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

  if (descontoInput){
    descontoInput.value = desconto ? String(desconto) : '';
    descontoInput.addEventListener('input', function(){
      var d = Number(descontoInput.value || 0);
      desconto = isFinite(d) ? Math.max(0, Math.min(100, d)) : 0;
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
    var price = Number(precoProduto.value || 0) || 0;
    var rec = parseReceita(receitaProduto.value);
    if (!name) { alert('Nome obrigatório'); return; }
    if (!Object.keys(rec).length) { alert('Receita vazia'); return; }

    if (editing && editing !== name){
      receitas[name] = rec;
      precos[name] = price;
      delete receitas[editing];
      delete precos[editing];
    } else {
      receitas[name] = rec;
      precos[name] = price;
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
    setStatus('ok', '<strong>Carregando</strong>…');
    initTheme();
    bindThemeButton();

    tryLoadRemotePublishedIfEmpty(function(){
      loadState();

      // ensure prices keys exist
      var nomes = nomesProdutos();
      for (var i=0;i<nomes.length;i++){
        if (typeof precos[nomes[i]] === 'undefined') precos[nomes[i]] = 0;
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
  }

  if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();