(() => {
  'use strict';

  const STATUS = document.getElementById('statusBar');
  const setStatus = (kind, msg) => {
    if (!STATUS) return;
    STATUS.classList.remove('ok','err');
    STATUS.classList.add(kind);
    STATUS.innerHTML = msg;
  };

  window.addEventListener('error', (e) => {
    setStatus('err', `<strong>Erro</strong> no JavaScript. Se puder, abra em outro navegador ou limpe cache.`);
    console.error(e.error || e.message);
  });

  // ---- Config ----
  const STATE_KEY = 'laurea_pages_state_v1';
  const ADMIN_PASSWORD = 'jujuba!05'; // offline
  const ADMIN_SESSION_KEY = 'laurea_admin_session_v1';


  // ---- Theme (Light / Dark) ----
  const THEME_KEY = 'laurea_theme';
  function getCurrentTheme(){
    const t = document.documentElement.getAttribute('data-theme');
    return (t === 'dark' || t === 'light') ? t : 'light';
  }
  function updateThemeBtn(){
    try{
      const btn = document.getElementById('themeToggleBtn');
      if (!btn) return;
      const cur = getCurrentTheme();
      btn.disabled = false;
      btn.textContent = (cur === 'dark') ? '☀️ Tema' : '🌙 Tema';
    }catch(e){}
  }
  function applyTheme(theme){
    const t = (theme === 'dark') ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', t);
    try{ localStorage.setItem(THEME_KEY, t); }catch{}
    updateThemeBtn();
  }
  function initTheme(){
    let t = null;
    try{ t = localStorage.getItem(THEME_KEY); }catch{}
    if (t !== 'dark' && t !== 'light') t = 'light';
    applyTheme(t);
  }

  function bindThemeButton(){
    const btn = document.getElementById('themeToggleBtn');
    if (!btn) return;
    btn.disabled = false;
    updateThemeBtn();
    if (btn.__bound) return;
    btn.__bound = true;
    btn.addEventListener('click', () => {
      const cur = getCurrentTheme();
      applyTheme(cur === 'light' ? 'dark' : 'light');
    });
  }

  const lsGet = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
 = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
  const lsSet = (k,v) => { try { localStorage.setItem(k,v); } catch {} };
  const lsRemove = (k) => { try { localStorage.removeItem(k); } catch {} };

  const isAdmin = () => {
    try { return sessionStorage.getItem(ADMIN_SESSION_KEY) === '1'; } catch { return false; }
  };
  const setAdmin = (on) => {
    try {
      if (on) sessionStorage.setItem(ADMIN_SESSION_KEY,'1');
      else sessionStorage.removeItem(ADMIN_SESSION_KEY);
    } catch {}
  };

  // ---- Default data (fallback if remote missing) ----
  const DEFAULT_RECEITAS = window.LAUREA_DEFAULT_RECEITAS || {};
  let receitas = JSON.parse(JSON.stringify(DEFAULT_RECEITAS));
  let precos = {};
  let desconto = 0;
  let itensState = null;

  // ---- Remote published state (GitHub Pages) ----
  async function tryLoadRemotePublishedIfEmpty(){
    try{
      if (lsGet(STATE_KEY)) return;
      const res = await fetch('laurea-state.json?cb=' + Date.now(), { cache:'no-store' });
      if (!res.ok) return;
      const obj = await res.json();
      const st = obj && obj.state ? obj.state : obj;
      if (!st || typeof st !== 'object') return;
      if (!st.receitas || typeof st.receitas !== 'object') return;
      if (!st.precos || typeof st.precos !== 'object') st.precos = {};
      if (!Array.isArray(st.itens)) st.itens = [];
      if (st.desconto === undefined) st.desconto = 0;
      lsSet(STATE_KEY, JSON.stringify(st));
    }catch(e){}
  }

  function loadState(){
    const raw = lsGet(STATE_KEY);
    if (!raw) return false;
    try{
      const st = JSON.parse(raw);
      if (st.theme) applyTheme(st.theme);
      if (st.receitas && typeof st.receitas === 'object') receitas = st.receitas;
      if (st.precos && typeof st.precos === 'object') precos = st.precos;
      if (typeof st.desconto !== 'undefined') desconto = Math.max(0, Math.min(100, Number(st.desconto)||0));
      if (Array.isArray(st.itens)) itensState = st.itens;
      return true;
    }catch{
      return false;
    }
  }

  function getItensDaTela(){
    const rows = document.querySelectorAll('.item-row');
    const itens = [];
    rows.forEach(r => {
      const prod = r.querySelector('.produtoSelect')?.value || '';
      const qtd = Math.max(0, Math.floor(Number(r.querySelector('.produtoQtd')?.value || 0)));
      if (prod && qtd > 0) itens.push({ produto: prod, qtd });
    });
    return itens;
  }

  function getState(){
    return { theme: getCurrentTheme(), receitas, precos, desconto, itens: getItensDaTela() };
  }

  let saveT = null;
  function saveState(){
    clearTimeout(saveT);
    saveT = setTimeout(() => {
      lsSet(STATE_KEY, JSON.stringify(getState()));
      setStatus('ok', `<strong>Online</strong> • salvando automaticamente`);
    }, 200);
  }

  // ---- UI refs ----
  const adminBtn = document.getElementById('adminBtn');
  const themeToggleBtn = document.getElementById('themeToggleBtn');
  const importBtn = document.getElementById('importBtn');
  const exportBtn = document.getElementById('exportBtn');
  const resetBtn  = document.getElementById('resetBtn');
  const importFile = document.getElementById('importFile');

  const listaItens = document.getElementById('listaItens');
  const addItemBtn = document.getElementById('addItemBtn');

  const materiaisNecessarios = document.getElementById('materiaisNecessarios');
  const tabelaPrecos = document.getElementById('tabelaPrecos');
  const resultadoFinanceiro = document.getElementById('resultadoFinanceiro');
  const descontoInput = document.getElementById('descontoInput');

  // Modal
  const modalBackdrop = document.getElementById('modalBackdrop');
  const novoProdutoBtn = document.getElementById('novoProdutoBtn');
  const fecharModalBtn = document.getElementById('fecharModalBtn');
  const nomeProduto = document.getElementById('nomeProduto');
  const precoProduto = document.getElementById('precoProduto');
  const receitaProduto = document.getElementById('receitaProduto');
  const salvarProdutoBtn = document.getElementById('salvarProdutoBtn');
  const cancelarEdicaoBtn = document.getElementById('cancelarEdicaoBtn');
  const listaProdutos = document.getElementById('listaProdutos');

  let editing = null;

  // ---- Helpers ----
  const nomesProdutos = () => Object.keys(receitas).sort((a,b)=>a.localeCompare(b,'pt-BR'));
  const moneyBR = (v) => (Number(v||0)).toLocaleString('pt-BR', {style:'currency', currency:'BRL'});

  function applyPermissions(){
    const admin = isAdmin();

    // Import sempre liberado
    if (importBtn) importBtn.disabled = false;

    
    // Tema: sempre liberado
    if (themeToggleBtn){ themeToggleBtn.disabled = false; themeToggleBtn.style.pointerEvents = 'auto'; }
// Admin controls
    const adminEls = document.querySelectorAll('[data-admin-only="1"]');
    adminEls.forEach(el => { el.disabled = !admin; });

    // Preços: trava inputs sem admin
    const priceInputs = document.querySelectorAll('#tabelaPrecos input');
    priceInputs.forEach(inp => inp.disabled = !admin);

    if (adminBtn) adminBtn.textContent = admin ? '🔓 Sair do admin' : '🔒 Admin';
  }

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

  function rebuildSelect(sel, desired){
    const nomes = nomesProdutos();
    sel.innerHTML = nomes.map(n=>`<option value="${n.replaceAll('"','&quot;')}">${n}</option>`).join('');
    sel.value = (desired && receitas[desired]) ? desired : (nomes[0] || '');
  }

  function criarLinhaItem(prod, qtd){
    const row = document.createElement('div');
    row.className = 'item-row';
    row.innerHTML = `
      <div class="row">
        <div>
          <label>Produto</label>
          <select class="produtoSelect"></select>
        </div>
        <div style="max-width:220px;">
          <label>Quantidade</label>
          <input class="produtoQtd" type="number" min="0" step="1" value="${qtd||1}">
        </div>
        <div style="max-width:180px;">
          <button type="button" class="btn-danger btnRemove" style="width:100%;">🗑 Remover</button>
        </div>
      </div>`;
    const sel = row.querySelector('.produtoSelect');
    rebuildSelect(sel, prod);

    row.querySelector('.btnRemove').addEventListener('click', () => {
      row.remove();
      atualizarTudo();
      saveState();
    });
    sel.addEventListener('change', () => { atualizarTudo(); saveState(); });
    row.querySelector('.produtoQtd').addEventListener('input', () => { atualizarTudo(); saveState(); });
    return row;
  }

  function setItensNaTela(itens){
    listaItens.innerHTML = '';
    if (!Array.isArray(itens) || !itens.length){
      const first = nomesProdutos()[0];
      if (first) listaItens.appendChild(criarLinhaItem(first, 1));
      return;
    }
    itens.forEach(it => {
      if (it && receitas[it.produto]) listaItens.appendChild(criarLinhaItem(it.produto, it.qtd||1));
    });
  }

  function itensSelecionados(){
    return getItensDaTela();
  }

  // Materials expansion
  function somar(target, add){
    for (const k in add) target[k] = (target[k]||0) + add[k];
    return target;
  }
  function baseMaterials(item, qty, visiting = {}){
    if (!receitas[item]) return { [item]: qty };
    if (visiting[item]) return { [item]: qty };
    visiting[item] = true;
    const rec = receitas[item];
    let total = {};
    for (const ing in rec){
      const need = rec[ing] * qty;
      if (receitas[ing]) total = somar(total, baseMaterials(ing, need, visiting));
      else total[ing] = (total[ing]||0) + need;
    }
    visiting[item] = false;
    return total;
  }

  function atualizarMateriais(){
    const itens = itensSelecionados();
    let mat = {};
    itens.forEach(it => { mat = somar(mat, baseMaterials(it.produto, it.qtd, {})); });
    const keys = Object.keys(mat).sort((a,b)=>a.localeCompare(b,'pt-BR'));
    if (!keys.length){
      materiaisNecessarios.innerHTML = `<div style="opacity:.85;">Adicione produtos para ver materiais.</div>`;
      return;
    }
    const totalQtd = itens.reduce((a,x)=>a+x.qtd,0);
    let html = `<div class="kpi"><div><b>Total de materiais</b></div><div style="opacity:.85;">Itens: <b>${totalQtd}</b></div></div><div class="hr"></div>`;
    html += `<div style="display:grid; grid-template-columns: 1fr auto; gap:8px;">`;
    keys.forEach(k => { html += `<div>${k}</div><div style="text-align:right;"><b>${mat[k]}</b></div>`; });
    html += `</div>`;
    materiaisNecessarios.innerHTML = html;
  }

  function renderPrecos(){
    const nomes = nomesProdutos();
    let html = `<div style="display:grid; grid-template-columns: 1fr 180px; gap:10px; align-items:center;">`;
    nomes.forEach(n => {
      html += `<div><b>${n}</b></div>`;
      html += `<div><input class="precoInp" data-prod="${n.replaceAll('"','&quot;')}" type="number" min="0" step="0.01" placeholder="R$" value="${(precos[n]||'')}"></div>`;
    });
    html += `</div>`;
    tabelaPrecos.innerHTML = html;

    tabelaPrecos.querySelectorAll('.precoInp').forEach(inp => {
      inp.addEventListener('input', () => {
        precos[inp.getAttribute('data-prod')] = Number(inp.value||0) || 0;
        calcularFinanceiro();
        saveState();
      });
    });

    applyPermissions();

    // Theme toggle
    const themeBtn = document.getElementById('themeToggleBtn');
    if (themeBtn){
      themeBtn.addEventListener('click', () => {
        const current = document.documentElement.getAttribute('data-theme') || 'light';
        applyTheme(current === 'light' ? 'dark' : 'light');
      });
    }

  }

  function calcularFinanceiro(){
    const itens = itensSelecionados();
    let bruto = 0;
    itens.forEach(it => { bruto += (Number(precos[it.produto]||0) || 0) * it.qtd; });

    const pct = Math.max(0, Math.min(100, Number(desconto||0) || 0));
    const descValor = bruto * (pct / 100);
    const totalCobrar = bruto - descValor;

    let html = `<div class="kpi"><div><b>Total a cobrar</b></div><div><b>${moneyBR(totalCobrar)}</b></div></div>`
             + `<div class="hr"></div>`
             + `<div style="display:grid; grid-template-columns: 1fr auto; gap:8px;">`
             +   `<div>Desconto (parcerias)</div><div style="text-align:right;"><b>- ${pct}% (${moneyBR(descValor)})</b></div>`
             + `</div>`;

    if (itens.length){
      html += `<div style="margin-top:10px; opacity:.92;"><b>Detalhe por produto</b></div>`;
      html += `<div style="display:grid; grid-template-columns: 1fr auto auto; gap:8px; margin-top:8px;">`
           +  `<div style="opacity:.8;">Produto</div><div style="text-align:right; opacity:.8;">Qtd</div><div style="text-align:right; opacity:.8;">Subtotal</div>`;
      itens.forEach(it => {
        const sub = (Number(precos[it.produto]||0) || 0) * it.qtd;
        html += `<div>${it.produto}</div><div style="text-align:right;"><b>${it.qtd}</b></div><div style="text-align:right;"><b>${moneyBR(sub)}</b></div>`;
      });
      html += `</div>`;
      html += `<div style="margin-top:10px; font-size:12px; color:var(--muted);">O desconto de parceria é aplicado no <b>total</b>.</div>`;
    } else {
      html += `<div style="opacity:.85; margin-top:10px;">Adicione produtos e quantidades.</div>`;
    }
    resultadoFinanceiro.innerHTML = html;
  }

  function atualizarTudo(){
    atualizarMateriais();
    calcularFinanceiro();
  }

  // ---- Produtos (admin) ----
  function clearForm(){
    editing = null;
    nomeProduto.value = '';
    precoProduto.value = '';
    receitaProduto.value = '';
    cancelarEdicaoBtn.style.display = 'none';
    salvarProdutoBtn.textContent = 'Salvar';
  }

  function parseReceita(txt){
    const rec = {};
    (txt||'').split('\n').forEach(line => {
      line = line.trim();
      if (!line) return;
      const parts = line.split('=');
      if (parts.length < 2) return;
      const n = parts[0].trim();
      const q = Number(parts.slice(1).join('=').trim());
      if (!n || !isFinite(q) || q <= 0) return;
      rec[n] = (rec[n]||0) + q;
    });
    return rec;
  }

  function rebuildAllSelects(){
    const nomes = nomesProdutos();
    document.querySelectorAll('.produtoSelect').forEach(sel => {
      const prev = sel.value;
      sel.innerHTML = nomes.map(n=>`<option value="${n.replaceAll('"','&quot;')}">${n}</option>`).join('');
      sel.value = receitas[prev] ? prev : (nomes[0] || '');
    });
  }

  function renderProdutos(){
    const nomes = nomesProdutos();
    if (!nomes.length){
      listaProdutos.innerHTML = `<div style="opacity:.85;">Nenhum produto.</div>`;
      return;
    }
    let html = `<div style="display:grid; gap:10px;">`;
    nomes.forEach(n => {
      const count = Object.keys(receitas[n]||{}).length;
      html += `<div class="kpi" style="align-items:flex-start;">`
           +  `<div style="display:grid; gap:4px;"><b>${n}</b><div style="opacity:.85; font-size:12px;">${count} materiais</div></div>`
           +  `<div style="display:flex; gap:8px;">`
           +  `<button class="btn btn-outline btn-small" type="button" data-edit="${n.replaceAll('"','&quot;')}">✏️</button>`
           +  `<button class="btn-danger btn-small" type="button" data-del="${n.replaceAll('"','&quot;')}">🗑</button>`
           +  `</div></div>`;
    });
    html += `</div>`;
    listaProdutos.innerHTML = html;

    listaProdutos.querySelectorAll('[data-edit]').forEach(b => {
      b.addEventListener('click', () => {
        const n = b.getAttribute('data-edit');
        editing = n;
        nomeProduto.value = n;
        precoProduto.value = precos[n] ? precos[n] : '';
        const lines = Object.keys(receitas[n]||{}).map(k=>`${k}=${receitas[n][k]}`).sort((a,b)=>a.localeCompare(b,'pt-BR'));
        receitaProduto.value = lines.join('\n');
        cancelarEdicaoBtn.style.display = 'inline-block';
        salvarProdutoBtn.textContent = 'Salvar alterações';
      });
    });

    listaProdutos.querySelectorAll('[data-del]').forEach(b => {
      b.addEventListener('click', () => {
        const n = b.getAttribute('data-del');
        if (!confirm(`Remover o produto "${n}"?`)) return;
        delete receitas[n];
        delete precos[n];
        rebuildAllSelects();
        renderPrecos();
        renderProdutos();
        atualizarTudo();
        saveState();
      });
    });
  }

  // ---- Export/Import/Reset ----
  function downloadText(filename, text){
    const blob = new Blob([text], {type:'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(()=>URL.revokeObjectURL(url), 500);
  }

  if (exportBtn) exportBtn.addEventListener('click', () => {
    if (!isAdmin()) { alert('Apenas admin pode exportar.'); return; }
    const payload = { app:'LAUREA_CALC', version:1, exportedAt:new Date().toISOString(), state: getState() };
    downloadText('laurea-backup.json', JSON.stringify(payload, null, 2));
  });

  if (importBtn && importFile) importBtn.addEventListener('click', () => {
    importFile.value = '';
    importFile.click();
  });

  if (importFile) importFile.addEventListener('change', () => {
    const file = importFile.files && importFile.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try{
        const obj = JSON.parse(String(reader.result || '{}'));
        const st = obj && obj.state ? obj.state : obj;
        if (!st || typeof st !== 'object') throw new Error('invalid');
        if (!st.receitas || typeof st.receitas !== 'object') throw new Error('sem receitas');
        if (!st.precos || typeof st.precos !== 'object') st.precos = {};
        if (!Array.isArray(st.itens)) st.itens = [];
        if (st.desconto === undefined) st.desconto = 0;
        lsSet(STATE_KEY, JSON.stringify(st));
        if (st.theme) { try{ localStorage.setItem(THEME_KEY, st.theme); }catch(e){} }
        alert('Importado ✅\nA página vai recarregar.');
        location.reload();
      }catch{
        alert('Arquivo inválido.\nUse o JSON exportado pelo admin.');
      }
    };
    reader.readAsText(file);
  });

  if (resetBtn) resetBtn.addEventListener('click', () => {
    if (!isAdmin()) { alert('Apenas admin pode resetar.'); return; }
    const ok = confirm('Resetar tudo?\nIsso apaga produtos/preços/itens/desconto do aparelho.');
    if (!ok) return;
    lsRemove(STATE_KEY);
    alert('Reset feito ✅\nA página vai recarregar.');
    location.reload();
  });

  
  // ---- Admin button ----
  if (adminBtn) adminBtn.addEventListener('click', () => {
    if (isAdmin()){
      setAdmin(false);
      applyPermissions();

    // Theme toggle
    const themeBtn = document.getElementById('themeToggleBtn');
    if (themeBtn){
      themeBtn.addEventListener('click', () => {
        const current = document.documentElement.getAttribute('data-theme') || 'light';
        applyTheme(current === 'light' ? 'dark' : 'light');
      });
    }

      return;
    }
    const pwd = prompt('Senha do admin:');
    if (pwd === null) return;
    if (pwd === ADMIN_PASSWORD){
      setAdmin(true);
      applyPermissions();

    // Theme toggle
    const themeBtn = document.getElementById('themeToggleBtn');
    if (themeBtn){
      themeBtn.addEventListener('click', () => {
        const current = document.documentElement.getAttribute('data-theme') || 'light';
        applyTheme(current === 'light' ? 'dark' : 'light');
      });
    }

      alert('Modo admin liberado ✅');
    } else {
      alert('Senha incorreta ❌');
    }
  });

  // ---- Discount input ----
  if (descontoInput){
    descontoInput.value = desconto ? String(desconto) : '';
    descontoInput.addEventListener('input', () => {
      const d = Number(descontoInput.value||0);
      desconto = isFinite(d) ? Math.max(0, Math.min(100, d)) : 0;
      calcularFinanceiro();
      saveState();
    });
  }

  // ---- Modal events (admin-only button still visible but disabled) ----
  if (novoProdutoBtn) novoProdutoBtn.addEventListener('click', () => {
    if (!isAdmin()) { alert('Apenas admin pode editar produtos.'); return; }
    openModal();
  });
  if (fecharModalBtn) fecharModalBtn.addEventListener('click', closeModal);
  if (modalBackdrop) modalBackdrop.addEventListener('click', (e) => { if (e.target === modalBackdrop) closeModal(); });

  if (cancelarEdicaoBtn) cancelarEdicaoBtn.addEventListener('click', clearForm);
  if (salvarProdutoBtn) salvarProdutoBtn.addEventListener('click', () => {
    if (!isAdmin()) { alert('Apenas admin pode salvar produtos.'); return; }
    const name = (nomeProduto.value||'').trim();
    const price = Number(precoProduto.value||0) || 0;
    const rec = parseReceita(receitaProduto.value);
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

  
  // ---- Theme toggle button ----
    // ---- Init ----
  document.addEventListener('DOMContentLoaded', async () => {
    initTheme();
    bindThemeButton();
    updateThemeBtn();
    setStatus('ok', `<strong>Carregando</strong>…`);

    await tryLoadRemotePublishedIfEmpty();
    loadState();

    // Initialize prices for any missing keys
    nomesProdutos().forEach(p => { if (typeof precos[p] === 'undefined') precos[p] = 0; });

    // Itens list
    const first = nomesProdutos()[0];
    if (!first){
      setStatus('err', `<strong>Sem produtos</strong>. Importe um JSON do admin.`);
      return;
    }
    setItensNaTela(itensState || [{produto:first, qtd:1}]);

    // Add item button
    if (addItemBtn) addItemBtn.addEventListener('click', () => {
      const p = nomesProdutos()[0];
      if (!p) return;
      listaItens.appendChild(criarLinhaItem(p, 1));
      atualizarTudo();
      saveState();
    });

    renderPrecos();
    atualizarTudo();
    renderProdutos();
    applyPermissions();

    // Theme toggle
    const themeBtn = document.getElementById('themeToggleBtn');
    if (themeBtn){
      themeBtn.addEventListener('click', () => {
        const current = document.documentElement.getAttribute('data-theme') || 'light';
        applyTheme(current === 'light' ? 'dark' : 'light');
      });
    }


    setStatus('ok', `<strong>JS OK</strong> • pronto`);
  });

})();