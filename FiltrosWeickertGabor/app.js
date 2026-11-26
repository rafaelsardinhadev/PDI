/*
 * app.js — Interface: abrir imagem, sliders, visualização antes/depois.
 * Os cálculos ficam em filtros.js (window.Filtros); aqui só há ligação com a tela.
 */
(function () {
    "use strict";
    const F = window.Filtros;
    const $ = function (sId) { return document.getElementById(sId); };

    // Paleta do tema preto e laranja (os desenhos em canvas não enxergam as variáveis do CSS; manter igual a estilo.css)
    const oCor = { fundo: "#141210", grade: "#2a2622", texto: "#f2eee8", texto2: "#a39c92", laranja: "#e98f47", claro: "#ece6dc", env: "#756e65", guia: "#8a8278", mapa: "#0c0b0a" };
    const NBSP = String.fromCharCode(160);
    const sFonteGrafico = '"Geist", "Segoe UI", system-ui, sans-serif';
    const ic = function (sNome) { return '<svg class="ic" aria-hidden="true"><use href="#i-' + sNome + '"/></svg>'; };

    // =====================================================================
    //  ESTADO
    // =====================================================================
    const oEstado = {
        sAba: "gabor",
        oFonte: null, sNome: "",            // imagem original (canvas, resolução total)
        iMaxLado: 384, iL: 0, iA: 0,        // resolução de trabalho
        mLimpa: null, mRuido: null, mUnif: null,
        mRuidosa: null, mMascara: null, mMeia: null, iVersao: 0,
        bAvisouRuido: false
    };

    // Valores atuais dos sliders (em unidades de interface: graus, px ...)
    const oUI = {
        d: { ruido: 0, remover: 0 },
        g: { lambda: 8, theta: 0, sigma: 3, gama: 0.5, psi: 90, n: 1, ganho: 3, modo: "magnitude", dc: true },   // θ, γ e N fixos (sem slider)
        w: { modelo: "eed", dif: "weickert", lambda: 6, sigma: 1.5, rho: 4, alfa: 0.001, c: 20, tau: 0.2, iter: 12 }
    };

    // =====================================================================
    //  ESPECIFICAÇÃO DOS CONTROLES
    // =====================================================================
    const aEspDeg = [
        { k: "ruido", simb: "η", nome: "Ruído gaussiano", min: 0, max: 80, passo: 1, un: "", dica: "Desvio padrão do ruído somado à imagem (níveis de cinza, escala 0–255)." },
        { k: "remover", simb: "%", nome: "Pixels removidos", min: 0, max: 90, passo: 1, un: " %", so: ["weickert"], dica: "Apaga pixels ao acaso. A difusão preenche os buracos (restauração/inpainting)." }
    ];
    const aEspGabor = [
        { k: "lambda", simb: "λ", nome: "Comprimento de onda", min: 2, max: 40, passo: 0.5, un: " px", dica: "Período da senoide: espessura de listra/borda a que o filtro responde." },
        { k: "sigma", simb: "σ", nome: "Largura da janela", min: 1, max: 8, passo: 0.1, un: " px", dica: "Desvio padrão da gaussiana: mais largo = mais ciclos, mais seletivo em λ (e mais lento)." },
        { k: "psi", simb: "ψ", nome: "Fase", min: 0, max: 360, passo: 5, un: "°", dica: "0° (par): realça linhas/cristas. 90° (ímpar): responde a bordas (degraus)." },
        { k: "ganho", simb: "k", nome: "Ganho do realce", min: 0, max: 10, passo: 0.1, un: "", so: ["realce"], dica: "Saída = I + k · r  (soma a resposta à imagem original)." }
    ];
    const aEspWeickert = [
        { k: "lambda", simb: "λ", nome: "Contraste (limiar de borda)", min: 1, max: 60, passo: 0.5, un: "", mod: ["pm", "eed"], dica: "Gradiente maior que λ é tratado como borda (difusão bloqueada); menor, como ruído." },
        { k: "sigma", simb: "σ", nome: "Escala do ruído (pré-suavização)", min: 0, max: 5, passo: 0.1, un: " px", dica: "Gaussiana usada só para estimar o gradiente que monta o tensor. σ = 0 desliga." },
        { k: "rho", simb: "ρ", nome: "Escala de integração", min: 0, max: 12, passo: 0.1, un: " px", mod: ["ced"], dica: "Suaviza o tensor de estrutura: quão longe a orientação das estruturas é estimada." },
        { k: "alfa", simb: "α", nome: "Difusão residual", min: 0.001, max: 0.3, passo: 0.001, un: "", mod: ["ced"], dica: "Difusão mínima atravessando as estruturas. Perto de 0 preserva as cristas." },
        { k: "c", simb: "c", nome: "Limiar de coerência", min: 1, max: 100, passo: 1, un: "", mod: ["ced"], dica: "Estruturas com gradiente acima de c são coerentes. Equivale ao C de Weickert: C = c⁴." },
        { k: "tau", simb: "τ", nome: "Passo de tempo", min: 0.05, max: 0.5, passo: 0.01, un: "", dica: "Esquema explícito; testado estável (sem excesso nem oscilação) até 0,5." },
        { k: "iter", simb: "n", nome: "Iterações (tempo t = n·τ)", min: 1, max: 500, passo: 1, un: "", dica: "Quantas vezes a equação é avançada. Subir o valor continua de onde parou." }
    ];
    const oPredefW = {      // valores sugeridos ao trocar de modelo
        pm:  { dif: "pm1",      lambda: 8, sigma: 1,   tau: 0.2,  iter: 30 },
        eed: { dif: "weickert", lambda: 6, sigma: 1.5, tau: 0.2,  iter: 12 },
        ced: { sigma: 1.5, rho: 4, alfa: 0.001, c: 20, tau: 0.25, iter: 60 }
    };
    // Ao clicar em Resposta/Magnitude/Realce (Gabor) ou em um modelo (Weickert), os parâmetros voltam
    // aos valores usados nos slides de resultado: Gabor λ 8, σ 3, ψ 90°, k 4, imagem sem ruído;
    // Weickert com ruído 25 (PSNR da imagem com ruído: 20,6 dB).
    const oPredefG = { lambda: 8, sigma: 3, psi: 90, ganho: 4, dc: true };
    const oPredefDegW = { ruido: 25, remover: 0 };
    const oNomesModo = { resposta: "Resposta r (com sinal)", magnitude: "Magnitude |r|", realce: "Realce  I + k·r" };

    // =====================================================================
    //  UTILIDADES DE TELA
    // =====================================================================
    function nova_tela(iL, iA) { const c = document.createElement("canvas"); c.width = iL; c.height = iA; return c; }
    function casas(fPasso) { const s = String(fPasso); return s.indexOf(".") < 0 ? 0 : s.length - s.indexOf(".") - 1; }
    // Números no padrão brasileiro (vírgula decimal)
    function num(fV, iCasas) { return Number(fV).toLocaleString("pt-BR", { minimumFractionDigits: iCasas, maximumFractionDigits: iCasas }); }
    function formatar(fV, fPasso) { return num(fV, casas(fPasso)); }

    // Desenha uma imagem Float32 (0..255) num canvas do mesmo tamanho.
    function desenhar(oTela, mImg, iL, iA) {
        if (oTela.width !== iL || oTela.height !== iA) { oTela.width = iL; oTela.height = iA; }
        const oCtx = oTela.getContext("2d"), oDados = oCtx.createImageData(iL, iA);
        const aU32 = new Uint32Array(oDados.data.buffer);
        for (let i = 0; i < iL * iA; i++) {
            const iV = mImg[i] < 0 ? 0 : (mImg[i] > 255 ? 255 : (mImg[i] + 0.5) | 0);
            aU32[i] = 0xFF000000 | (iV << 16) | (iV << 8) | iV;
        }
        oCtx.putImageData(oDados, 0, 0);
    }

    function mostrar_aviso(sTexto) {
        const o = $("aviso");
        if (!sTexto) { o.classList.add("oculto"); return; }
        o.querySelector("span").textContent = sTexto; o.classList.remove("oculto");
    }

    // =====================================================================
    //  ABRIR IMAGEM  (PNG/JPG/... pelo navegador; PGM/PPM/TIFF pelo leitor próprio)
    // =====================================================================
    function tela_de_rgba(oImg) {
        const c = nova_tela(oImg.iL, oImg.iA);
        c.getContext("2d").putImageData(new ImageData(oImg.aRGBA, oImg.iL, oImg.iA), 0, 0);
        return c;
    }

    async function ler_arquivo(oArq) {
        const sNome = oArq.name.toLowerCase();
        if (/\.(pgm|ppm|pnm)$/.test(sNome)) return tela_de_rgba(F.ler_pnm(new Uint8Array(await oArq.arrayBuffer())));
        if (/\.tiff?$/.test(sNome)) return tela_de_rgba(F.ler_tiff(new Uint8Array(await oArq.arrayBuffer())));
        const sUrl = URL.createObjectURL(oArq);
        try {
            const oImg = new Image();
            oImg.src = sUrl;
            await oImg.decode();
            const c = nova_tela(oImg.naturalWidth, oImg.naturalHeight);
            c.getContext("2d").drawImage(oImg, 0, 0);
            return c;
        } finally { URL.revokeObjectURL(sUrl); }
    }

    async function abrir_arquivo(oArq) {
        if (!oArq) return;
        try {
            mostrar_aviso("");
            definir_fonte(await ler_arquivo(oArq), oArq.name);
            $("nome-arquivo").textContent = oArq.name; $("nome-arquivo").title = oArq.name;
        } catch (oErro) {
            const bPropria = oErro instanceof Error && !(oErro instanceof DOMException);       // mensagens dos leitores próprios já estão em português
            mostrar_aviso("Não foi possível abrir “" + oArq.name + "”: " + (bPropria ? oErro.message : "formato não reconhecido pelo navegador.") + " Use PNG, JPG, PGM, PPM ou TIFF sem compressão.");
        }
    }

    // =====================================================================
    //  IMAGEM DE TRABALHO E DEGRADAÇÃO
    // =====================================================================
    function definir_fonte(oCanvas, sNome) {
        oEstado.oFonte = oCanvas; oEstado.sNome = sNome;
        preparar_trabalho();
    }

    function preparar_trabalho() {
        const oF = oEstado.oFonte;
        if (!oF) return;
        const fEsc = Math.min(1, oEstado.iMaxLado / Math.max(oF.width, oF.height));
        const iL = Math.max(8, Math.round(oF.width * fEsc)), iA = Math.max(8, Math.round(oF.height * fEsc));
        const oTmp = nova_tela(iL, iA), oCtx = oTmp.getContext("2d");
        oCtx.imageSmoothingEnabled = true; oCtx.imageSmoothingQuality = "high";
        oCtx.fillStyle = "#fff"; oCtx.fillRect(0, 0, iL, iA);
        oCtx.drawImage(oF, 0, 0, iL, iA);
        oEstado.iL = iL; oEstado.iA = iA;
        $("vazio").classList.add("oculto"); $("visor").classList.remove("sem-imagem");
        $("salvar-saida").disabled = false; $("salvar-entrada").disabled = false;
        document.querySelectorAll("#vista button").forEach(function (b) { b.disabled = false; });
        oEstado.mLimpa = F.para_cinza(oCtx.getImageData(0, 0, iL, iA).data, iL, iA);
        oEstado.mRuido = F.campo_normal(iL * iA, 1234);
        oEstado.mUnif = F.campo_uniforme(iL * iA, 99);
        // visor
        const oV = $("visor");
        oV.style.aspectRatio = iL + " / " + iA;
        oV.style.setProperty("--prop", iL / iA);          // o CSS limita a largura pela altura disponível (estilo.css, --alt-max)
        aplicar_degradacao();
    }

    // Calcula a entrada realmente usada pelo filtro (ruído + pixels removidos) e redesenha.
    function aplicar_degradacao() {
        if (!oEstado.mLimpa) return;
        const iL = oEstado.iL, iA = oEstado.iA;
        oEstado.mRuidosa = oUI.d.ruido > 0 ? F.degradar(oEstado.mLimpa, oEstado.mRuido, oUI.d.ruido) : oEstado.mLimpa;
        oEstado.mMeia = null;
        oEstado.iVersao++;
        let mExibir = oEstado.mRuidosa;
        if (oEstado.sAba === "weickert" && oUI.d.remover > 0) {
            oEstado.mMascara = F.criar_mascara(oEstado.mUnif, oUI.d.remover / 100);
            mExibir = Float32Array.from(oEstado.mRuidosa);
            for (let i = 0; i < mExibir.length; i++) if (!oEstado.mMascara[i]) mExibir[i] = 0;     // buracos pretos
        } else oEstado.mMascara = null;
        oEstado.mExibida = mExibir;
        desenhar($("tela-entrada"), mExibir, iL, iA);
        disparar_filtro();
    }

    function disparar_filtro() {
        if (oEstado.sAba === "gabor") { agendar_gabor(); }
        else { reiniciar_difusao(); }
    }

    // =====================================================================
    //  CONSTRUÇÃO DOS CONTROLES
    // =====================================================================
    const aRefs = [];       // {esp, el(wrapper), grupo}
    let iSeq = 0;
    const sId = function (sPre) { iSeq++; return sPre + iSeq; };

    // Campo com slider: rótulo ligado ao controle, valor ao lado e dica curta embaixo.
    function criar_controle(oEsp, oGrupo, oPai, fAoMudar) {
        const sIdIn = sId("c");
        const oDiv = document.createElement("div");
        oDiv.className = "ctl";
        oDiv.innerHTML =
            '<div class="linha"><label for="' + sIdIn + '"><span class="simb">' + oEsp.simb + "</span> " + oEsp.nome + '</label><output for="' + sIdIn + '"></output></div>' +
            '<input id="' + sIdIn + '" type="range" min="' + oEsp.min + '" max="' + oEsp.max + '" step="' + oEsp.passo + '">' +
            '<p class="dica">' + oEsp.dica + "</p>";
        const oIn = oDiv.querySelector("input"), oOut = oDiv.querySelector("output");
        function atualizar() {
            const sTxt = formatar(oGrupo[oEsp.k], oEsp.passo) + oEsp.un;
            oOut.textContent = sTxt; oIn.value = oGrupo[oEsp.k]; oIn.setAttribute("aria-valuetext", sTxt);
            oIn.style.setProperty("--p", (100 * (oGrupo[oEsp.k] - oEsp.min) / (oEsp.max - oEsp.min)) + "%");
        }
        oIn.addEventListener("input", function () { oGrupo[oEsp.k] = parseFloat(oIn.value); atualizar(); fAoMudar(oEsp.k); });
        oPai.appendChild(oDiv);
        const oRef = { esp: oEsp, el: oDiv, atualizar: atualizar };
        atualizar();
        aRefs.push(oRef);
        return oRef;
    }

    function criar_select(sRotulo, aOpcoes, oGrupo, sChave, oPai, fAoMudar, sDica) {
        const sIdSel = sId("s");
        const oDiv = document.createElement("div");
        oDiv.className = "ctl";
        oDiv.innerHTML = '<div class="linha"><label for="' + sIdSel + '">' + sRotulo + '</label></div><select id="' + sIdSel + '"></select>' + (sDica ? '<p class="dica">' + sDica + "</p>" : "");
        const oSel = oDiv.querySelector("select");
        aOpcoes.forEach(function (a) { const o = document.createElement("option"); o.value = a[0]; o.textContent = a[1]; oSel.appendChild(o); });
        oSel.value = oGrupo[sChave];
        oSel.addEventListener("change", function () { oGrupo[sChave] = oSel.value; fAoMudar(sChave); });
        oPai.appendChild(oDiv);
        return { el: oDiv, sel: oSel };
    }

    // Escolha entre poucas opções (radio): setas do teclado trocam a opção; a dica muda junto.
    function criar_segmentado(sRotulo, aOpcoes, oGrupo, sChave, oPai, fAoMudar, oDicas) {
        const sIdRot = sId("r");
        const oDiv = document.createElement("div");
        oDiv.className = "ctl";
        oDiv.innerHTML = '<div class="linha"><label id="' + sIdRot + '">' + sRotulo + '</label></div><div class="seg" role="radiogroup" aria-labelledby="' + sIdRot + '"></div><p class="dica"></p>';
        const oSeg = oDiv.querySelector(".seg"), oDica = oDiv.querySelector(".dica");
        const aValores = aOpcoes.map(function (a) { return a[0]; });
        function definir(sV) {
            oGrupo[sChave] = sV;
            oSeg.querySelectorAll("button").forEach(function (b) { const bSel = b.dataset.valor === sV; b.setAttribute("aria-checked", bSel ? "true" : "false"); b.tabIndex = bSel ? 0 : -1; });
            oDica.textContent = (oDicas && oDicas[sV]) || "";
        }
        aOpcoes.forEach(function (a) {
            const b = document.createElement("button");
            b.type = "button"; b.setAttribute("role", "radio"); b.dataset.valor = a[0]; b.textContent = a[1]; if (a[2]) b.title = a[2];
            b.addEventListener("click", function () { definir(a[0]); fAoMudar(sChave); });     // clicar de novo também restaura a predefinição
            oSeg.appendChild(b);
        });
        oSeg.addEventListener("keydown", function (oEv) {
            let i = aValores.indexOf(oGrupo[sChave]);
            if (oEv.key === "ArrowRight" || oEv.key === "ArrowDown") i = (i + 1) % aValores.length;
            else if (oEv.key === "ArrowLeft" || oEv.key === "ArrowUp") i = (i - 1 + aValores.length) % aValores.length;
            else return;
            oEv.preventDefault(); definir(aValores[i]); fAoMudar(sChave);
            oSeg.querySelector('[data-valor="' + aValores[i] + '"]').focus();
        });
        definir(oGrupo[sChave]);
        oPai.appendChild(oDiv);
        return { el: oDiv, definir: definir };
    }

    let oSelModelo, oSelDif, oSelModo, oChkDC, oRefsG = {}, oRefsW = {}, oRefsD = {};

    function titulo(sTexto, oPai) { const h = document.createElement("h2"); h.textContent = sTexto; oPai.appendChild(h); }
    function botao_leve(sHtml, fClique) {
        const b = document.createElement("button"); b.type = "button"; b.className = "btn leve pequeno"; b.innerHTML = sHtml;
        b.addEventListener("click", fClique); return b;
    }

    const oDicasModo = {
        resposta: "Claro de um lado da borda e escuro do outro.",
        magnitude: "Só a força da borda, sem sinal.",
        realce: "Soma a resposta à imagem original (I + k · r)."
    };
    const oDicasModelo = {
        pm: "Difusão escalar, a equação do artigo: freia onde o gradiente é grande.",
        eed: "Segue as bordas e preserva os contornos.",
        ced: "Segue listras e fecha falhas em cristas."
    };

    function construir_controles() {
        // --- degradação (compartilhada)
        const oDeg = $("ctl-degradacao");
        aEspDeg.forEach(function (e) { oRefsD[e.k] = criar_controle(e, oUI.d, oDeg, function () { aplicar_degradacao(); atualizar_sub(); }); });

        // --- Gabor
        const oG = $("ctl-gabor");
        titulo("Parâmetros do Gabor", oG);
        oSelModo = criar_segmentado("Saída exibida", [["resposta", "Resposta", oNomesModo.resposta], ["magnitude", "Magnitude", oNomesModo.magnitude], ["realce", "Realce", oNomesModo.realce]],
            oUI.g, "modo", oG, function () { aplicar_predefinicao_g(); }, oDicasModo);
        aEspGabor.forEach(function (e) { oRefsG[e.k] = criar_controle(e, oUI.g, oG, function () { agendar_gabor(); atualizar_aux(); atualizar_sub(); }); });
        const oBt = document.createElement("div"); oBt.className = "botoes";
        [["Fase 0°: linhas", 0], ["Fase 90°: bordas", 90]].forEach(function (a) {
            oBt.appendChild(botao_leve(a[0], function () { oUI.g.psi = a[1]; oRefsG.psi.atualizar(); agendar_gabor(); atualizar_aux(); atualizar_sub(); }));
        });
        oG.appendChild(oBt);
        const oDC = document.createElement("div"); oDC.className = "ctl interruptor";
        oDC.innerHTML = '<label><input type="checkbox" role="switch" checked><span class="txt"><span>Zerar a média do núcleo</span><span class="dica">Regiões planas respondem 0.</span></span></label>';
        oChkDC = oDC.querySelector("input");
        oChkDC.addEventListener("change", function () { oUI.g.dc = oChkDC.checked; agendar_gabor(); atualizar_aux(); });
        oG.appendChild(oDC);

        // --- Weickert
        const oW = $("ctl-weickert");
        titulo("Parâmetros do Weickert", oW);
        oSelModelo = criar_segmentado("Modelo", [["pm", "Perona–Malik"], ["eed", "EED"], ["ced", "CED"]],
            oUI.w, "modelo", oW, function () { aplicar_predefinicao_w(); }, oDicasModelo);
        oSelDif = criar_select("Difusividade g(s²)", [["weickert", "Weickert: 1 − exp(−3,31488/(s/λ)⁸)"], ["pm1", "Perona–Malik 1: 1/(1+(s/λ)²)"], ["pm2", "Perona–Malik 2: exp(−(s/λ)²)"]],
            oUI.w, "dif", oW, function () { atualizar_visibilidade(); reiniciar_difusao(); atualizar_aux(); atualizar_sub(); });
        aEspWeickert.forEach(function (e) {
            oRefsW[e.k] = criar_controle(e, oUI.w, oW, function (sK) {
                atualizar_aux(); atualizar_sub();
                if (sK === "iter") continuar_difusao(); else reiniciar_difusao();
            });
        });
        const oBt2 = document.createElement("div"); oBt2.className = "botoes";
        const oBtPausa = botao_leve(ic("pause") + "Pausar", function () {
            oW_.bPausado = !oW_.bPausado;
            oBtPausa.innerHTML = oW_.bPausado ? ic("play") + "Continuar" : ic("pause") + "Pausar";
            if (!oW_.bPausado) agendar_quadro();
        });
        oBtPausa.id = "btn-pausa";
        oBt2.appendChild(oBtPausa);
        oBt2.appendChild(botao_leve(ic("arrow-counter-clockwise") + "Reiniciar", function () { reiniciar_difusao(); }));
        oW.appendChild(oBt2);

        atualizar_visibilidade();
    }

    function atualizar_visibilidade() {
        const bW = oEstado.sAba === "weickert";
        $("ctl-gabor").classList.toggle("oculto", bW);
        $("ctl-weickert").classList.toggle("oculto", !bW);
        oRefsD.remover.el.classList.toggle("oculto", !bW);
        oRefsG.ganho.el.classList.toggle("oculto", oUI.g.modo !== "realce");
        const sM = oUI.w.modelo;
        aEspWeickert.forEach(function (e) { if (e.mod) oRefsW[e.k].el.classList.toggle("oculto", e.mod.indexOf(sM) < 0); });
        oSelDif.el.classList.toggle("oculto", sM === "ced");
    }

    function aplicar_predefinicao_g() {
        Object.keys(oPredefG).forEach(function (k) { oUI.g[k] = oPredefG[k]; });
        Object.keys(oRefsG).forEach(function (k) { oRefsG[k].atualizar(); });
        oChkDC.checked = oUI.g.dc;
        const bMudouDeg = oUI.d.ruido !== 0 || oUI.d.remover !== 0;      // os slides mostram o Gabor na imagem limpa
        oUI.d.ruido = 0; oUI.d.remover = 0;
        Object.keys(oRefsD).forEach(function (k) { oRefsD[k].atualizar(); });
        atualizar_visibilidade(); atualizar_aux(); atualizar_sub();
        if (bMudouDeg) aplicar_degradacao(); else agendar_gabor();
    }

    function aplicar_predefinicao_w() {
        const o = oPredefW[oUI.w.modelo];
        Object.keys(o).forEach(function (k) { oUI.w[k] = o[k]; });
        oSelDif.sel.value = oUI.w.dif;
        Object.keys(oRefsW).forEach(function (k) { oRefsW[k].atualizar(); });
        Object.keys(oPredefDegW).forEach(function (k) { oUI.d[k] = oPredefDegW[k]; });      // imagem com ruído 25, como nos slides
        Object.keys(oRefsD).forEach(function (k) { oRefsD[k].atualizar(); });
        oEstado.bAvisouRuido = true;
        atualizar_visibilidade(); atualizar_aux(); atualizar_sub();
        if (oEstado.mLimpa) aplicar_degradacao(); else reiniciar_difusao();
    }

    // =====================================================================
    //  GABOR (recalcula na hora; durante o arrasto usa prévia em meia resolução)
    // =====================================================================
    let iTimerG = 0, bRafG = false, sChaveFinal = "";

    function params_gabor() {
        const u = oUI.g;
        return { fLambda: u.lambda, fTheta: u.theta * Math.PI / 180, fSigma: u.sigma, fGama: u.gama, fPsi: u.psi * Math.PI / 180, bSemDC: u.dc };
    }

    function agendar_gabor() {
        if (!bRafG) { bRafG = true; requestAnimationFrame(function () { bRafG = false; render_gabor(false); }); }
        clearTimeout(iTimerG);
        iTimerG = setTimeout(function () { render_gabor(true); }, 180);
    }

    function meia_resolucao() {
        if (oEstado.mMeia) return oEstado.mMeia;
        const iL = oEstado.iL, iA = oEstado.iA, iL2 = iL >> 1, iA2 = iA >> 1, m = oEstado.mRuidosa, m2 = new Float32Array(iL2 * iA2);
        for (let y = 0; y < iA2; y++) for (let x = 0; x < iL2; x++) {
            const i = 2 * y * iL + 2 * x;
            m2[y * iL2 + x] = 0.25 * (m[i] + m[i + 1] + m[i + iL] + m[i + iL + 1]);
        }
        return (oEstado.mMeia = { m: m2, iL: iL2, iA: iA2 });
    }

    function render_gabor(bFinal) {
        if (oEstado.sAba !== "gabor" || !oEstado.mRuidosa) return;
        const u = oUI.g, oP = params_gabor();
        const sChave = JSON.stringify([u, oEstado.iVersao]);
        if (sChave === sChaveFinal) return;          // o resultado final destes parâmetros já está na tela
        const iL = oEstado.iL, iA = oEstado.iA, iN = Math.round(u.n);
        const iRaio = Math.min(F.iRAIO_GABOR_MAX, Math.ceil(3 * u.sigma * Math.max(1, 1 / u.gama)));
        const fCusto = iL * iA * Math.pow(2 * iRaio + 1, 2) * 0.6 * iN;
        const bPrevia = !bFinal && fCusto > 3e7;
        const t0 = performance.now();
        let oRes, iLs = iL, iAs = iA;
        if (bPrevia) {
            const oM = meia_resolucao();
            oRes = F.filtro_gabor(oM.m, oM.iL, oM.iA, Object.assign({}, oP, { fLambda: Math.max(1.5, oP.fLambda / 2), fSigma: Math.max(0.5, oP.fSigma / 2) }), u.modo, iN, u.ganho);
            iLs = oM.iL; iAs = oM.iA;
        } else {
            oRes = F.filtro_gabor(oEstado.mRuidosa, iL, iA, oP, u.modo, iN, u.ganho);
        }
        const fMs = performance.now() - t0;
        const oTela = $("tela-saida");
        if (oTela.width !== iL || oTela.height !== iA) { oTela.width = iL; oTela.height = iA; }
        if (bPrevia) {
            const oPeq = nova_tela(iLs, iAs); desenhar(oPeq, oRes.mSaida, iLs, iAs);
            const oCtx = oTela.getContext("2d"); oCtx.imageSmoothingEnabled = true; oCtx.drawImage(oPeq, 0, 0, iL, iA);
        } else {
            desenhar(oTela, oRes.mSaida, iL, iA);
            sChaveFinal = sChave;
        }
        $("rotulo-saida").textContent = "Gabor — " + oNomesModo[u.modo].split("(")[0].split("√")[0].trim();
        $("barra").classList.add("oculto");
        mostrar_estado([
            ["resolução", iL + "×" + iA + (bPrevia ? " (prévia ½)" : "")],
            ["núcleo", (2 * oRes.iRaio + 1) + "×" + (2 * oRes.iRaio + 1) + " px" + (oRes.iRaio >= F.iRAIO_GABOR_MAX ? " (limitado)" : "")],
            ["orientações", String(iN)],
            ["tempo", fMs.toFixed(0) + " ms"],
            bPrevia ? ["", "refinando…"] : null
        ]);
    }

    // =====================================================================
    //  WEICKERT (evolução progressiva: cada quadro avança várias iterações)
    // =====================================================================
    const oW_ = { oE: null, bPausado: false, bAgendado: false, fMs: 0, fUltimoDesenho: 0 };

    // Agendador sem vsync: cede a vez ao navegador (eventos dos sliders) e volta logo em seguida.
    const oCanal = new MessageChannel();
    let fnCanal = null;
    oCanal.port1.onmessage = function () { const f = fnCanal; fnCanal = null; if (f) f(); };
    function cedir_e_voltar(fn) { fnCanal = fn; oCanal.port2.postMessage(0); }

    function params_weickert() {
        const u = oUI.w;
        return { sModelo: u.modelo, sDifusividade: u.dif, fLambda: u.lambda, fSigma: u.sigma, fRho: u.rho, fAlfa: u.alfa, fC: u.c, fTau: u.tau };
    }

    function reiniciar_difusao() {
        if (oEstado.sAba !== "weickert" || !oEstado.mRuidosa) return;
        if (oW_.oE && oW_.oE.iL === oEstado.iL && oW_.oE.iA === oEstado.iA) F.repor_estado(oW_.oE, oEstado.mRuidosa, oEstado.mMascara);
        else oW_.oE = F.criar_estado(oEstado.mRuidosa, oEstado.iL, oEstado.iA, oEstado.mMascara);
        oW_.fMs = 0;
        agendar_quadro();
    }

    function continuar_difusao() {
        if (oEstado.sAba !== "weickert" || !oW_.oE) return;
        if (oUI.w.iter < oW_.oE.iIter) reiniciar_difusao(); else agendar_quadro();
    }

    function agendar_quadro() {
        if (!oW_.bAgendado) { oW_.bAgendado = true; cedir_e_voltar(quadro_difusao); }
    }

    function quadro_difusao() {
        oW_.bAgendado = false;
        const oE = oW_.oE;
        if (oEstado.sAba !== "weickert" || !oE) return;
        const oP = params_weickert(), iAlvo = Math.round(oUI.w.iter);
        if (!oW_.bPausado && oE.iIter < iAlvo) {
            const t0 = performance.now();
            do { F.passo_difusao(oE, oP); } while (oE.iIter < iAlvo && performance.now() - t0 < 16);
            oW_.fMs += performance.now() - t0;
        }
        const bFim = oE.iIter >= iAlvo || oW_.bPausado;
        if (!bFim && performance.now() - oW_.fUltimoDesenho < 33) { agendar_quadro(); return; }   // não redesenha mais que ~30×/s
        oW_.fUltimoDesenho = performance.now();
        desenhar($("tela-saida"), oE.mU, oE.iL, oE.iA);
        $("rotulo-saida").textContent = "Weickert — " + { pm: "Perona–Malik", eed: "EED", ced: "CED" }[oUI.w.modelo];
        const bDeg = oUI.d.ruido > 0 || oUI.d.remover > 0;
        const aEst = [
            ["resolução", oE.iL + "×" + oE.iA],
            ["iteração", oE.iIter + " / " + iAlvo],
            ["t = n·τ", num(oE.iIter * oUI.w.tau, 1)],
            ["tempo", oE.iIter ? (oW_.fMs / oE.iIter).toFixed(0) + " ms/it" : "—"]
        ];
        if (bDeg) aEst.push(["PSNR", num(F.psnr(oEstado.mLimpa, oEstado.mExibida), 1) + " → " + num(F.psnr(oEstado.mLimpa, oE.mU), 1) + NBSP + "dB"]);
        mostrar_estado(aEst);
        const oBarra = $("barra"); oBarra.classList.remove("oculto"); oBarra.firstElementChild.style.transform = "scaleX(" + (oE.iIter / iAlvo) + ")";
        oBarra.classList.toggle("pronta", oE.iIter >= iAlvo);
        desenhar_tensores(oE);
        if (!oW_.bPausado && oE.iIter < iAlvo) agendar_quadro();
    }

    function mostrar_estado(aItens) {
        $("estado").innerHTML = aItens.filter(Boolean).map(function (a) { return a[0] ? '<span class="chip">' + a[0] + " <b>" + a[1] + "</b></span>" : '<span class="chip ocupado">' + a[1] + "</span>"; }).join("");
    }

    // =====================================================================
    //  PAINÉIS AUXILIARES: núcleo de Gabor / mapa de tensores / curvas
    // =====================================================================
    function atualizar_aux() {
        if (oEstado.sAba === "gabor") desenhar_nucleo();
        desenhar_curva();
        $("aux-titulo").textContent = oEstado.sAba === "gabor" ? "Núcleo g(x, y)" : "Direções de difusão";
        $("aux-legenda").textContent = oEstado.sAba === "gabor"
            ? "Cinza = 0; claro = positivo; escuro = negativo. As listras são perpendiculares a θ."
            : "Cada traço aponta a direção em que o tensor D mais difunde (ao longo das estruturas). Pontos = difusão igual em todas as direções.";
    }

    function desenhar_nucleo() {
        const oK = F.nucleo_gabor(params_gabor()), iT = oK.iT;
        let fMax = 0; for (let i = 0; i < oK.aK.length; i++) fMax = Math.max(fMax, Math.abs(oK.aK[i]));
        const oPeq = nova_tela(iT, iT), oCtx = oPeq.getContext("2d"), oD = oCtx.createImageData(iT, iT);
        for (let i = 0; i < iT * iT; i++) {
            const fV = 128 + 127 * oK.aK[i] / (fMax || 1);
            oD.data[4 * i] = oD.data[4 * i + 1] = oD.data[4 * i + 2] = fV; oD.data[4 * i + 3] = 255;
        }
        oCtx.putImageData(oD, 0, 0);
        const oAux = $("tela-aux");
        oAux.width = 190; oAux.height = 190;
        const oC2 = oAux.getContext("2d");
        oC2.imageSmoothingEnabled = false; oC2.fillStyle = "#808080"; oC2.fillRect(0, 0, 190, 190);
        oC2.drawImage(oPeq, 0, 0, 190, 190);
        $("aux-legenda").textContent = "Cinza = 0; claro = positivo; escuro = negativo. Tamanho " + iT + "×" + iT + " px. As listras são perpendiculares a θ.";
    }

    function desenhar_tensores(oE) {
        const oAux = $("tela-aux");
        if (oAux.width !== 190) { oAux.width = 190; oAux.height = 190; }
        const oCtx = oAux.getContext("2d"), iT = 190;
        oCtx.imageSmoothingEnabled = true;
        oCtx.fillStyle = oCor.mapa; oCtx.fillRect(0, 0, iT, iT);
        const oTmp = nova_tela(oE.iL, oE.iA); desenhar(oTmp, oEstado.mRuidosa, oE.iL, oE.iA);
        oCtx.globalAlpha = 0.5; oCtx.drawImage(oTmp, 0, 0, iT, iT); oCtx.globalAlpha = 1;
        const iG = 14, fPaso = iT / iG;
        oCtx.lineCap = "round";
        for (let gy = 0; gy < iG; gy++) for (let gx = 0; gx < iG; gx++) {
            const x = Math.min(oE.iL - 1, Math.floor((gx + 0.5) * oE.iL / iG)), y = Math.min(oE.iA - 1, Math.floor((gy + 0.5) * oE.iA / iG)), i = y * oE.iL + x;
            const a = oE.mA[i], b = oE.mB[i], c = oE.mC[i];
            const aL = F.autovalores(a, b, c), fAni = (aL[0] - aL[1]) / (aL[0] + aL[1] + 1e-9);
            const fAng = 0.5 * Math.atan2(2 * b, a - c);            // direção do autovetor de maior autovalor
            const cx = (gx + 0.5) * fPaso, cy = (gy + 0.5) * fPaso, fL = fPaso * 0.46 * fAni;
            if (fAni < 0.05) { oCtx.fillStyle = "rgba(242,238,232,.35)"; oCtx.beginPath(); oCtx.arc(cx, cy, 1.8, 0, 6.2832); oCtx.fill(); continue; }
            oCtx.strokeStyle = "rgba(233,143,71," + (0.35 + 0.65 * fAni) + ")"; oCtx.lineWidth = 2;
            oCtx.beginPath(); oCtx.moveTo(cx - fL * Math.cos(fAng), cy - fL * Math.sin(fAng)); oCtx.lineTo(cx + fL * Math.cos(fAng), cy + fL * Math.sin(fAng)); oCtx.stroke();
        }
    }

    function desenhar_curva() {
        // O gráfico acompanha o tamanho real na tela (nítido em telas de alta densidade). O desenho abaixo foi
        // projetado em 660 px de largura; a escala S reduz tudo junto (fonte, margens, espessuras) para caber na faixa baixa.
        const oT = $("tela-curva"), S = 0.62, dpr = window.devicePixelRatio || 1;
        const iCssW = oT.clientWidth || 640, iCssH = oT.clientHeight || 160;
        if (oT.width !== Math.round(iCssW * dpr) || oT.height !== Math.round(iCssH * dpr)) { oT.width = Math.round(iCssW * dpr); oT.height = Math.round(iCssH * dpr); }
        const g = oT.getContext("2d"); g.setTransform(dpr * S, 0, 0, dpr * S, 0, 0);
        const iW = iCssW / S, iH = iCssH / S;
        g.clearRect(0, 0, iW, iH); g.fillStyle = oCor.fundo; g.fillRect(0, 0, iW, iH);
        const iE = 52, iD = 20, iC = 18, iB = 46, pw = iW - iE - iD, ph = iH - iC - iB;
        g.font = "20px " + sFonteGrafico; g.lineWidth = 1;
        function X(f, fMax) { return iE + pw * f / fMax; }
        function Y(f, fMin, fMax) { return iC + ph * (1 - (f - fMin) / (fMax - fMin)); }
        function eixos(fXmax, sX, fYmin, fYmax) {
            g.strokeStyle = oCor.grade; g.fillStyle = oCor.texto2; g.textAlign = "center";
            for (let i = 0; i <= 4; i++) { const x = iE + pw * i / 4; g.beginPath(); g.moveTo(x, iC); g.lineTo(x, iC + ph); g.stroke(); g.fillText(Number((fXmax * i / 4).toFixed(1)), x, iC + ph + 22); }
            g.textAlign = "right";
            for (let i = 0; i <= 4; i++) { const y = iC + ph * i / 4; g.beginPath(); g.moveTo(iE, y); g.lineTo(iE + pw, y); g.stroke(); g.fillText((fYmax - (fYmax - fYmin) * i / 4).toFixed(2).replace(/\.?0+$/, ""), iE - 6, y + 6); }
            g.textAlign = "center"; g.fillText(sX, iE + pw / 2, iH - 6);
        }
        function linha(fn, fXmax, fYmin, fYmax, sCor, iEsp, bTrac) {
            g.strokeStyle = sCor; g.lineWidth = iEsp; g.setLineDash(bTrac ? [8, 6] : []); g.beginPath();
            for (let i = 0; i <= 240; i++) { const f = fXmax * i / 240, x = X(f, fXmax), y = Y(fn(f), fYmin, fYmax); if (i === 0) g.moveTo(x, y); else g.lineTo(x, y); }
            g.stroke(); g.setLineDash([]); g.lineWidth = 1;
        }
        // Legenda no canto livre do gráfico: à esquerda ou, com bDireita, encostada na borda direita.
        function legenda(a, bDireita) {
            g.textAlign = "left";
            let fLarg = 0; a.forEach(function (it) { fLarg = Math.max(fLarg, g.measureText(it[1]).width); });
            const fX0 = bDireita ? iE + pw - fLarg - 42 : iE + 12;
            g.fillStyle = oCor.fundo; g.globalAlpha = 0.85; g.fillRect(fX0 - 8, iC + 4, fLarg + 58, 26 * a.length + 6); g.globalAlpha = 1;
            a.forEach(function (it, i) { g.fillStyle = it[0]; g.fillRect(fX0, iC + 14 + 26 * i, 22, 5); g.fillStyle = oCor.texto; g.fillText(it[1], fX0 + 30, iC + 22 + 26 * i); });
        }

        if (oEstado.sAba === "gabor") {
            const u = oUI.g, fR = Math.ceil(3 * u.sigma), fPsi = u.psi * Math.PI / 180;
            $("curva-titulo").textContent = "Perfil do núcleo ao longo de x′";
            const fXm = fR;
            // eixo x centrado em 0: reaproveita eixos() com deslocamento
            g.strokeStyle = oCor.grade; g.fillStyle = oCor.texto2; g.textAlign = "center";
            for (let i = 0; i <= 4; i++) { const x = iE + pw * i / 4; g.beginPath(); g.moveTo(x, iC); g.lineTo(x, iC + ph); g.stroke(); g.fillText(Number((-fXm + 2 * fXm * i / 4).toFixed(1)), x, iC + ph + 22); }
            for (let i = 0; i <= 4; i++) { const y = iC + ph * i / 4; g.beginPath(); g.moveTo(iE, y); g.lineTo(iE + pw, y); g.stroke(); g.textAlign = "right"; g.fillText((1 - 0.5 * i).toFixed(1), iE - 6, y + 6); g.textAlign = "center"; }
            g.fillText("x′ (px)", iE + pw / 2, iH - 6);
            function PX(f) { return iE + pw * (f + fXm) / (2 * fXm); }
            function PY(f) { return iC + ph * (1 - (f + 1) / 2); }
            [1, -1].forEach(function (s) { g.strokeStyle = oCor.env; g.setLineDash([7, 5]); g.beginPath(); for (let i = 0; i <= 200; i++) { const f = -fXm + 2 * fXm * i / 200; const x = PX(f), y = PY(s * Math.exp(-f * f / (2 * u.sigma * u.sigma))); if (i === 0) g.moveTo(x, y); else g.lineTo(x, y); } g.stroke(); g.setLineDash([]); });
            g.strokeStyle = oCor.laranja; g.lineWidth = 3; g.beginPath();
            for (let i = 0; i <= 300; i++) { const f = -fXm + 2 * fXm * i / 300, x = PX(f), y = PY(Math.exp(-f * f / (2 * u.sigma * u.sigma)) * Math.cos(2 * Math.PI * f / u.lambda + fPsi)); if (i === 0) g.moveTo(x, y); else g.lineTo(x, y); }
            g.stroke(); g.lineWidth = 1;
            legenda([[oCor.laranja, "núcleo g"], [oCor.env, "janela gaussiana"]]);
            $("curva-legenda").textContent = "λ = " + u.lambda + " px define a distância entre picos; σ = " + u.sigma.toFixed(1) + " px, quantos ciclos cabem na janela (≈ " + (2 * 2 * u.sigma / u.lambda).toFixed(1) + " ciclos em ±2σ).";
            return;
        }
        const u = oUI.w;
        if (u.modelo === "ced") {
            $("curva-titulo").textContent = "Autovalores do tensor (CED)";
            const fXm = 4 * u.c, fYm = 1;
            eixos(fXm, "s = |∇u| (níveis de cinza / pixel)", 0, fYm);
            linha(function () { return u.alfa; }, fXm, 0, fYm, oCor.claro, 3, false);
            linha(function (s) { return u.alfa + (1 - u.alfa) * Math.exp(-Math.pow(u.c / Math.max(s, 1e-9), 4)); }, fXm, 0, fYm, oCor.laranja, 3, false);
            g.strokeStyle = oCor.guia; g.setLineDash([4, 5]); g.beginPath(); g.moveTo(X(u.c, fXm), iC); g.lineTo(X(u.c, fXm), iC + ph); g.stroke(); g.setLineDash([]);
            legenda([[oCor.laranja, "λ₂ (ao longo da estrutura)"], [oCor.claro, "λ₁ = α (através)"]]);
            $("curva-legenda").textContent = "Onde o gradiente é coerente e maior que c = " + u.c + ", λ₂ → 1 e a imagem difunde ao longo das cristas; fora disso, difusão ≈ α.";
        } else {
            $("curva-titulo").textContent = "Difusividade g(s) e fluxo s·g(s)";
            const fXm = 4 * u.lambda, sDif = u.dif;
            eixos(fXm, "s = |∇u_σ| (níveis de cinza / pixel)", 0, 1);
            const aFl = []; let fFmax = 1e-9;
            for (let i = 0; i <= 240; i++) { const s = fXm * i / 240; aFl.push(s * F.difusividade(sDif, (s / u.lambda) * (s / u.lambda))); fFmax = Math.max(fFmax, aFl[i]); }
            linha(function (s) { return F.difusividade(sDif, (s / u.lambda) * (s / u.lambda)); }, fXm, 0, 1, oCor.laranja, 3, false);
            linha(function (s) { return s * F.difusividade(sDif, (s / u.lambda) * (s / u.lambda)) / fFmax; }, fXm, 0, 1, oCor.claro, 2.5, true);
            g.strokeStyle = oCor.guia; g.setLineDash([4, 5]); g.beginPath(); g.moveTo(X(u.lambda, fXm), iC); g.lineTo(X(u.lambda, fXm), iC + ph); g.stroke(); g.setLineDash([]);
            legenda([[oCor.laranja, "g(s²): permeabilidade"], [oCor.claro, "fluxo s·g (normalizado)"]], true);
            $("curva-legenda").textContent = "Linha tracejada vertical: λ = " + u.lambda + ". Acima de λ a difusão é bloqueada: a borda é preservada" + (sDif === "weickert" ? " (o fluxo é máximo exatamente em s = λ)." : ".");
        }
    }

    // =====================================================================
    //  ABAS INFERIORES: fundamentação, código em execução, parâmetros
    // =====================================================================
    let sSub = "teoria";

    function html_teoria() {
        if (oEstado.sAba === "gabor") {
            return "<h4>Dennis Gabor e o filtro</h4>" +
                "<p>O filtro de Gabor é uma <b>onda senoidal</b> (define frequência e orientação) multiplicada por um <b>envelope gaussiano</b> (limita a resposta a uma região local). É um filtro linear: a saída é a convolução r = I ∗ g.</p>" +
                '<div class="eq"><i>g</i>(<i>x</i>, <i>y</i>) = exp( − (<i>x′</i>² + <i>γ</i>²<i>y′</i>²) / (2<i>σ</i>²) ) · cos( 2π <i>x′</i> / <i>λ</i> + <i>ψ</i> )</div>' +
                '<div class="eq"><i>x′</i> = <i>x</i> cos <i>θ</i> + <i>y</i> sen <i>θ</i> &nbsp;&nbsp;&nbsp; <i>y′</i> = −<i>x</i> sen <i>θ</i> + <i>y</i> cos <i>θ</i></div>' +
                "<h4>Como usar para detectar bordas</h4>" +
                "<p><b>Fase ψ</b>: com ψ = 90° (núcleo ímpar) a resposta tem sinal diferente em cada lado de um degrau, então o filtro vira um <b>detector de bordas</b> orientado. Com ψ = 0° (núcleo par) ele detecta <b>linhas e cristas</b>.</p>" +
                "<p><b>Orientação fixa</b>: nesta página θ = 0° e γ = 0,5, então o filtro responde a bordas <b>verticais</b> (variação ao longo de x). Bordas horizontais quase não aparecem.</p>" +
                "<p><b>Nesta implementação</b>: o núcleo tem soma zero (regiões planas dão resposta 0) e é normalizado por L1 (soma dos módulos = 1), então a resposta fica em níveis de cinza. A exibição usa o percentil 99,5 como fundo de escala.</p>";
        }
        return "<h4>Joachim Weickert e a difusão anisotrópica</h4>" +
            "<p>A imagem evolui no tempo como um processo de difusão (calor), mas a velocidade de difusão depende do conteúdo local. O artigo apresenta a forma escalar (Perona–Malik); Weickert a generaliza trocando o coeficiente por um <b>tensor de difusão</b> D (matriz 2×2) que pode difundir mais numa direção do que em outra:</p>" +
            '<div class="eq">∂<sub><i>t</i></sub><i>u</i> = div( <i>D</i> · ∇<i>u</i> ) &nbsp;&nbsp;&nbsp;→&nbsp;&nbsp; <i>u</i><sup><i>k</i>+1</sup> = <i>u</i><sup><i>k</i></sup> + <i>τ</i> · div( <i>D</i> ∇<i>u</i><sup><i>k</i></sup> )</div>' +
            "<h4>Os três modelos</h4>" +
            '<div class="eq"><b>PM</b> (escalar): <i>D</i> = <i>g</i>(|∇<i>u<sub>σ</sub></i>|²) · <i>I</i></div>' +
            '<div class="eq"><b>EED</b>: autovetores <i>v</i><sub>1</sub> ∥ ∇<i>u<sub>σ</sub></i> e <i>v</i><sub>2</sub> ⊥ ∇<i>u<sub>σ</sub></i>; &nbsp;<i>λ</i><sub>1</sub> = <i>g</i>(|∇<i>u<sub>σ</sub></i>|²), &nbsp;<i>λ</i><sub>2</sub> = 1</div>' +
            '<div class="eq"><b>CED</b>: <i>J<sub>ρ</sub></i> = <i>G<sub>ρ</sub></i> ∗ (∇<i>u<sub>σ</sub></i> ∇<i>u<sub>σ</sub></i><sup>T</sup>); &nbsp;<i>λ</i><sub>1</sub> = <i>α</i>, &nbsp;<i>λ</i><sub>2</sub> = <i>α</i> + (1 − <i>α</i>) exp( −<i>C</i> / (<i>μ</i><sub>1</sub> − <i>μ</i><sub>2</sub>)² )</div>' +
            "<p>No <b>EED</b> a difusão segue as bordas e é bloqueada através delas (preserva e realça bordas). No <b>CED</b> o tensor de estrutura mede a orientação dominante numa vizinhança (ρ) e a imagem difunde <i>ao longo</i> das estruturas, fechando falhas em cristas e linhas — o caso típico são impressões digitais.</p>" +
            '<div class="eq"><i>g</i>(<i>s</i>²) = 1 − exp( −3,31488 / (<i>s</i>/<i>λ</i>)<sup>8</sup> ) &nbsp;&nbsp; (difusividade de Weickert; fluxo máximo em <i>s</i> = <i>λ</i>)</div>' +
            "<h4>Esquema numérico desta página</h4>" +
            "<p>Euler explícito com fluxos nos pontos médios entre pixels e fluxo nulo nas bordas. O operador resultante é simétrico e semidefinido (derivada de uma energia), então conserva a média e não cria extremos novos: foi verificado em testes automáticos até τ = 0,5.</p>" +
            "<p><b>Escala</b>: λ, c e σ do ruído estão em níveis de cinza (0–255). Em C = c⁴, o valor c é o gradiente a partir do qual uma estrutura conta como coerente.</p>";
    }

    function html_params() {
        const aL = parametros_tabela();
        let s = '<p>Valores atuais dos sliders, prontos para a <b>Tabela 1</b> do artigo.</p><table class="par"><thead><tr><th>Parâmetro</th><th>Valor</th><th>Descrição</th></tr></thead><tbody>';
        aL.forEach(function (a) { s += "<tr><td>" + a.simb + "</td><td>" + a.valor + "</td><td>" + a.desc + "</td></tr>"; });
        s += '</tbody></table><div class="botoes" style="margin-top:16px"><button class="btn pequeno" id="btn-latex">' + ic("copy") + 'Copiar em LaTeX</button><button class="btn leve pequeno" id="btn-texto">' + ic("copy") + 'Copiar como texto</button><span id="copiado" class="nota" role="status" style="align-self:center;margin:0"></span></div>';
        return s;
    }

    function parametros_tabela() {
        const a = [];
        if (oEstado.sAba === "gabor") {
            const u = oUI.g;
            a.push({ simb: "λ", tex: "$\\lambda$", valor: u.lambda + " px", desc: "Comprimento de onda do filtro de Gabor" });
            a.push({ simb: "θ", tex: "$\\theta$", valor: u.theta + "°", desc: "Orientação do filtro (normal às listras), fixa" });
            a.push({ simb: "σ", tex: "$\\sigma$", valor: u.sigma.toFixed(1) + " px", desc: "Largura da janela gaussiana" });
            a.push({ simb: "γ", tex: "$\\gamma$", valor: u.gama.toFixed(2), desc: "Razão de aspecto (fixa)" });
            a.push({ simb: "ψ", tex: "$\\psi$", valor: u.psi + "°", desc: "Fase da onda senoidal" });
            a.push({ simb: "—", tex: "---", valor: oNomesModo[u.modo].replace(/√|²/g, "").split("(")[0].trim(), desc: "Saída exibida" });
            a.push({ simb: "—", tex: "---", valor: oEstado.iL ? oEstado.iL + "×" + oEstado.iA + " px" : "—", desc: "Resolução de trabalho (cinza, 0–255)" });
        } else {
            const u = oUI.w, sM = u.modelo;
            a.push({ simb: "modelo", tex: "Modelo", valor: { pm: "Perona–Malik", eed: "EED (Weickert)", ced: "CED (Weickert)" }[sM], desc: "Tipo de tensor de difusão" });
            if (sM !== "ced") {
                a.push({ simb: "g", tex: "$g(s^2)$", valor: { weickert: "Weickert (m = 4)", pm1: "PM 1/(1+(s/λ)²)", pm2: "PM exp(−(s/λ)²)" }[u.dif], desc: "Função de difusividade" });
                a.push({ simb: "λ", tex: "$\\lambda$", valor: String(u.lambda), desc: "Parâmetro de contraste (limiar de borda)" });
            }
            a.push({ simb: "σ", tex: "$\\sigma$", valor: u.sigma.toFixed(1) + " px", desc: "Escala do ruído (pré-suavização do gradiente)" });
            if (sM === "ced") {
                a.push({ simb: "ρ", tex: "$\\rho$", valor: u.rho.toFixed(1) + " px", desc: "Escala de integração do tensor de estrutura" });
                a.push({ simb: "α", tex: "$\\alpha$", valor: String(u.alfa), desc: "Difusão residual (através das estruturas)" });
                a.push({ simb: "c", tex: "$c$", valor: u.c + "  (C = c⁴ = " + Math.pow(u.c, 4) + ")", desc: "Limiar de coerência" });
            }
            a.push({ simb: "τ", tex: "$\\tau$", valor: u.tau.toFixed(2), desc: "Passo de tempo (esquema explícito)" });
            a.push({ simb: "n", tex: "$n$", valor: String(u.iter), desc: "Iterações (tempo t = n·τ = " + (u.iter * u.tau).toFixed(1) + ")" });
            if (oUI.d.ruido > 0) a.push({ simb: "η", tex: "$\\eta$", valor: String(oUI.d.ruido), desc: "Desvio padrão do ruído gaussiano adicionado" });
            if (oUI.d.remover > 0) a.push({ simb: "%", tex: "\\%", valor: oUI.d.remover + " %", desc: "Pixels removidos (restauração)" });
            a.push({ simb: "—", tex: "---", valor: oEstado.iL ? oEstado.iL + "×" + oEstado.iA + " px" : "—", desc: "Resolução de trabalho (cinza, 0–255)" });
        }
        return a;
    }

    const aFuncoesG = ["nucleo_gabor", "preencher_borda", "convolucao", "filtro_gabor"];
    const aFuncoesW = ["difusividade", "derivadas", "tensor_pm", "tensor_eed", "tensor_ced", "divergencia", "passo_difusao"];

    function realcar(sCodigo) {
        const sEsc = sCodigo.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
        return sEsc.replace(/(\/\*[\s\S]*?\*\/|\/\/[^\n]*)|("(?:[^"\\\n]|\\.)*")|\b(function|const|let|var|for|if|else|return|while|do|new|continue|break|true|false|null)\b|(\b\d+\.?\d*(?:e[+-]?\d+)?\b)|\b([A-Za-z_][A-Za-z_0-9]*)(?=\()/g,
            function (m, c, s, k, n, f) {
                if (c) return '<span class="tk-c">' + c + "</span>";
                if (s) return '<span class="tk-s">' + s + "</span>";
                if (k) return '<span class="tk-k">' + k + "</span>";
                if (n) return '<span class="tk-n">' + n + "</span>";
                return '<span class="tk-f">' + f + "</span>";
            });
    }

    function html_codigo() {
        const aNomes = oEstado.sAba === "gabor" ? aFuncoesG : aFuncoesW;
        let s = "<p>Este é o código <b>exatamente como está rodando</b> (extraído de <code>filtros.js</code> em tempo real). Funções auxiliares: <code>refletir</code>, <code>suavizar_gauss</code>" +
            (oEstado.sAba === "gabor" ? ", <code>escala_robusta</code>" : ", <code>criar_estado</code>") + ".</p>";
        aNomes.forEach(function (sN) {
            let sFn = F[sN].toString().split("\n").map(function (sL, i) { return i === 0 ? sL : sL.replace(/^ {4}/, ""); }).join("\n");
            s += '<div class="nome-fn">' + sN + "()</div><pre class=\"codigo\" translate=\"no\">" + realcar(sFn) + "</pre>";
        });
        return s;
    }

    function atualizar_sub() {
        const oC = $("sub-conteudo");
        if (sSub === "teoria") oC.innerHTML = html_teoria();
        else if (sSub === "params") {
            oC.innerHTML = html_params();
            $("btn-latex").addEventListener("click", function () { copiar(parametros_tabela().map(function (a) { return a.tex + " & " + a.valor.replace(/°/g, "$^\\circ$").replace(/⁴/g, "^4") + " & " + a.desc + " \\\\"; }).join("\n")); });
            $("btn-texto").addEventListener("click", function () { copiar(parametros_tabela().map(function (a) { return a.simb + "\t" + a.valor + "\t" + a.desc; }).join("\n")); });
        } else {
            if (oC.dataset.cod !== oEstado.sAba) { oC.innerHTML = html_codigo(); oC.dataset.cod = oEstado.sAba; }
            return;
        }
        oC.dataset.cod = "";
    }

    function copiar(sTexto) {
        const o = $("copiado");
        const fOk = function () { o.textContent = "Copiado!"; setTimeout(function () { o.textContent = ""; }, 1800); };
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(sTexto).then(fOk, function () { o.textContent = "Não foi possível copiar."; });
        else { const t = document.createElement("textarea"); t.value = sTexto; document.body.appendChild(t); t.select(); try { document.execCommand("copy"); fOk(); } catch (e) { o.textContent = "Não foi possível copiar."; } t.remove(); }
    }

    // =====================================================================
    //  COMPARAÇÃO ANTES / DEPOIS (divisor arrastável)
    // =====================================================================
    function ligar_divisor() {
        const oV = $("visor");
        let bArr = false, fCorte = 50;
        // Posição do divisor em % (0 = só resultado, 100 = só entrada); mantém as vistas e o aria em sincronia.
        function definir_corte(fP) {
            fCorte = Math.max(0, Math.min(100, fP));
            oV.style.setProperty("--corte", fCorte + "%");
            oV.setAttribute("aria-valuenow", Math.round(fCorte));
            const sVista = fCorte >= 99 ? "100" : (fCorte <= 1 ? "0" : "50");
            document.querySelectorAll("#vista button").forEach(function (b) { b.setAttribute("aria-checked", b.dataset.corte === sVista ? "true" : "false"); });
        }
        function mover(oEv) { const oR = oV.getBoundingClientRect(); definir_corte(100 * (oEv.clientX - oR.left) / oR.width); }
        oV.setAttribute("role", "slider"); oV.setAttribute("tabindex", "0");
        oV.setAttribute("aria-label", "Posição do divisor entre entrada e resultado");
        oV.setAttribute("aria-valuemin", "0"); oV.setAttribute("aria-valuemax", "100"); oV.setAttribute("aria-valuenow", "50");
        oV.addEventListener("pointerdown", function (oEv) { if (!oEstado.mLimpa) return; bArr = true; oV.setPointerCapture(oEv.pointerId); mover(oEv); });
        oV.addEventListener("pointermove", function (oEv) { if (bArr) mover(oEv); });
        oV.addEventListener("pointerup", function () { bArr = false; });
        oV.addEventListener("dblclick", function () { if (oEstado.mLimpa) definir_corte(50); });
        oV.addEventListener("keydown", function (oEv) {
            if (!oEstado.mLimpa) return;
            const fPasso = oEv.shiftKey ? 10 : 2;
            if (oEv.key === "ArrowLeft") definir_corte(fCorte - fPasso);
            else if (oEv.key === "ArrowRight") definir_corte(fCorte + fPasso);
            else if (oEv.key === "Home") definir_corte(0);
            else if (oEv.key === "End") definir_corte(100);
            else return;
            oEv.preventDefault();
        });
        document.querySelectorAll("#vista button").forEach(function (b) { b.addEventListener("click", function () { definir_corte(parseFloat(b.dataset.corte)); }); });
        oV.addEventListener("dragover", function (oEv) { oEv.preventDefault(); oV.classList.add("arrastando"); });
        oV.addEventListener("dragleave", function () { oV.classList.remove("arrastando"); });
        oV.addEventListener("drop", function (oEv) { oEv.preventDefault(); oV.classList.remove("arrastando"); if (oEv.dataTransfer.files[0]) abrir_arquivo(oEv.dataTransfer.files[0]); });
    }

    function salvar(oTela, sPrefixo) {
        if (!oEstado.mLimpa) { mostrar_aviso("Abra uma imagem antes de salvar."); return; }
        oTela.toBlob(function (oBlob) {
            const oA = document.createElement("a");
            oA.href = URL.createObjectURL(oBlob);
            oA.download = sPrefixo + "_" + (oEstado.sNome ? oEstado.sNome.replace(/\.[^.]+$/, "") : "imagem") + ".png";
            document.body.appendChild(oA); oA.click(); oA.remove();
            setTimeout(function () { URL.revokeObjectURL(oA.href); }, 2000);
        }, "image/png");
    }

    // =====================================================================
    //  TROCA DE ABA
    // =====================================================================
    function trocar_aba(sAba) {
        if (sAba === oEstado.sAba) return;
        oEstado.sAba = sAba;
        $("aba-gabor").setAttribute("aria-selected", sAba === "gabor" ? "true" : "false");
        $("aba-weickert").setAttribute("aria-selected", sAba === "weickert" ? "true" : "false");
        atualizar_visibilidade();
        if (sAba === "weickert" && oUI.d.ruido === 0 && !oEstado.bAvisouRuido) {      // para a difusão ter o que limpar
            oEstado.bAvisouRuido = true; oUI.d.ruido = 25; oRefsD.ruido.atualizar();
        }
        sChaveFinal = "";
        aplicar_degradacao();
        atualizar_aux();
        $("sub-conteudo").dataset.cod = "";
        atualizar_sub();
    }

    // =====================================================================
    //  INÍCIO
    // =====================================================================
    function iniciar() {
        construir_controles();
        ligar_divisor();
        $("aba-gabor").addEventListener("click", function () { trocar_aba("gabor"); });
        $("aba-weickert").addEventListener("click", function () { trocar_aba("weickert"); });
        document.querySelectorAll("[data-sub]").forEach(function (oB) {
            oB.addEventListener("click", function () {
                sSub = oB.dataset.sub;
                document.querySelectorAll("[data-sub]").forEach(function (o) { o.setAttribute("aria-selected", o === oB ? "true" : "false"); });
                $("sub-conteudo").dataset.cod = "";
                atualizar_sub();
            });
        });
        $("arquivo").addEventListener("change", function (oEv) { abrir_arquivo(oEv.target.files[0]); oEv.target.value = ""; });
        document.querySelectorAll("#tamanho button").forEach(function (b) {
            b.addEventListener("click", function () {
                document.querySelectorAll("#tamanho button").forEach(function (o) { o.setAttribute("aria-checked", o === b ? "true" : "false"); });
                oEstado.iMaxLado = parseInt(b.dataset.valor, 10); preparar_trabalho();
            });
        });
        $("salvar-saida").addEventListener("click", function () { salvar($("tela-saida"), oEstado.sAba); });
        $("salvar-entrada").addEventListener("click", function () { salvar($("tela-entrada"), "entrada"); });
        atualizar_aux();
        atualizar_sub();
        // Legendas ficam em 2 linhas no layout compacto: o texto completo vai para a dica ao passar o mouse.
        ["aux-legenda", "curva-legenda"].forEach(function (sId2) {
            const oL = $(sId2);
            new MutationObserver(function () { oL.title = oL.textContent; }).observe(oL, { childList: true, characterData: true, subtree: true });
        });
        let iRedim = 0;
        window.addEventListener("resize", function () { cancelAnimationFrame(iRedim); iRedim = requestAnimationFrame(desenhar_curva); });
    }

    iniciar();
})();
