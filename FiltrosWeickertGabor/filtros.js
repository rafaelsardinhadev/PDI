/*
 * filtros.js — Núcleo numérico dos filtros de Gabor e de Weickert.
 *
 * Este arquivo NÃO usa nada do navegador (DOM/canvas): só vetores e números.
 * Por isso roda igual no navegador (window.Filtros) e no Node (testes).
 *
 * Convenções
 *  - Imagem em tons de cinza = vetor Float32Array linear (linha a linha),
 *    com níveis em [0, 255]. Pixel (x, y) fica em  mImagem[y * iL + x].
 *  - Eixo x cresce para a direita e eixo y cresce PARA BAIXO (como no canvas).
 *  - Prefixos (mesmo estilo das atividades em Python):
 *      i = inteiro | f = real | s = texto | b = lógico
 *      a = vetor   | m = imagem (matriz linearizada) | o = objeto
 */
(function (oRaiz) {
    "use strict";

    // =====================================================================
    //  1. UTILIDADES
    // =====================================================================

    // Reflexão espelhada na borda (-1 -> 1, n -> n-2): condição de Neumann.
    function refletir(i, n) {
        if (n === 1) return 0;
        while (i < 0 || i >= n) {
            if (i < 0) i = -i;
            if (i >= n) i = 2 * (n - 1) - i;
        }
        return i;
    }

    // RGBA (0..255) -> tons de cinza (0..255). Transparência é composta sobre branco.
    function para_cinza(aRGBA, iL, iA) {
        const mImagem = new Float32Array(iL * iA);
        for (let i = 0; i < iL * iA; i++) {
            const fAlfa = aRGBA[4 * i + 3] / 255;
            const fR = aRGBA[4 * i]     * fAlfa + 255 * (1 - fAlfa);
            const fG = aRGBA[4 * i + 1] * fAlfa + 255 * (1 - fAlfa);
            const fB = aRGBA[4 * i + 2] * fAlfa + 255 * (1 - fAlfa);
            mImagem[i] = 0.299 * fR + 0.587 * fG + 0.114 * fB;
        }
        return mImagem;
    }

    // PSNR (dB) entre duas imagens em [0, 255].
    function psnr(mA, mB) {
        let fErro = 0;
        for (let i = 0; i < mA.length; i++) { const f = mA[i] - mB[i]; fErro += f * f; }
        fErro /= mA.length;
        return fErro === 0 ? Infinity : 10 * Math.log10(255 * 255 / fErro);
    }

    // Gerador pseudoaleatório com semente (mesmo ruído a cada execução).
    function criar_aleatorio(iSemente) {
        let iS = iSemente >>> 0;
        return function () {                        // mulberry32 -> [0, 1)
            iS = (iS + 0x6D2B79F5) >>> 0;
            let t = iS;
            t = Math.imul(t ^ (t >>> 15), t | 1);
            t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }

    // Campo fixo de ruído N(0,1) (Box-Muller) e campo uniforme U(0,1).
    function campo_normal(iN, iSemente) {
        const fAleat = criar_aleatorio(iSemente);
        const mCampo = new Float32Array(iN);
        for (let i = 0; i < iN; i += 2) {
            const fU = Math.max(fAleat(), 1e-12), fV = fAleat();
            const fR = Math.sqrt(-2 * Math.log(fU));
            mCampo[i] = fR * Math.cos(2 * Math.PI * fV);
            if (i + 1 < iN) mCampo[i + 1] = fR * Math.sin(2 * Math.PI * fV);
        }
        return mCampo;
    }
    function campo_uniforme(iN, iSemente) {
        const fAleat = criar_aleatorio(iSemente);
        const mCampo = new Float32Array(iN);
        for (let i = 0; i < iN; i++) mCampo[i] = fAleat();
        return mCampo;
    }

    // Leitor de PGM/PPM (P2, P3, P5, P6) — formatos usados nas atividades da disciplina.
    function ler_pnm(aBytes) {
        let iPos = 0;
        function proximo_token() {
            while (iPos < aBytes.length) {
                const iC = aBytes[iPos];
                if (iC === 35) { while (iPos < aBytes.length && aBytes[iPos] !== 10) iPos++; }   // '#' comentário
                else if (iC === 32 || (iC >= 9 && iC <= 13)) iPos++;
                else break;
            }
            let sTok = "";
            while (iPos < aBytes.length) {
                const iC = aBytes[iPos];
                if (iC === 32 || (iC >= 9 && iC <= 13) || iC === 35) break;
                sTok += String.fromCharCode(iC); iPos++;
            }
            return sTok;
        }
        const sMagico = proximo_token();
        if (["P2", "P3", "P5", "P6"].indexOf(sMagico) < 0) throw new Error("Arquivo PNM inválido (cabeçalho " + sMagico + ").");
        const iL = parseInt(proximo_token(), 10), iA = parseInt(proximo_token(), 10), iMax = parseInt(proximo_token(), 10);
        if (!(iL > 0 && iA > 0 && iMax > 0)) throw new Error("Cabeçalho PNM inválido.");
        const iCanais = (sMagico === "P3" || sMagico === "P6") ? 3 : 1;
        const bBinario = (sMagico === "P5" || sMagico === "P6");
        const b16 = iMax > 255;
        if (bBinario) iPos++;                         // um único espaço separa o cabeçalho dos dados
        const aRGBA = new Uint8ClampedArray(iL * iA * 4);
        for (let i = 0; i < iL * iA; i++) {
            const aV = [];
            for (let c = 0; c < iCanais; c++) {
                let iV;
                if (bBinario) {
                    iV = b16 ? (aBytes[iPos] << 8) | aBytes[iPos + 1] : aBytes[iPos];
                    iPos += b16 ? 2 : 1;
                } else iV = parseInt(proximo_token(), 10);
                aV.push(Math.round(iV * 255 / iMax));
            }
            aRGBA[4 * i]     = aV[0];
            aRGBA[4 * i + 1] = aV[iCanais === 3 ? 1 : 0];
            aRGBA[4 * i + 2] = aV[iCanais === 3 ? 2 : 0];
            aRGBA[4 * i + 3] = 255;
        }
        return { iL: iL, iA: iA, aRGBA: aRGBA };
    }

    // Leitor mínimo de TIFF "baseline": sem compressão, 8 bits, 1 canal (cinza) ou 3 (RGB),
    // em faixas (strips) — o formato das figuras .tif usadas na disciplina.
    function ler_tiff(aBytes) {
        const oV = new DataView(aBytes.buffer, aBytes.byteOffset, aBytes.byteLength);
        const sOrdem = String.fromCharCode(aBytes[0], aBytes[1]);
        if (sOrdem !== "II" && sOrdem !== "MM") throw new Error("Arquivo TIFF inválido.");
        const bLE = sOrdem === "II";
        const u16 = function (i) { return oV.getUint16(i, bLE); }, u32 = function (i) { return oV.getUint32(i, bLE); };
        if (u16(2) !== 42) throw new Error("Arquivo TIFF inválido (número mágico).");
        const iIFD = u32(4), iN = u16(iIFD), oTag = {};
        for (let i = 0; i < iN; i++) {
            const iP = iIFD + 2 + 12 * i, iTag = u16(iP), iTipo = u16(iP + 2), iCnt = u32(iP + 4);
            const iTam = iTipo === 3 ? 2 : (iTipo === 4 ? 4 : 1);
            const iOrig = iCnt * iTam <= 4 ? iP + 8 : u32(iP + 8);
            const aV = [];
            for (let k = 0; k < iCnt; k++) aV.push(iTipo === 3 ? u16(iOrig + 2 * k) : (iTipo === 4 ? u32(iOrig + 4 * k) : aBytes[iOrig + k]));
            oTag[iTag] = aV;
        }
        const iL = oTag[256][0], iA = oTag[257][0];
        const iBits = oTag[258] ? oTag[258][0] : 1, iComp = oTag[259] ? oTag[259][0] : 1;
        const iFoto = oTag[262] ? oTag[262][0] : 1, iCanais = oTag[277] ? oTag[277][0] : 1;
        if (iComp !== 1) throw new Error("TIFF comprimido não é suportado — converta para PNG.");
        if (iBits !== 8 || (iCanais !== 1 && iCanais !== 3)) throw new Error("Só TIFF de 8 bits (cinza ou RGB) é suportado — converta para PNG.");
        const aDados = new Uint8Array(iL * iA * iCanais);
        let iPos = 0;
        for (let s = 0; s < oTag[273].length; s++) {
            const iTam = oTag[279] ? oTag[279][s] : aDados.length - iPos;
            aDados.set(aBytes.subarray(oTag[273][s], oTag[273][s] + Math.min(iTam, aDados.length - iPos)), iPos);
            iPos += iTam;
        }
        const aRGBA = new Uint8ClampedArray(iL * iA * 4);
        for (let i = 0; i < iL * iA; i++) {
            let iR = aDados[i * iCanais], iG = aDados[i * iCanais + (iCanais === 3 ? 1 : 0)], iB = aDados[i * iCanais + (iCanais === 3 ? 2 : 0)];
            if (iFoto === 0) { iR = 255 - iR; iG = 255 - iG; iB = 255 - iB; }     // 0 = branco
            aRGBA[4 * i] = iR; aRGBA[4 * i + 1] = iG; aRGBA[4 * i + 2] = iB; aRGBA[4 * i + 3] = 255;
        }
        return { iL: iL, iA: iA, aRGBA: aRGBA };
    }

    // =====================================================================
    //  2. SUAVIZAÇÃO GAUSSIANA SEPARÁVEL  (usada pelo Weickert: σ e ρ)
    // =====================================================================

    const oCacheGauss = {};
    function nucleo_gauss(fSigma) {
        const sChave = fSigma.toFixed(3);
        if (oCacheGauss[sChave]) return oCacheGauss[sChave];
        const iR = Math.max(1, Math.ceil(3 * fSigma));
        const aK = new Float32Array(2 * iR + 1);
        let fSoma = 0;
        for (let i = -iR; i <= iR; i++) { aK[i + iR] = Math.exp(-(i * i) / (2 * fSigma * fSigma)); fSoma += aK[i + iR]; }
        for (let i = 0; i < aK.length; i++) aK[i] /= fSoma;
        return (oCacheGauss[sChave] = aK);
    }

    // mSai = G_sigma * mEnt  (duas passadas 1D; mTmp é um vetor auxiliar)
    function suavizar_gauss(mEnt, mSai, mTmp, iL, iA, fSigma) {
        if (fSigma < 0.3) { if (mSai !== mEnt) mSai.set(mEnt); return; }
        const aK = nucleo_gauss(fSigma), iR = (aK.length - 1) / 2;
        for (let y = 0; y < iA; y++) {                                  // horizontal
            const iLin = y * iL;
            for (let x = 0; x < iL; x++) {
                let fS = 0;
                if (x >= iR && x < iL - iR) for (let k = 0; k < aK.length; k++) fS += aK[k] * mEnt[iLin + x + k - iR];
                else for (let k = 0; k < aK.length; k++) fS += aK[k] * mEnt[iLin + refletir(x + k - iR, iL)];
                mTmp[iLin + x] = fS;
            }
        }
        for (let y = 0; y < iA; y++) {                                  // vertical
            for (let x = 0; x < iL; x++) {
                let fS = 0;
                if (y >= iR && y < iA - iR) for (let k = 0; k < aK.length; k++) fS += aK[k] * mTmp[(y + k - iR) * iL + x];
                else for (let k = 0; k < aK.length; k++) fS += aK[k] * mTmp[refletir(y + k - iR, iA) * iL + x];
                mSai[y * iL + x] = fS;
            }
        }
    }

    // =====================================================================
    //  3. FILTRO DE GABOR
    //
    //   g(x,y) = exp( -(x'² + γ²·y'²) / (2σ²) ) · cos( 2π·x'/λ + ψ )
    //   x' =  x·cosθ + y·senθ        y' = -x·senθ + y·cosθ
    //
    //   λ = comprimento de onda | θ = orientação (da NORMAL às listras)
    //   σ = largura do envelope | γ = razão de aspecto | ψ = fase
    // =====================================================================

    const iRAIO_GABOR_MAX = 30;      // limita o kernel a 61 x 61 (custo da convolução)

    function nucleo_gabor(oP) {
        const fSigma = oP.fSigma, fGama = oP.fGama;
        const iR = Math.min(iRAIO_GABOR_MAX, Math.ceil(3 * fSigma * Math.max(1, 1 / fGama)));
        const iT = 2 * iR + 1;
        const aK = new Float32Array(iT * iT);
        const aEnv = new Float32Array(iT * iT);
        const fCos = Math.cos(oP.fTheta), fSen = Math.sin(oP.fTheta);
        let fSomaG = 0, fSomaEnv = 0;
        for (let j = -iR; j <= iR; j++) {
            for (let i = -iR; i <= iR; i++) {
                const fX =  i * fCos + j * fSen;                               // x'  (eq. 3)
                const fY = -i * fSen + j * fCos;                               // y'  (eq. 4)
                const fEnv = Math.exp(-(fX * fX + fGama * fGama * fY * fY) / (2 * fSigma * fSigma));
                const fG = fEnv * Math.cos(2 * Math.PI * fX / oP.fLambda + oP.fPsi);   // eq. 2
                aK[(j + iR) * iT + (i + iR)] = fG;
                aEnv[(j + iR) * iT + (i + iR)] = fEnv;
                fSomaG += fG; fSomaEnv += fEnv;
            }
        }
        // Remove a componente DC (soma = 0): região plana passa a responder 0.
        if (oP.bSemDC) {
            const fK = fSomaG / fSomaEnv;
            for (let i = 0; i < aK.length; i++) aK[i] -= fK * aEnv[i];
        }
        // Normaliza por L1 (soma dos módulos = 1): resposta em níveis de cinza.
        let fL1 = 0;
        for (let i = 0; i < aK.length; i++) fL1 += Math.abs(aK[i]);
        if (fL1 > 0) for (let i = 0; i < aK.length; i++) aK[i] /= fL1;
        return { aK: aK, iR: iR, iT: iT };
    }

    // Copia a imagem com uma moldura de iR pixels espelhados (evita testar bordas no laço).
    function preencher_borda(mImagem, iL, iA, iR) {
        const iLP = iL + 2 * iR, iAP = iA + 2 * iR;
        const mP = new Float32Array(iLP * iAP);
        for (let y = 0; y < iAP; y++) {
            const iLin = refletir(y - iR, iA) * iL;
            for (let x = 0; x < iLP; x++) mP[y * iLP + x] = mImagem[iLin + refletir(x - iR, iL)];
        }
        return { mP: mP, iLP: iLP };
    }

    // Convolução 2D:  r(p) = Σ_q g(q)·I(p − q).   Núcleo girado 180° => laço de correlação.
    function convolucao(oPad, iL, iA, oKer) {
        const aK = oKer.aK, iT = oKer.iT, mP = oPad.mP, iLP = oPad.iLP;
        const aKg = new Float32Array(aK.length);
        let fMax = 0;
        for (let i = 0; i < aK.length; i++) {
            aKg[i] = aK[aK.length - 1 - i];                                    // gira 180°
            if (Math.abs(aKg[i]) > fMax) fMax = Math.abs(aKg[i]);
        }
        // Em cada linha do núcleo guarda só o trecho [ini, fim] com coeficientes não desprezíveis
        // (< 0,05 % do pico): economiza as caudas de núcleos alongados/rotacionados.
        const aIni = new Int32Array(iT), aFim = new Int32Array(iT);
        for (let ky = 0; ky < iT; ky++) {
            let iI = iT, iF = -1;
            for (let kx = 0; kx < iT; kx++) if (Math.abs(aKg[ky * iT + kx]) > 5e-4 * fMax) { if (iI === iT) iI = kx; iF = kx; }
            aIni[ky] = iI; aFim[ky] = iF;
        }
        const mSai = new Float32Array(iL * iA);
        for (let y = 0; y < iA; y++) {
            for (let x = 0; x < iL; x++) {
                let fS = 0;
                for (let ky = 0; ky < iT; ky++) {
                    const iBase = (y + ky) * iLP + x, iKb = ky * iT, iF = aFim[ky];
                    for (let kx = aIni[ky]; kx <= iF; kx++) fS += aKg[iKb + kx] * mP[iBase + kx];
                }
                mSai[y * iL + x] = fS;
            }
        }
        return mSai;
    }

    // Valor que será mapeado em 255 (percentil 99,5 evita que um único pixel domine o contraste).
    function escala_robusta(mValores) {
        const aOrd = Float32Array.from(mValores, Math.abs).sort();
        const fP = aOrd[Math.min(aOrd.length - 1, Math.floor(0.995 * aOrd.length))];
        return fP > 1e-6 ? fP : 1;
    }

    /*
     * Aplica o filtro de Gabor (com banco de iN orientações: θ, θ+π/N, θ+2π/N ...).
     * Em cada pixel vale a orientação de maior resposta.
     *   sModo: 'resposta' (com sinal) | 'magnitude' | 'energia' (par² + ímpar²) | 'realce' (I + ganho·r)
     * Retorna { mSaida (0..255), iRaio }.
     */
    function filtro_gabor(mImagem, iL, iA, oP, sModo, iN, fGanho) {
        const iPix = iL * iA;
        const oK0 = nucleo_gabor(oP);
        const oPad = preencher_borda(mImagem, iL, iA, oK0.iR);
        const mMelhor = new Float32Array(iPix);          // valor do melhor ângulo
        const mForca = new Float32Array(iPix).fill(-1);  // |r| (ou energia) do melhor ângulo
        for (let n = 0; n < iN; n++) {
            const oPn = Object.assign({}, oP, { fTheta: oP.fTheta + n * Math.PI / iN });
            const mR = convolucao(oPad, iL, iA, nucleo_gabor(oPn));
            let mR2 = null;
            if (sModo === "energia") {                   // par de quadratura: fase ψ + 90°
                mR2 = convolucao(oPad, iL, iA, nucleo_gabor(Object.assign({}, oPn, { fPsi: oP.fPsi + Math.PI / 2 })));
            }
            for (let i = 0; i < iPix; i++) {
                const fForca = mR2 ? Math.hypot(mR[i], mR2[i]) : Math.abs(mR[i]);
                if (fForca > mForca[i]) {
                    mForca[i] = fForca;
                    mMelhor[i] = (sModo === "energia" || sModo === "magnitude") ? fForca : mR[i];
                }
            }
        }
        const mSaida = new Float32Array(iPix);
        const fEsc = escala_robusta(mMelhor);
        for (let i = 0; i < iPix; i++) {
            let fV;
            if (sModo === "resposta") fV = 128 + 127 * mMelhor[i] / fEsc;
            else if (sModo === "realce") fV = mImagem[i] + fGanho * mMelhor[i];
            else fV = 255 * mMelhor[i] / fEsc;
            mSaida[i] = fV < 0 ? 0 : (fV > 255 ? 255 : fV);
        }
        return { mSaida: mSaida, iRaio: oK0.iR };
    }

    // =====================================================================
    //  4. DIFUSÃO ANISOTRÓPICA DE WEICKERT
    //
    //      ∂u/∂t = div( D · ∇u )          D = tensor de difusão (matriz 2x2)
    //
    //  Escalar (Perona-Malik):  D = g(|∇u_σ|²)·I
    //  EED (realça bordas):     autovetores v1 ∥ ∇u_σ ,  v2 ⊥ ∇u_σ
    //                           λ1 = g(|∇u_σ|²) ,  λ2 = 1
    //  CED (realça coerência):  J_ρ = G_ρ * (∇u_σ ∇u_σᵀ)   (tensor de estrutura)
    //                           λ1 = α ,  λ2 = α + (1-α)·exp(-C/(μ1-μ2)²)
    //
    //  Esquema numérico: Euler explícito  u ← u + τ·div(D∇u).
    //  Os fluxos são calculados nos pontos MÉDIOS entre pixels (esquema estagiado)
    //  com fluxo nulo na borda. O operador resultante é a derivada de uma energia
    //  ¼·Σ ∇uᵀ·D·∇u, logo é simétrico e semidefinido: nunca "anti-difunde", conserva
    //  a média da imagem e amortece até o padrão de tabuleiro (pixel sim, pixel não).
    // =====================================================================

    const fC4 = 3.31488;   // constante da difusividade de Weickert (m = 4): fluxo máximo em s = λ

    // g em função de r² = (|∇u_σ|/λ)²
    function difusividade(sTipo, fR2) {
        if (sTipo === "pm1") return 1 / (1 + fR2);                        // Perona-Malik 1
        if (sTipo === "pm2") return Math.exp(-fR2);                       // Perona-Malik 2
        const fR8 = fR2 * fR2 * fR2 * fR2;                                // Weickert: 1 - exp(-C4/(s/λ)^8)
        return 1 - Math.exp(-fC4 / fR8);
    }

    // Derivadas de Scharr: mDx, mDy = ∇u (em níveis de cinza por pixel).
    function derivadas(mU, mDx, mDy, iL, iA) {
        const aXm = new Int32Array(iL), aXp = new Int32Array(iL);
        for (let x = 0; x < iL; x++) { aXm[x] = refletir(x - 1, iL); aXp[x] = refletir(x + 1, iL); }
        for (let y = 0; y < iA; y++) {
            const iM = refletir(y - 1, iA) * iL, i0 = y * iL, iP = refletir(y + 1, iA) * iL;
            for (let x = 0; x < iL; x++) {
                const a = mU[iM + aXm[x]], b = mU[iM + x], c = mU[iM + aXp[x]];
                const d = mU[i0 + aXm[x]],                  f = mU[i0 + aXp[x]];
                const g = mU[iP + aXm[x]], h = mU[iP + x], k = mU[iP + aXp[x]];
                mDx[i0 + x] = (3 * (c - a) + 10 * (f - d) + 3 * (k - g)) / 32;
                mDy[i0 + x] = (3 * (g - a) + 10 * (h - b) + 3 * (k - c)) / 32;
            }
        }
    }

    /*
     * mDu = div( D · ∇u )   — esquema estagiado.
     *   Pontos médios horizontais (x+½, y):  gx = u(x+1)-u(x),  gy = média das derivadas centrais em y
     *   Pontos médios verticais   (x, y+½):  gy = u(y+1)-u(y),  gx = média das derivadas centrais em x
     *   Em cada ponto: fluxo j = D·g, com D = média do tensor dos dois pixels vizinhos.
     *   A divergência é a transposta (com sinal) desse cálculo; o fator ½ evita contar a energia duas vezes.
     */
    function divergencia(oE) {
        const iL = oE.iL, iA = oE.iA, mU = oE.mU, mA = oE.mA, mB = oE.mB, mC = oE.mC;
        const mHx = oE.mHx, mHy = oE.mHy, mVx = oE.mVx, mVy = oE.mVy, mDu = oE.mDu;
        for (let y = 0; y < iA; y++) {
            const iM = refletir(y - 1, iA) * iL, i0 = y * iL, iP = refletir(y + 1, iA) * iL;
            for (let x = 0; x < iL; x++) {
                const i = i0 + x;
                if (x < iL - 1) {                                            // ponto médio (x+½, y)
                    const k = i + 1;
                    const fA = 0.5 * (mA[i] + mA[k]), fB = 0.5 * (mB[i] + mB[k]), fC = 0.5 * (mC[i] + mC[k]);
                    const fGx = mU[k] - mU[i];
                    const fGy = 0.25 * (mU[iP + x] - mU[iM + x] + mU[iP + x + 1] - mU[iM + x + 1]);
                    mHx[i] = fA * fGx + fB * fGy;
                    mHy[i] = (y > 0 && y < iA - 1) ? fB * fGx + fC * fGy : 0;
                } else { mHx[i] = 0; mHy[i] = 0; }
                if (y < iA - 1) {                                            // ponto médio (x, y+½)
                    const k = i + iL, xm = refletir(x - 1, iL), xp = refletir(x + 1, iL);
                    const fA = 0.5 * (mA[i] + mA[k]), fB = 0.5 * (mB[i] + mB[k]), fC = 0.5 * (mC[i] + mC[k]);
                    const fGy = mU[k] - mU[i];
                    const fGx = 0.25 * (mU[i0 + xp] - mU[i0 + xm] + mU[i0 + iL + xp] - mU[i0 + iL + xm]);
                    mVx[i] = (x > 0 && x < iL - 1) ? fA * fGx + fB * fGy : 0;
                    mVy[i] = fB * fGx + fC * fGy;
                } else { mVx[i] = 0; mVy[i] = 0; }
            }
        }
        for (let y = 0; y < iA; y++) {
            for (let x = 0; x < iL; x++) {
                const i = y * iL + x;
                // termos "diretos": diferenças dos fluxos normais
                const fDir = (mHx[i] - (x > 0 ? mHx[i - 1] : 0)) + (mVy[i] - (y > 0 ? mVy[i - iL] : 0));
                // termos "cruzados": fluxos tangenciais (vêm da parte b do tensor)
                let fCr = 0;
                for (let xi = x - 1; xi <= x; xi++) {
                    if (xi < 0 || xi > iL - 2) continue;
                    if (y > 0) fCr += mHy[(y - 1) * iL + xi];
                    if (y < iA - 1) fCr -= mHy[(y + 1) * iL + xi];
                }
                for (let yj = y - 1; yj <= y; yj++) {
                    if (yj < 0 || yj > iA - 2) continue;
                    if (x > 0) fCr += mVx[yj * iL + x - 1];
                    if (x < iL - 1) fCr -= mVx[yj * iL + x + 1];
                }
                mDu[i] = 0.5 * fDir - 0.125 * fCr;
            }
        }
    }

    // ---- Tensores:  D = [[a, b], [b, c]]  (mA, mB, mC) -------------------

    // Perona-Malik: difusão escalar, D = g·I
    function tensor_pm(oE, oP) {
        const fL2 = oP.fLambda * oP.fLambda, iN = oE.iL * oE.iA;
        for (let i = 0; i < iN; i++) {
            const fG = difusividade(oP.sDifusividade, (oE.mGxs[i] * oE.mGxs[i] + oE.mGys[i] * oE.mGys[i]) / fL2);
            oE.mA[i] = fG; oE.mB[i] = 0; oE.mC[i] = fG;
        }
    }

    // EED: D = I - (1 - g)·v1·v1ᵀ,  com v1 = ∇u_σ / |∇u_σ|   (sem usar trigonometria)
    function tensor_eed(oE, oP) {
        const fL2 = oP.fLambda * oP.fLambda, iN = oE.iL * oE.iA;
        for (let i = 0; i < iN; i++) {
            const fGx = oE.mGxs[i], fGy = oE.mGys[i], fMod2 = fGx * fGx + fGy * fGy;
            if (fMod2 < 1e-12) { oE.mA[i] = 1; oE.mB[i] = 0; oE.mC[i] = 1; continue; }
            const fK = (1 - difusividade(oP.sDifusividade, fMod2 / fL2)) / fMod2;
            oE.mA[i] = 1 - fK * fGx * fGx;
            oE.mB[i] =   - fK * fGx * fGy;
            oE.mC[i] = 1 - fK * fGy * fGy;
        }
    }

    // CED: tensor de estrutura suavizado (ρ) e autovalores λ1 = α, λ2 = α + (1-α)·exp(-C/κ)
    //      κ = (μ1 - μ2)²   e   C = c⁴  (c = "limiar de coerência", em níveis de cinza)
    function tensor_ced(oE, oP) {
        const iL = oE.iL, iA = oE.iA, iN = iL * iA;
        for (let i = 0; i < iN; i++) {                                       // ∇u_σ ∇u_σᵀ
            oE.mJxx[i] = oE.mGxs[i] * oE.mGxs[i];
            oE.mJxy[i] = oE.mGxs[i] * oE.mGys[i];
            oE.mJyy[i] = oE.mGys[i] * oE.mGys[i];
        }
        suavizar_gauss(oE.mJxx, oE.mJxx, oE.mTmp, iL, iA, oP.fRho);          // J_ρ = G_ρ * (...)
        suavizar_gauss(oE.mJxy, oE.mJxy, oE.mTmp, iL, iA, oP.fRho);
        suavizar_gauss(oE.mJyy, oE.mJyy, oE.mTmp, iL, iA, oP.fRho);
        const fAlfa = oP.fAlfa, fC2 = oP.fC * oP.fC;
        for (let i = 0; i < iN; i++) {
            const fDx = oE.mJxx[i] - oE.mJyy[i], fDy = 2 * oE.mJxy[i];
            const fD = Math.sqrt(fDx * fDx + fDy * fDy);                     // μ1 - μ2  (coerência)
            if (fD < 1e-9) { oE.mA[i] = fAlfa; oE.mB[i] = 0; oE.mC[i] = fAlfa; continue; }
            const fR = fC2 / fD;
            const fL2 = fAlfa + (1 - fAlfa) * Math.exp(-fR * fR);            // λ2 (ao longo da estrutura)
            const fDif = fAlfa - fL2;                                        // λ1 - λ2
            oE.mA[i] = fL2 + fDif * 0.5 * (1 + fDx / fD);
            oE.mB[i] =       fDif * (oE.mJxy[i] / fD);
            oE.mC[i] = fL2 + fDif * 0.5 * (1 - fDx / fD);
        }
    }

    // ---- Estado e passo da evolução ---------------------------------------

    // mMascara (opcional): 1 = pixel conhecido, 0 = pixel removido (será "restaurado").
    function criar_estado(mBase, iL, iA, mMascara) {
        const iN = iL * iA, nv = function () { return new Float32Array(iN); };
        const oE = {
            iL: iL, iA: iA, iIter: 0, mMascara: mMascara || null,
            mBase: mBase, mU: Float32Array.from(mBase),
            mUs: nv(), mTmp: nv(), mGxs: nv(), mGys: nv(),
            mA: nv(), mB: nv(), mC: nv(), mDu: nv(),
            mHx: nv(), mHy: nv(), mVx: nv(), mVy: nv(),
            mJxx: nv(), mJxy: nv(), mJyy: nv()
        };
        repor_estado(oE, mBase, mMascara);
        return oE;
    }

    // Volta ao instante t = 0 reaproveitando a memória (usado ao mexer nos sliders).
    function repor_estado(oE, mBase, mMascara) {
        const iN = oE.iL * oE.iA;
        oE.mBase = mBase; oE.mMascara = mMascara || null; oE.iIter = 0;
        oE.mU.set(mBase);
        if (oE.mMascara) {                                  // preenche os buracos com a média dos pixels conhecidos
            let fS = 0, iC = 0;
            for (let i = 0; i < iN; i++) if (oE.mMascara[i]) { fS += mBase[i]; iC++; }
            const fMedia = iC ? fS / iC : 128;
            for (let i = 0; i < iN; i++) if (!oE.mMascara[i]) oE.mU[i] = fMedia;
        }
    }

    // Uma iteração:  u ← u + τ · div( D(u) · ∇u )
    function passo_difusao(oE, oP) {
        const iL = oE.iL, iA = oE.iA, iN = iL * iA;
        // 1) gradiente da imagem pré-suavizada (σ) -> usado só para montar o tensor D
        if (oP.fSigma >= 0.3) suavizar_gauss(oE.mU, oE.mUs, oE.mTmp, iL, iA, oP.fSigma);
        else oE.mUs.set(oE.mU);
        derivadas(oE.mUs, oE.mGxs, oE.mGys, iL, iA);
        // 2) tensor de difusão D = [[a, b], [b, c]]
        if (oP.sModelo === "ced") tensor_ced(oE, oP);
        else if (oP.sModelo === "eed") tensor_eed(oE, oP);
        else tensor_pm(oE, oP);
        // 3) divergência do fluxo  div(D·∇u)  e atualização (só nos pixels removidos, se houver máscara)
        divergencia(oE);
        const fTau = oP.fTau, mM = oE.mMascara;
        for (let i = 0; i < iN; i++) if (!mM || !mM[i]) oE.mU[i] += fTau * oE.mDu[i];
        oE.iIter++;
    }

    // Autovalores do tensor no pixel i (para mostrar/validar)
    function autovalores(fA, fB, fC) {
        const fT = 0.5 * (fA + fC), fD = Math.sqrt(0.25 * (fA - fC) * (fA - fC) + fB * fB);
        return [fT + fD, fT - fD];
    }

    // =====================================================================
    //  5. DEGRADAÇÃO CONTROLADA DA ENTRADA
    // =====================================================================
    function degradar(mLimpa, mRuido, fSigmaRuido) {
        const mSai = new Float32Array(mLimpa.length);
        for (let i = 0; i < mSai.length; i++) {
            const f = mLimpa[i] + fSigmaRuido * mRuido[i];
            mSai[i] = f < 0 ? 0 : (f > 255 ? 255 : f);
        }
        return mSai;
    }
    // 1 = pixel conhecido, 0 = removido (fRemover = fração removida, 0..1)
    function criar_mascara(mUniforme, fRemover) {
        const mM = new Uint8Array(mUniforme.length);
        for (let i = 0; i < mM.length; i++) mM[i] = mUniforme[i] < fRemover ? 0 : 1;
        return mM;
    }

    const oAPI = {
        refletir, para_cinza, psnr, campo_normal, campo_uniforme, ler_pnm, ler_tiff,
        nucleo_gauss, suavizar_gauss,
        nucleo_gabor, preencher_borda, convolucao, escala_robusta, filtro_gabor,
        difusividade, derivadas, divergencia, tensor_pm, tensor_eed, tensor_ced,
        criar_estado, repor_estado, passo_difusao, autovalores, degradar, criar_mascara,
        fC4, iRAIO_GABOR_MAX
    };
    if (typeof module !== "undefined" && module.exports) module.exports = oAPI;
    else oRaiz.Filtros = oAPI;
})(typeof window !== "undefined" ? window : globalThis);
