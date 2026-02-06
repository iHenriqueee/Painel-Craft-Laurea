# LAUREA – GitHub Pages (passo a passo)

## 1) Como publicar
1. Suba **todos os arquivos** desta pasta para a raiz do seu repositório.
2. No GitHub: **Settings → Pages**
   - **Source**: Deploy from a branch
   - **Branch**: `main` (ou `master`) / **/(root)**
3. Aguarde o deploy terminar e abra o link do Pages.

## 2) Importante (evita “bugado”)
- Existe um arquivo **.nojekyll** aqui. Ele evita que o GitHub Pages/Jekyll ignore arquivos e pastas especiais.
- Os arquivos `styles.css` e `app.js` já têm `?v=...` no `index.html` para forçar atualização e evitar cache antigo.
- Se você ainda ver algo velho: faça **Ctrl + Shift + R** ou abra em **aba anônima**.

## 3) Repositório do tipo /repo (não é usuário.github.io)
Este projeto usa caminhos **relativos**, então funciona tanto em:
- `https://usuario.github.io/`
- `https://usuario.github.io/SEU_REPO/`

## 4) SPA / Links diretos
O arquivo **404.html** redireciona para o `index.html` (boa prática no Pages).
