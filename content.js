(() => {
    'use strict';

    if (window.__uveg_extension_iniciada) {
        return;
    }
    window.__uveg_extension_iniciada = true;

    // Evitar ejecución dentro de iframes
    if (window.top !== window.self) {
        return;
    }

    // 1. Dominio permitido: *.uveg.edu.mx (o localhost / 127.0.0.1 / file: para pruebas locales)
    const hostname = window.location.hostname.toLowerCase();
    const esDominioValido = hostname.endsWith('uveg.edu.mx') ||
                            hostname === 'localhost' ||
                            hostname === '127.0.0.1' ||
                            window.location.protocol === 'file:';

    if (!esDominioValido) {
        return;
    }

    // Evitar ejecución dentro de páginas internas del reproductor SCORM
    if (/\/mod\/scorm\/|\/mod_scorm\//i.test(window.location.pathname)) {
        return;
    }

    const ID_HOST = 'uveg-copiar-recursos-host';
    const SIN_TITULO = '(sin título)';
    const ESPERA_REVISION_MS = 350;
    const DURACION_AVISO_MS = 1800;
    const REGEX_CODIGO_LECCION = /(?:LEC[_-]?L|[A-Z0-9]+_L|_L|L[_-]|LECCION[_-]?\s*|\bL)[_-]?0*(\d+)(?!\d)/i;
    const REGEX_NUMERO_PLECCION = /lecci[oó]n\s*0*(\d+)(?!\d)/i;
    const STORAGE_KEY_CURSO_ID = 'uveg_bloc_ultimo_curso_id';
    const STORAGE_KEY_MAPA_PLECCION = 'uveg_bloc_mapa_pleccion_';

    let host = null;
    let contenedor = null;
    let firmaActual = '';
    let descartado = false;
    let temporizador = null;
    let ultimaUrlRegistrada = window.location.href;
    let ultimoCursoIdRegistrado = null;

    // Colección acumulada de items encontrados
    let itemsAcumulados = [];
    let escaneandoSecciones = false;
    let ultimoCursoEscaneado = null;
    let descargasActivas = 0;

    function esperar(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async function fetchConReintento(url, opciones = {}, reintentos = 3, esperaBaseMs = 450) {
        let ultimoError = null;
        for (let intento = 1; intento <= reintentos; intento++) {
            try {
                const res = await fetch(url, opciones);
                if (res.ok || (res.status >= 300 && res.status < 500 && res.status !== 408 && res.status !== 429)) {
                    return res;
                }
                ultimoError = new Error(`HTTP ${res.status}`);
            } catch (err) {
                ultimoError = err;
            }
            if (intento < reintentos) {
                await esperar(esperaBaseMs * intento);
            }
        }
        if (ultimoError) throw ultimoError;
        return fetch(url, opciones);
    }

    // Dominios o patrones de recursos (Genially, UVEG interactivo, etc.)
    const HOSTS_GENIALLY = ['view.genial.ly', 'view.genially.com', 'genial.ly', 'genially.com'];

    function esUrlGenially(urlStr) {
        if (!urlStr) return false;
        try {
            const url = new URL(urlStr, window.location.href);
            const h = url.hostname.toLowerCase();
            return HOSTS_GENIALLY.some(base => h === base || h.endsWith('.' + base));
        } catch {
            return /view\.genial\.ly|view\.genially\.com/i.test(urlStr);
        }
    }

    function esUrlPdfDirecto(urlStr) {
        if (!urlStr) return false;
        return /\.pdf(?:[?#]|$)/i.test(String(urlStr).trim());
    }

    function extraerNombreArchivoPdf(urlStr) {
        if (!urlStr) return null;
        try {
            const u = new URL(urlStr, window.location.origin);
            const partes = u.pathname.split('/').filter(Boolean);
            const ultimo = partes.length > 0 ? decodeURIComponent(partes[partes.length - 1]) : '';
            if (/\.pdf$/i.test(ultimo)) {
                return ultimo;
            }
        } catch {}
        const m = String(urlStr).match(/\/([^/?#]+\.pdf)(?:[?#]|$)/i);
        if (m) {
            try { return decodeURIComponent(m[1]); } catch { return m[1]; }
        }
        return null;
    }

    function extraerNumeroLeccion(texto) {
        if (!texto) return null;
        const mPLec = String(texto).match(REGEX_NUMERO_PLECCION);
        if (mPLec) return parseInt(mPLec[1], 10);
        const m = String(texto).match(REGEX_CODIGO_LECCION);
        return m ? parseInt(m[1], 10) : null;
    }

    function normalizarUrl(urlStr) {
        if (!urlStr) return '';
        try {
            let u = new URL(urlStr, window.location.href);
            let h = u.hostname.toLowerCase();
            if (HOSTS_GENIALLY.some(base => h === base || h.endsWith('.' + base))) {
                h = 'view.genial.ly';
            }
            let p = u.pathname.replace(/\/+$/, '');
            const matchIdGenially = p.match(/([a-f0-9]{24})/i);
            if (matchIdGenially) {
                return `https://view.genial.ly/${matchIdGenially[1].toLowerCase()}`;
            }
            if (u.searchParams && u.searchParams.has('id')) {
                return `${u.protocol}//${h}${p}?id=${u.searchParams.get('id')}`.toLowerCase();
            }
            return `${u.protocol}//${h}${p}`.toLowerCase();
        } catch {
            return urlStr.trim().toLowerCase().replace(/\/+$/, '');
        }
    }

    function esUrlRecurso(urlStr) {
        if (!urlStr) return false;
        if (esUrlGenially(urlStr)) return true;
        try {
            const url = new URL(urlStr, window.location.href);
            const h = url.hostname.toLowerCase();
            const p = url.pathname.toLowerCase();
            if (h.endsWith('uveg.edu.mx')) {
                if (p.includes('/mod/scorm/') || p.includes('/mod_scorm/')) return true;
                if (p.includes('/mod_resource/') || p.includes('/mod/resource/') || p.endsWith('.pdf')) return true;
            }
        } catch {
            if (/mod\/scorm|mod_scorm|mod\/resource|mod_resource|\.pdf/i.test(urlStr)) return true;
        }
        return false;
    }

    const CLAVE_CERRADO_PREFIX = 'uveg_curso_cerrado_';

    // Detectar qué sección está activa internamente en la URL
    function obtenerSeccionActual() {
        const match = window.location.href.match(/[?&]mainsection=([234])($|&)/i);
        return match ? parseInt(match[1], 10) : null;
    }

    function obtenerIdCurso() {
        const match = window.location.href.match(/[?&]id=(\d+)($|&)/i);
        if (match) {
            if (/\/course\/view\.php/i.test(window.location.pathname)) {
                try { localStorage.setItem(STORAGE_KEY_CURSO_ID, match[1]); } catch {}
            }
            return match[1];
        }
        try {
            const guardado = localStorage.getItem(STORAGE_KEY_CURSO_ID);
            if (guardado && guardado.trim()) return guardado.trim();
        } catch {}
        if (esUrlPdfDirecto(window.location.href)) {
            return 'pdf_' + (extraerNombreArchivoPdf(window.location.href) || 'doc');
        }
        if (hostname === 'localhost' || hostname === '127.0.0.1' || window.location.protocol === 'file:') {
            return 'demo';
        }
        return null;
    }

    function estaCursoCerradoEnSesion(courseId) {
        if (!courseId) return false;
        try {
            return sessionStorage.getItem(CLAVE_CERRADO_PREFIX + courseId) === 'true';
        } catch {
            return false;
        }
    }

    function marcarCursoCerradoEnSesion(courseId) {
        if (!courseId) return;
        try {
            sessionStorage.setItem(CLAVE_CERRADO_PREFIX + courseId, 'true');
        } catch {}
    }

    function cerrarWidget() {
        const courseId = obtenerIdCurso();
        if (courseId) {
            marcarCursoCerradoEnSesion(courseId);
        }
        descartado = true;
        quitarHost();
    }

    function esPaginaCurso() {
        if (hostname === 'localhost' || hostname === '127.0.0.1' || window.location.protocol === 'file:') {
            return true;
        }
        return window.location.pathname.toLowerCase().includes('/course/view.php') && obtenerIdCurso() !== null;
    }

    // Comprobar internamente si corresponde a la vista del curso o a un PDF directo de UVEG
    function seccionEsPermitida(itemsEncontrados = []) {
        if (hostname === 'localhost' || hostname === '127.0.0.1' || window.location.protocol === 'file:') {
            return true;
        }
        if (esUrlPdfDirecto(window.location.href)) {
            return true;
        }
        if (esPaginaCurso()) {
            return true;
        }
        if (obtenerSeccionActual() !== null) {
            return true;
        }
        if (itemsEncontrados.length > 0) {
            return true;
        }
        return false;
    }

    // Algoritmo de ordenamiento natural interno por código/número (LEC_L1..LEC_L12) mostrando en la fichita <p class="leccion2-pLeccion">
    function ordenarPorTitulo(items) {
        const vistosUrl = new Set();
        const porClave = new Map();
        const sinNumero = [];
        const mapaPLeccion = cargarMapaPLeccion(obtenerIdCurso());

        for (const it of items) {
            const norm = normalizarUrl(it.url);
            if (vistosUrl.has(norm)) continue;
            vistosUrl.add(norm);

            const codInterno = it.codigo || it.titulo || SIN_TITULO;
            const num = it.numero ?? extraerNumeroLeccion(codInterno) ?? extraerNumeroLeccion(it.titulo);
            const tituloVisual = (num !== null && num !== 999 && mapaPLeccion[String(num)])
                ? mapaPLeccion[String(num)]
                : it.titulo;

            const itemEnriquecido = {
                ...it,
                codigo: codInterno,
                titulo: tituloVisual,
                numero: num !== null ? num : 999
            };

            if (num !== null && num !== 999) {
                const esPdf = it.tipo === 'pdf' || esUrlPdfDirecto(it.url);
                const clave = esPdf ? `${num}_pdf_${codInterno}` : `${num}_main`;
                const existente = porClave.get(clave);
                if (!existente || (it.tipo === 'genially' && existente.tipo !== 'genially')) {
                    porClave.set(clave, itemEnriquecido);
                }
            } else {
                sinNumero.push(itemEnriquecido);
            }
        }

        const conNumero = Array.from(porClave.values()).sort((a, b) => {
            if (a.numero !== b.numero) return a.numero - b.numero;
            if (a.tipo !== 'pdf' && b.tipo === 'pdf') return -1;
            if (a.tipo === 'pdf' && b.tipo !== 'pdf') return 1;
            return (a.codigo || a.titulo).localeCompare(b.codigo || b.titulo, undefined, { numeric: true, sensitivity: 'base' });
        });

        sinNumero.sort((a, b) => a.titulo.localeCompare(b.titulo, undefined, { numeric: true, sensitivity: 'base' }));
        return [...conNumero, ...sinNumero];
    }

    // --- EXTRACCIÓN DE TÍTULOS (<p class="leccion2-pLeccion">) Y CÓDIGOS INTERNOS (LEC_L1..L12, CPFI_L4..L12, L3_Comic) ---

    function cargarMapaPLeccion(courseId) {
        const clave = STORAGE_KEY_MAPA_PLECCION + (courseId || 'default');
        try {
            const raw = localStorage.getItem(clave);
            if (raw) {
                const parsed = JSON.parse(raw);
                if (parsed && typeof parsed === 'object') return parsed;
            }
        } catch {}
        return {};
    }

    function guardarMapaPLeccion(courseId, mapa) {
        if (!mapa || typeof mapa !== 'object') return;
        const clave = STORAGE_KEY_MAPA_PLECCION + (courseId || 'default');
        try {
            const actual = cargarMapaPLeccion(courseId);
            const combinado = { ...actual, ...mapa };
            localStorage.setItem(clave, JSON.stringify(combinado));
        } catch {}
    }

    function extraerMapaPLeccionDeDocumento(doc = document, courseId = '') {
        const mapa = cargarMapaPLeccion(courseId);
        if (!doc || !doc.querySelectorAll) return mapa;

        try {
            const parrafos = doc.querySelectorAll('p.leccion2-pLeccion, .leccion2-pLeccion, [class*="pLeccion"]');
            for (const p of parrafos) {
                const txt = (p.innerText || p.textContent || '').replace(/\s+/g, ' ').trim();
                if (!txt || txt.length < 3) continue;

                let num = extraerNumeroLeccion(txt);
                if (num === null) {
                    const idAnc = extraerIdContenedorLeccion(p);
                    num = extraerNumeroLeccion(idAnc);
                }
                if (num !== null && num !== 999) {
                    mapa[String(num)] = txt;
                }
            }
            guardarMapaPLeccion(courseId, mapa);
        } catch {}

        return mapa;
    }

    function obtenerNombrePLeccion(el, doc, contenedorExplicito, numLeccion, codigoFallback, mapaPLeccion = {}) {
        try {
            const contenedor = contenedorExplicito || (el && el.closest ? el.closest('.container-lesson, [id^="LEC_L"], [id^="lec_l"]') : null);
            if (contenedor && contenedor.querySelectorAll) {
                const pList = contenedor.querySelectorAll('p.leccion2-pLeccion, .leccion2-pLeccion, [class*="pLeccion"]');
                if (pList.length === 1) {
                    const txt = (pList[0].innerText || pList[0].textContent || '').replace(/\s+/g, ' ').trim();
                    if (txt.length > 2) return txt;
                } else if (pList.length > 1 && numLeccion !== null && numLeccion !== 999) {
                    for (const p of pList) {
                        const txt = (p.innerText || p.textContent || '').replace(/\s+/g, ' ').trim();
                        if (extraerNumeroLeccion(txt) === numLeccion) return txt;
                    }
                }
            }

            if (numLeccion !== null && numLeccion !== 999) {
                if (mapaPLeccion && mapaPLeccion[String(numLeccion)]) {
                    return mapaPLeccion[String(numLeccion)];
                }
                const guardado = cargarMapaPLeccion(obtenerIdCurso());
                if (guardado[String(numLeccion)]) {
                    return guardado[String(numLeccion)];
                }
            }

            if (el && el.closest) {
                const sec = el.closest('.activity, .activityinstance, .contentitem, .section, .box, li, div');
                if (sec && sec.querySelector) {
                    const pCercano = sec.querySelector('p.leccion2-pLeccion, .leccion2-pLeccion, [class*="pLeccion"]');
                    if (pCercano) {
                        const txt = (pCercano.innerText || pCercano.textContent || '').replace(/\s+/g, ' ').trim();
                        if (txt.length > 2) return txt;
                    }
                }
            }
        } catch {}

        return codigoFallback || SIN_TITULO;
    }

    function extraerIdContenedorLeccion(el) {
        if (!el) return '';
        try {
            let actual = el;
            while (actual && actual !== document.body && actual !== document.documentElement) {
                const idAttr = (actual.getAttribute && actual.getAttribute('id')) || actual.id || '';
                if (idAttr && REGEX_CODIGO_LECCION.test(idAttr) && !/^module-/i.test(idAttr)) {
                    return idAttr.trim();
                }
                const dataLesson = actual.getAttribute ? (actual.getAttribute('data-lesson') || actual.getAttribute('data-leccion') || '') : '';
                if (dataLesson && REGEX_CODIGO_LECCION.test(dataLesson)) {
                    return dataLesson.trim();
                }
                actual = actual.parentElement;
            }
        } catch {}
        return '';
    }

    function extraerTitulo(iframe, contextDoc = document) {
        const titleAttr = (iframe.getAttribute('title') || '').trim();
        const ariaAttr = (iframe.getAttribute('aria-label') || '').trim();
        const nameAttr = (iframe.getAttribute('name') || '').trim();

        if (titleAttr && !/^(genially|view|iframe|embedded)$/i.test(titleAttr)) {
            return titleAttr;
        }
        if (ariaAttr && !/^(genially|view|iframe|embedded)$/i.test(ariaAttr)) {
            return ariaAttr;
        }

        const idContenedor = extraerIdContenedorLeccion(iframe);
        if (idContenedor) return idContenedor;

        try {
            const actividad = iframe.closest ? iframe.closest('.container-lesson, .activity, .activityinstance, .contentitem, .section, .box, [id^="module-"]') : null;
            if (actividad) {
                const header = actividad.querySelector('.instancename, .activityname, h2, h3, h4, .mod-indent-outer');
                if (header) {
                    const textoLimpio = (header.innerText || header.textContent || '').split('\n')[0].replace(/\s+/g, ' ').trim();
                    if (textoLimpio.length > 2) {
                        return textoLimpio;
                    }
                }
            }
        } catch {}

        if (titleAttr) return titleAttr;
        if (nameAttr) return nameAttr;
        return SIN_TITULO;
    }

    function extraerCodigoElemento(el, contextDoc = document, contenedorExplicito = null, rawUrl = '') {
        if (!el) return SIN_TITULO;
        if (el.tagName === 'IFRAME') {
            return extraerTitulo(el, contextDoc);
        }

        try {
            const contenedor = contenedorExplicito || (el.closest ? el.closest('.container-lesson, [id^="LEC_L"], [id^="lec_l"], .activity, .activityinstance, .contentitem, .section, .box, [id^="module-"]') : null);
            if (contenedor) {
                const idCont = (contenedor.getAttribute && contenedor.getAttribute('id')) || contenedor.id || '';
                if (idCont && REGEX_CODIGO_LECCION.test(idCont) && !/^module-/i.test(idCont)) {
                    return idCont.trim();
                }
            }

            const idAncestro = extraerIdContenedorLeccion(el);
            if (idAncestro) {
                return idAncestro;
            }

            if (rawUrl && esUrlPdfDirecto(rawUrl)) {
                const nomPdf = extraerNombreArchivoPdf(rawUrl);
                if (nomPdf) {
                    return nomPdf.replace(/\.pdf$/i, '').trim();
                }
            }

            if (contenedor) {
                const tituloUveg = contenedor.querySelector('.titulo, .title, .nombre-leccion');
                if (tituloUveg) {
                    const txt = (tituloUveg.innerText || tituloUveg.textContent || '').replace(/\s+/g, ' ').trim();
                    if (txt.length > 2 && !/^(recursos|tiempo estimado)/i.test(txt)) {
                        return txt;
                    }
                }

                const header = contenedor.querySelector('.instancename, .activityname, h2, h3, h4, .mod-indent-outer');
                if (header) {
                    const copia = header.cloneNode(true);
                    copia.querySelectorAll('.accesshide, .sr-only').forEach(s => s.remove());
                    const txt = (copia.innerText || copia.textContent || '').split('\n')[0].replace(/\s+/g, ' ').trim();
                    if (txt.length > 2 && !/^(recursos|tiempo estimado)/i.test(txt)) {
                        return txt;
                    }
                }
            }

            const titleAttr = (el.getAttribute('title') || el.getAttribute('aria-label') || el.getAttribute('alt') || '').trim();
            if (titleAttr && !/^(genially|view|iframe|embedded|icono|imagen|recurso)$/i.test(titleAttr)) {
                return titleAttr.replace(/\s+/g, ' ');
            }
        } catch {}

        return SIN_TITULO;
    }

    function extraerElementoYUrlDeContenedor(cont) {
        if (!cont || !cont.querySelector) return null;

        // 1. Priorizar imagen .img-leccion (con data-link directo o envuelta en un <a>)
        const imgLeccion = cont.querySelector('.img-leccion');
        if (imgLeccion) {
            const dl = imgLeccion.getAttribute('data-link') || imgLeccion.getAttribute('href');
            if (dl && esUrlRecurso(dl)) {
                return { el: imgLeccion, rawAttr: dl };
            }
            const linkPadre = imgLeccion.closest ? imgLeccion.closest('a[href], [data-link]') : null;
            if (linkPadre && cont.contains(linkPadre)) {
                const attrPadre = linkPadre.getAttribute('data-link') || linkPadre.getAttribute('href');
                if (attrPadre && esUrlRecurso(attrPadre)) {
                    return { el: linkPadre, rawAttr: attrPadre };
                }
            }
            const onclickImg = imgLeccion.getAttribute('onclick') || '';
            const mOnclick = onclickImg.match(/['"](https?:\/\/[^'"]+|\/[^'"]+)['"]/i);
            if (mOnclick && esUrlRecurso(mOnclick[1])) {
                return { el: imgLeccion, rawAttr: mOnclick[1] };
            }
        }

        // 2. Buscar selectores de lección SCORM, mod/resource o PDF dentro del contenedor
        const selectores = [
            '.img-leccion[data-link]',
            '.img-leccion [data-link]',
            '[data-link*="/mod/scorm/"]',
            '[data-link*="/mod_scorm/"]',
            '[data-link*="/mod/resource/"]',
            '[data-link*="/mod_resource/"]',
            '[data-link*=".pdf"]',
            'a[href*="/mod/scorm/"]',
            'a[href*="/mod_scorm/"]',
            'a[href*="/mod/resource/"]',
            'a[href*="/mod_resource/"]',
            'a[href*=".pdf"]',
            '[data-link]'
        ];

        for (const sel of selectores) {
            const candidato = cont.querySelector(sel);
            if (candidato) {
                const raw = candidato.getAttribute('data-link') || candidato.getAttribute('href');
                if (raw && esUrlRecurso(raw)) {
                    return { el: candidato, rawAttr: raw };
                }
            }
        }

        const propioAttr = cont.getAttribute ? (cont.getAttribute('data-link') || cont.getAttribute('href')) : null;
        if (propioAttr && esUrlRecurso(propioAttr)) {
            return { el: cont, rawAttr: propioAttr };
        }

        return null;
    }

    function determinarTipoRecurso(urlStr) {
        if (!urlStr) return 'recurso';
        if (esUrlGenially(urlStr)) return 'genially';
        if (esUrlPdfDirecto(urlStr) || /\/mod\/resource\/|\/mod_resource\//i.test(urlStr)) return 'pdf';
        if (/\/mod\/scorm\/|\/mod_scorm\//i.test(urlStr)) return 'scorm';
        return 'recurso';
    }

    // Escanear tanto iframes (Genially) como contenedores de lección (SCORM / PDF)
    function encontrarLeccionesEnDocumento(doc = document) {
        const vistos = new Set();
        const encontrados = [];
        const contenedoresConGenially = new Set();
        const numerosConGenially = new Set();
        const courseIdActual = obtenerIdCurso();
        const mapaPLeccion = extraerMapaPLeccionDeDocumento(doc, courseIdActual);

        // 0. Si el navegador dio un salto directo a un archivo PDF de UVEG (ej. .../pluginfile.php/8852/mod_resource/content/5/L3_Comic.pdf)
        if (doc === document && esUrlPdfDirecto(window.location.href)) {
            const nombrePdf = extraerNombreArchivoPdf(window.location.href) || 'Documento.pdf';
            const codigoPdf = nombrePdf.replace(/\.pdf$/i, '').trim() || 'Documento_PDF';
            const numPdf = extraerNumeroLeccion(codigoPdf);
            const tituloVisual = (numPdf !== null && mapaPLeccion[String(numPdf)])
                ? mapaPLeccion[String(numPdf)]
                : codigoPdf;
            return [{
                codigo: codigoPdf,
                titulo: tituloVisual,
                url: window.location.href,
                tipo: 'pdf',
                numero: numPdf !== null ? numPdf : 999
            }];
        }

        // 1. Rastreo de Iframes de Genially (CPFI_L4, CPFI_L6, CPFI_L8, CPFI_L9, CPFI_L12)
        for (const iframe of doc.querySelectorAll('iframe')) {
            const rawSrc = iframe.getAttribute('src') || iframe.getAttribute('data-src') || iframe.src;
            if (!rawSrc || !esUrlGenially(rawSrc)) continue;

            let src = rawSrc;
            try { src = new URL(rawSrc, window.location.href).href; } catch {}

            const codigo = extraerTitulo(iframe, doc);
            if (/^(english|español|saltar|salir)/i.test(codigo.trim())) continue;

            const urlNorm = normalizarUrl(src);
            if (vistos.has(urlNorm)) continue;
            vistos.add(urlNorm);

            let numCont = null;
            const contPadre = iframe.closest ? iframe.closest('.container-lesson, [id^="LEC_L"], [id^="lec_l"]') : null;
            if (contPadre) {
                contenedoresConGenially.add(contPadre);
                numCont = extraerNumeroLeccion(contPadre.id);
                if (numCont !== null) numerosConGenially.add(numCont);
            }

            const numCodigo = extraerNumeroLeccion(codigo) ?? numCont;
            if (numCodigo !== null) {
                numerosConGenially.add(numCodigo);
            }

            const tituloVisual = obtenerNombrePLeccion(iframe, doc, contPadre, numCodigo, codigo, mapaPLeccion);

            encontrados.push({
                codigo: codigo,
                titulo: tituloVisual,
                url: src,
                tipo: 'genially',
                numero: numCodigo !== null ? numCodigo : 999
            });
        }

        // 2. Rastreo de contenedores de lección (.container-lesson, #LEC_L1..#LEC_L12) que NO están en Genially
        const contenedoresProcesados = new Set();
        const contenedores = doc.querySelectorAll('.container-lesson, [id^="LEC_L"], [id^="lec_l"]');

        for (const cont of contenedores) {
            contenedoresProcesados.add(cont);

            if (contenedoresConGenially.has(cont)) continue;
            if (cont.querySelector && cont.querySelector('iframe[src*="genial"]')) continue;

            const numLeccion = extraerNumeroLeccion(cont.id || '');
            if (numLeccion !== null && numerosConGenially.has(numLeccion)) continue;

            const infoEl = extraerElementoYUrlDeContenedor(cont);
            if (!infoEl) continue;

            let rawUrl = infoEl.rawAttr;
            try { rawUrl = new URL(infoEl.rawAttr, window.location.href).href; } catch {}

            const codigo = extraerCodigoElemento(infoEl.el, doc, cont, rawUrl);
            if (!codigo || codigo === SIN_TITULO) continue;
            if (/^(english|español|saltar|salir)/i.test(codigo.trim())) continue;

            const urlNorm = normalizarUrl(rawUrl);
            if (vistos.has(urlNorm)) continue;
            vistos.add(urlNorm);

            const num = numLeccion !== null ? numLeccion : (extraerNumeroLeccion(codigo) ?? 999);
            const tituloVisual = obtenerNombrePLeccion(infoEl.el, doc, cont, num, codigo, mapaPLeccion);

            encontrados.push({
                codigo: codigo,
                titulo: tituloVisual,
                url: rawUrl,
                tipo: determinarTipoRecurso(rawUrl),
                numero: num
            });
        }

        // 3. Respaldo para elementos .img-leccion, enlaces PDF de lección (ej. L3_Comic.pdf) o mod/resource
        const selectorRespaldo = [
            '.img-leccion[data-link]',
            '[data-link*="/mod/scorm/"]',
            '[data-link*="/mod_scorm/"]',
            '[data-link*="/mod/resource/"]',
            '[data-link*="/mod_resource/"]',
            '[data-link*=".pdf"]',
            'a[href*="/mod/resource/"]',
            'a[href*="/mod_resource/"]',
            'a[href*=".pdf"]'
        ].join(', ');

        for (const el of doc.querySelectorAll(selectorRespaldo)) {
            const padreCont = el.closest ? el.closest('.container-lesson, [id^="LEC_L"], [id^="lec_l"]') : null;
            if (padreCont && contenedoresProcesados.has(padreCont)) continue;

            const rawAttr = el.getAttribute('data-link') || el.getAttribute('href');
            if (!rawAttr || !esUrlRecurso(rawAttr)) continue;

            let rawUrl = rawAttr;
            try { rawUrl = new URL(rawAttr, window.location.href).href; } catch {}

            const urlNorm = normalizarUrl(rawUrl);
            if (vistos.has(urlNorm)) continue;

            let codigo = extraerCodigoElemento(el, doc, padreCont, rawUrl);
            if (/^(english|español|saltar|salir)/i.test(codigo.trim())) continue;

            const esPdfDirecto = esUrlPdfDirecto(rawUrl);
            const esModRes = /\/mod\/resource\/|\/mod_resource\//i.test(rawUrl);

            if (!padreCont) {
                if (esPdfDirecto) {
                    const nomPdf = extraerNombreArchivoPdf(rawUrl) || '';
                    if (!REGEX_CODIGO_LECCION.test(nomPdf) && !REGEX_CODIGO_LECCION.test(codigo)) {
                        continue;
                    }
                    if (!codigo || codigo === SIN_TITULO || !REGEX_CODIGO_LECCION.test(codigo)) {
                        codigo = nomPdf.replace(/\.pdf$/i, '');
                    }
                } else if (esModRes) {
                    const numRes = extraerNumeroLeccion(codigo) ?? 999;
                    const tituloRes = obtenerNombrePLeccion(el, doc, padreCont, numRes, codigo, mapaPLeccion);
                    vistos.add(urlNorm);
                    encontrados.push({
                        codigo: codigo,
                        titulo: tituloRes,
                        url: rawUrl,
                        tipo: 'pdf',
                        numero: numRes,
                        requiereValidarSaltoPdf: true
                    });
                    continue;
                } else if (!el.classList || !el.classList.contains('img-leccion')) {
                    continue;
                }
            }

            if (!codigo || codigo === SIN_TITULO) continue;

            const num = extraerNumeroLeccion(codigo);
            if (num !== null && numerosConGenially.has(num) && !esPdfDirecto && !esModRes) continue;

            const tituloVisual = obtenerNombrePLeccion(el, doc, padreCont, num, codigo, mapaPLeccion);

            vistos.add(urlNorm);
            encontrados.push({
                codigo: codigo,
                titulo: tituloVisual,
                url: rawUrl,
                tipo: determinarTipoRecurso(rawUrl),
                numero: num !== null ? num : 999
            });
        }

        return encontrados;
    }

    function encontrarIframesEnDocumento(doc = document) {
        return encontrarLeccionesEnDocumento(doc);
    }

    // --- RESOLUCIÓN PROFUNDA DE DESTINOS SCORM Y SALTOS A PDF (COMO L3_Comic.pdf) ---

    function normalizarHtmlScorm(texto) {
        if (!texto) return '';
        let limpio = String(texto)
            .replace(/\\u0026/gi, '&')
            .replace(/\\u002f/gi, '/')
            .replace(/\\x26/gi, '&')
            .replace(/\\\//g, '/')
            .replace(/\\"/g, '"')
            .replace(/&amp;/gi, '&');
        try {
            if (/%2F|%3A|%3F|%26/i.test(limpio)) {
                limpio += ' ' + decodeURIComponent(limpio);
            }
        } catch {}
        return limpio;
    }

    function extraerRutaContent(texto) {
        if (!texto) return null;
        const limpio = normalizarHtmlScorm(texto);

        const match = limpio.match(/(https?:\/\/[^"'\s<>\\]+\/pluginfile\.php\/\d+\/mod_scorm\/content\/\d+\/)/i);
        if (match) return match[1];

        const matchRel = limpio.match(/(\/pluginfile\.php\/\d+\/mod_scorm\/content\/\d+\/)/i);
        if (matchRel) {
            try {
                return new URL(matchRel[1], window.location.origin).href;
            } catch {}
        }
        return null;
    }

    function extraerUrlPdfDesdeTexto(texto, baseUrl = window.location.origin) {
        if (!texto) return null;
        const limpio = normalizarHtmlScorm(texto);

        const matchAbs = limpio.match(/(https?:\/\/[^"'\s<>\\]+\/pluginfile\.php\/\d+\/[^"'\s<>\\]+\.pdf(?:\?[^"'\s<>\\]*)?)/i);
        if (matchAbs) return matchAbs[1];

        const matchRel = limpio.match(/(\/pluginfile\.php\/\d+\/[^"'\s<>\\]+\.pdf(?:\?[^"'\s<>\\]*)?)/i);
        if (matchRel) {
            try {
                return new URL(matchRel[1], baseUrl).href;
            } catch {}
        }
        return null;
    }

    function extraerUrlLoadSco(html, baseUrl) {
        if (!html) return null;
        try {
            const doc = new DOMParser().parseFromString(html, 'text/html');
            const el = doc.querySelector('iframe[src*="loadSCO.php"], #scorm_object[src], object[data*="loadSCO.php"], a[href*="loadSCO.php"]');
            if (el) {
                const raw = el.getAttribute('src') || el.getAttribute('data') || el.getAttribute('href');
                if (raw) return new URL(raw.replace(/&amp;/gi, '&'), baseUrl).href;
            }
        } catch {}

        const limpio = normalizarHtmlScorm(html);
        const matchSco = limpio.match(/((?:https?:\/\/[^"'\s<>\\]+|[a-zA-Z0-9_./:-]*)\bloadSCO\.php\?[^"'\s<>\\]+)/i);
        if (matchSco) {
            try {
                return new URL(matchSco[1], baseUrl).href;
            } catch {}
        }
        return null;
    }

    function extraerParametrosScorm(html, pageUrl, previo = {}) {
        const out = {
            cmId: previo.cmId || '',
            aId: previo.aId || '',
            scoid: previo.scoid || '',
            currentorg: previo.currentorg || '',
            mode: previo.mode || '',
            attempt: previo.attempt || '1'
        };

        if (pageUrl) {
            try {
                const u = new URL(pageUrl, window.location.origin);
                if (u.searchParams.get('id') && /view\.php/i.test(u.pathname)) out.cmId = out.cmId || u.searchParams.get('id');
                if (u.searchParams.get('cm')) out.cmId = u.searchParams.get('cm');
                if (u.searchParams.get('a')) out.aId = u.searchParams.get('a');
                if (u.searchParams.get('scoid')) out.scoid = u.searchParams.get('scoid');
                if (u.searchParams.get('currentorg')) out.currentorg = u.searchParams.get('currentorg');
            } catch {}
        }

        if (!html) return out;
        const limpio = normalizarHtmlScorm(html);

        try {
            const doc = new DOMParser().parseFromString(html, 'text/html');
            const formScope = doc.querySelector('form#scormviewform, form[action*="player.php"]') || doc;
            for (const input of formScope.querySelectorAll('input[name], select[name]')) {
                const name = (input.getAttribute('name') || '').toLowerCase();
                const type = (input.getAttribute('type') || '').toLowerCase();
                if ((type === 'radio' || type === 'checkbox') && !input.checked && !input.hasAttribute('checked')) continue;
                const val = (input.value || input.getAttribute('value') || '').trim();
                if (!val) continue;
                if ((name === 'cm' || name === 'id') && /^[1-9]\d*$/.test(val)) out.cmId = out.cmId || val;
                if (name === 'a' && /^[1-9]\d*$/.test(val)) out.aId = out.aId || val;
                if (name === 'scoid' && /^[1-9]\d*$/.test(val)) out.scoid = out.scoid || val;
                if (name === 'currentorg') out.currentorg = out.currentorg || val;
                if (name === 'mode') out.mode = out.mode || val;
                if (name === 'attempt') out.attempt = out.attempt || val;
            }
        } catch {}

        // 1. Extraer combinación directa a=XXXX&scoid=YYYY (presente en player.php y en el JSON de M.mod_scorm.init)
        const mCombo = limpio.match(/(?:^|[^a-zA-Z0-9_])a=([1-9]\d*)&scoid=([1-9]\d*)(?:&currentorg=([^&"'\s<>\\]*))?(?:&mode=([^&"'\s<>\\]*))?(?:&attempt=(\d+))?/i);
        if (mCombo) {
            out.aId = mCombo[1];
            out.scoid = mCombo[2];
            if (mCombo[3] && !out.currentorg) {
                try { out.currentorg = decodeURIComponent(mCombo[3]); } catch { out.currentorg = mCombo[3]; }
            }
            if (mCombo[4] && !out.mode) out.mode = mCombo[4];
            if (mCombo[5]) out.attempt = mCombo[5];
        }

        // 2. Respaldo individual de parámetros en URLs o JSON
        const mScoid = limpio.match(/[?&]scoid=([1-9]\d*)/i) || limpio.match(/["']scoid["']\s*[:=,]\s*["']?([1-9]\d*)/i);
        if (mScoid && !out.scoid) out.scoid = mScoid[1];

        const mCm = limpio.match(/[?&]cm=([1-9]\d*)/i);
        if (mCm && !out.cmId) out.cmId = mCm[1];

        const mA = limpio.match(/(?:[?&]|["'])a=([1-9]\d*)(?:&|["'])/i);
        if (mA && !out.aId) out.aId = mA[1];

        const mOrg = limpio.match(/[?&]currentorg=([^&"'\s<>\\]+)/i);
        if (mOrg && !out.currentorg) {
            try { out.currentorg = decodeURIComponent(mOrg[1]); } catch { out.currentorg = mOrg[1]; }
        }

        // 3. Extraer desde M.mod_scorm.init(Y, ..., launch_sco, {TOC_JSON}, currentorg, aId, cmId, attempt, mode, ...)
        const idxInit = limpio.search(/M\.mod_scorm\.init\s*\(/i);
        if (idxInit !== -1) {
            const argsStr = limpio.slice(idxInit, idxInit + 25000);
            if (!out.scoid) {
                const mLaunchSco = argsStr.match(/,\s*["']?([1-9]\d*)["']?\s*,\s*(?:\{\s*["']|null\b)/);
                if (mLaunchSco) out.scoid = mLaunchSco[1];
            }
            if (out.cmId) {
                const reBeforeCm = new RegExp('["\']([^"\']*)["\']\\s*,\\s*["\']?([1-9]\\d*)["\']?\\s*,\\s*["\']?' + out.cmId + '["\']?\\b');
                const mBeforeCm = argsStr.match(reBeforeCm);
                if (mBeforeCm) {
                    if (!out.currentorg && mBeforeCm[1]) out.currentorg = mBeforeCm[1];
                    if (!out.aId && mBeforeCm[2]) out.aId = mBeforeCm[2];
                }
            }
        }

        return out;
    }

    async function probarLoadSco(urlSco) {
        if (!urlSco) return null;
        try {
            const resSco = await fetchConReintento(urlSco, { credentials: 'include' }, 2, 400);
            if (esUrlPdfDirecto(resSco.url)) {
                try { if (resSco.body) resSco.body.cancel(); } catch {}
                return { tipo: 'pdf', url: resSco.url };
            }
            const desdeUrl = extraerRutaContent(resSco.url);
            if (desdeUrl) return { tipo: 'scorm', url: desdeUrl, launchUrl: resSco.url };

            if (resSco.ok) {
                const cType = (resSco.headers.get('content-type') || '').toLowerCase();
                if (cType.includes('application/pdf')) {
                    return { tipo: 'pdf', url: resSco.url || urlSco };
                }
                const htmlSco = await resSco.text();
                const pdfEnHtml = extraerUrlPdfDesdeTexto(htmlSco, resSco.url || urlSco);
                if (pdfEnHtml) return { tipo: 'pdf', url: pdfEnHtml };

                const desdeHtml = extraerRutaContent(htmlSco);
                if (desdeHtml) return { tipo: 'scorm', url: desdeHtml };
            }
        } catch {}
        return null;
    }

    async function probarCandidatosLoadSco(origin, p) {
        const candidatos = [];
        const orgParam = p.currentorg ? `&currentorg=${encodeURIComponent(p.currentorg)}&mode=${encodeURIComponent(p.mode || '')}&attempt=${encodeURIComponent(p.attempt || '1')}` : '';

        if (p.aId && p.scoid) {
            if (orgParam) candidatos.push(`${origin}/mod/scorm/loadSCO.php?a=${encodeURIComponent(p.aId)}&scoid=${encodeURIComponent(p.scoid)}${orgParam}`);
            candidatos.push(`${origin}/mod/scorm/loadSCO.php?a=${encodeURIComponent(p.aId)}&scoid=${encodeURIComponent(p.scoid)}`);
        }
        if (p.cmId && p.scoid) {
            if (orgParam) candidatos.push(`${origin}/mod/scorm/loadSCO.php?id=${encodeURIComponent(p.cmId)}&scoid=${encodeURIComponent(p.scoid)}${orgParam}`);
            candidatos.push(`${origin}/mod/scorm/loadSCO.php?id=${encodeURIComponent(p.cmId)}&scoid=${encodeURIComponent(p.scoid)}`);
        }
        if (p.cmId) {
            candidatos.push(`${origin}/mod/scorm/loadSCO.php?id=${encodeURIComponent(p.cmId)}`);
        }

        for (const cand of candidatos) {
            const resultado = await probarLoadSco(cand);
            if (resultado) return resultado;
        }
        return null;
    }

    async function resolverDestinoRecurso(url, opciones = {}) {
        const descargarBlobPdf = Boolean(opciones.descargarBlobPdf);

        if (esUrlPdfDirecto(url)) {
            return { tipo: 'pdf', url: new URL(url, window.location.href).href };
        }

        const directo = extraerRutaContent(url);
        if (directo) return { tipo: 'scorm', url: directo, launchUrl: url };

        try {
            const uObj = new URL(url, window.location.href);
            const origin = uObj.origin;
            let estadoParams = extraerParametrosScorm('', uObj.href, {});

            const resView = await fetchConReintento(uObj.href, { credentials: 'include' }, 3, 450);
            const baseActual = resView.url || uObj.href;
            const cTypeView = (resView.headers.get('content-type') || '').toLowerCase();

            if (esUrlPdfDirecto(baseActual) || cTypeView.includes('application/pdf')) {
                if (descargarBlobPdf) {
                    const blobPdf = await resView.blob();
                    return { tipo: 'pdf', url: baseActual, blob: blobPdf };
                }
                try { if (resView.body) resView.body.cancel(); } catch {}
                return { tipo: 'pdf', url: baseActual };
            }

            const desdeViewUrl = extraerRutaContent(baseActual);
            if (desdeViewUrl) return { tipo: 'scorm', url: desdeViewUrl, launchUrl: baseActual };

            if (!resView.ok) return null;
            const htmlView = await resView.text();

            const pdfEnView = extraerUrlPdfDesdeTexto(htmlView, baseActual);
            if (pdfEnView) return { tipo: 'pdf', url: pdfEnView };

            const desdeViewHtml = extraerRutaContent(htmlView);
            if (desdeViewHtml) return { tipo: 'scorm', url: desdeViewHtml };

            estadoParams = extraerParametrosScorm(htmlView, baseActual, estadoParams);

            const urlScoDirecto = extraerUrlLoadSco(htmlView, baseActual);
            if (urlScoDirecto) {
                const resDirecto = await probarLoadSco(urlScoDirecto);
                if (resDirecto) return resDirecto;
            }

            if (estadoParams.scoid && (estadoParams.aId || estadoParams.cmId)) {
                const desdeParamsView = await probarCandidatosLoadSco(origin, estadoParams);
                if (desdeParamsView) return desdeParamsView;
            }

            const docView = new DOMParser().parseFromString(htmlView, 'text/html');
            const form = docView.querySelector('form#scormviewform, form[action*="player.php"]');
            const formParams = new URLSearchParams();

            if (form) {
                for (const input of form.querySelectorAll('input, select')) {
                    const name = input.getAttribute('name');
                    if (!name) continue;
                    const type = (input.getAttribute('type') || '').toLowerCase();
                    if ((type === 'radio' || type === 'checkbox') && !input.checked && !input.hasAttribute('checked')) continue;
                    formParams.set(name, input.value || input.getAttribute('value') || '');
                }
            }

            if (!formParams.get('cm') && estadoParams.cmId) formParams.set('cm', estadoParams.cmId);
            if (!formParams.get('scoid') && estadoParams.scoid) formParams.set('scoid', estadoParams.scoid);
            if (!formParams.get('a') && estadoParams.aId) formParams.set('a', estadoParams.aId);
            if (!formParams.get('currentorg') && estadoParams.currentorg) formParams.set('currentorg', estadoParams.currentorg);

            let urlPlayer = `${origin}/mod/scorm/player.php`;
            if (form && form.getAttribute('action')) {
                urlPlayer = new URL(form.getAttribute('action').replace(/&amp;/gi, '&'), baseActual).href;
            } else {
                const linkPlayer = docView.querySelector('a[href*="player.php"], iframe[src*="player.php"]');
                if (linkPlayer) {
                    const href = linkPlayer.getAttribute('href') || linkPlayer.getAttribute('src');
                    if (href) urlPlayer = new URL(href.replace(/&amp;/gi, '&'), baseActual).href;
                }
            }

            const intentosPlayer = [];
            if (Array.from(formParams.keys()).length > 0) {
                intentosPlayer.push(() => fetchConReintento(urlPlayer, {
                    method: 'POST',
                    credentials: 'include',
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    body: formParams.toString()
                }, 2, 450));
            }

            const sep = urlPlayer.includes('?') ? '&' : '?';
            const urlPlayerGet = Array.from(formParams.keys()).length > 0 ? `${urlPlayer}${sep}${formParams.toString()}` : urlPlayer;
            intentosPlayer.push(() => fetchConReintento(urlPlayerGet, { credentials: 'include' }, 2, 450));

            for (const ejecutarFetchPlayer of intentosPlayer) {
                try {
                    const resPlayer = await ejecutarFetchPlayer();
                    if (esUrlPdfDirecto(resPlayer.url)) {
                        try { if (resPlayer.body) resPlayer.body.cancel(); } catch {}
                        return { tipo: 'pdf', url: resPlayer.url };
                    }
                    const desdePlayerUrl = extraerRutaContent(resPlayer.url);
                    if (desdePlayerUrl) return { tipo: 'scorm', url: desdePlayerUrl, launchUrl: resPlayer.url };

                    if (resPlayer.ok) {
                        const htmlPlayer = await resPlayer.text();
                        const pdfEnPlayer = extraerUrlPdfDesdeTexto(htmlPlayer, resPlayer.url || urlPlayer);
                        if (pdfEnPlayer) return { tipo: 'pdf', url: pdfEnPlayer };

                        const desdePlayerHtml = extraerRutaContent(htmlPlayer);
                        if (desdePlayerHtml) return { tipo: 'scorm', url: desdePlayerHtml };

                        estadoParams = extraerParametrosScorm(htmlPlayer, resPlayer.url || urlPlayer, estadoParams);

                        const urlSco = extraerUrlLoadSco(htmlPlayer, resPlayer.url || urlPlayer);
                        if (urlSco) {
                            const resSco = await probarLoadSco(urlSco);
                            if (resSco) return resSco;
                        }

                        if (estadoParams.scoid) {
                            const desdeParamsPlayer = await probarCandidatosLoadSco(origin, estadoParams);
                            if (desdeParamsPlayer) return desdeParamsPlayer;
                        }
                    }
                } catch {}
            }

            return await probarCandidatosLoadSco(origin, estadoParams);
        } catch (e) {
            console.warn('[UVEG Bloc Notas] Error al resolver destino del recurso:', e);
        }
        return null;
    }

    async function validarItemsModResource(lista) {
        const resultado = [];
        const mapaPLeccion = cargarMapaPLeccion(obtenerIdCurso());
        for (const item of lista) {
            if (!item.requiereValidarSaltoPdf) {
                resultado.push(item);
                continue;
            }
            try {
                const destino = await resolverDestinoRecurso(item.url, { descargarBlobPdf: false });
                if (destino && destino.tipo === 'pdf') {
                    const nomPdf = extraerNombreArchivoPdf(destino.url) || '';
                    if (REGEX_CODIGO_LECCION.test(nomPdf)) {
                        const codigoPdf = nomPdf.replace(/\.pdf$/i, '').trim();
                        const numPdf = extraerNumeroLeccion(codigoPdf) ?? item.numero ?? 999;
                        const tituloVisual = (numPdf !== null && numPdf !== 999 && mapaPLeccion[String(numPdf)])
                            ? mapaPLeccion[String(numPdf)]
                            : codigoPdf;
                        resultado.push({
                            codigo: codigoPdf,
                            titulo: tituloVisual,
                            url: destino.url,
                            tipo: 'pdf',
                            numero: numPdf
                        });
                    }
                }
            } catch {}
        }
        return resultado;
    }

    // Recorrido secuencial con reintento de las secciones 2, 3 y 4 del curso (evita bloqueo de sesión PHP en Moodle)
    async function escanearTodasLasSecciones(courseId) {
        if (escaneandoSecciones || !courseId || hostname === 'localhost' || hostname === '127.0.0.1' || window.location.protocol === 'file:') {
            return;
        }

        if (ultimoCursoEscaneado === courseId && itemsAcumulados.length > 0) {
            return;
        }

        escaneandoSecciones = true;
        ultimoCursoEscaneado = courseId;

        const secciones = [2, 3, 4];

        // Mostrar estado de carga limpio
        renderizarEstadoCarga();

        // Peticiones secuenciales con reintento para evitar colisión de MoodleSession
        for (const sec of secciones) {
            try {
                const urlSec = `${window.location.origin}/course/view.php?id=${courseId}&mainsection=${sec}`;
                const respuesta = await fetchConReintento(urlSec, { credentials: 'include' }, 3, 500);
                if (!respuesta.ok) continue;

                const html = await respuesta.text();
                const parser = new DOMParser();
                const docSec = parser.parseFromString(html, 'text/html');

                const nuevosRaw = encontrarIframesEnDocumento(docSec);
                const nuevos = await validarItemsModResource(nuevosRaw);

                for (const item of nuevos) {
                    const norm = normalizarUrl(item.url);
                    if (!itemsAcumulados.some(it => normalizarUrl(it.url) === norm)) {
                        itemsAcumulados.push(item);
                    }
                }
            } catch (err) {
                console.warn(`[UVEG Extensión] Error al obtener sección ${sec}:`, err);
            }
        }

        // Filtrar cualquier item local pendiente de validación de salto PDF
        itemsAcumulados = await validarItemsModResource(itemsAcumulados);

        escaneandoSecciones = false;

        // Ordenar todos los items acumulados por número de lección (L1, L2, L3... L12)
        itemsAcumulados = ordenarPorTitulo(itemsAcumulados);
        firmaActual = JSON.stringify(itemsAcumulados);
        renderizar(itemsAcumulados);
    }

    async function copiarAlPortapapeles(texto) {
        try {
            await navigator.clipboard.writeText(texto);
            return true;
        } catch {
            const area = document.createElement('textarea');
            area.value = texto;
            area.style.cssText = 'position:fixed;top:0;left:0;opacity:0;pointer-events:none;';
            document.body.appendChild(area);
            area.focus();
            area.select();
            let copiado = false;
            try {
                copiado = document.execCommand('copy');
            } catch {
                copiado = false;
            }
            area.remove();
            return copiado;
        }
    }

    function formatearItem(item) {
        return `titulo: ${item.titulo}\nurl: ${item.url}`;
    }

    const ESTILOS = `
        :host {
            all: initial;
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 0;
            z-index: 2147483647;
            pointer-events: none;
            font-family: system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
        }

        .tarjeta-flotante {
            pointer-events: auto;
            position: fixed;
            left: 18px;
            top: 50%;
            transform: translateY(-50%);
            width: 335px;
            max-width: calc(100vw - 36px);
            background: #ffffff;
            color: #0f172a;
            border-radius: 16px;
            border: 1px solid #cbd5e1;
            box-shadow: 0 16px 36px -4px rgba(30, 64, 175, 0.18), 0 4px 14px rgba(0, 0, 0, 0.08);
            display: flex;
            flex-direction: column;
            overflow: hidden;
            animation: deslizarEntrada 0.25s cubic-bezier(0.16, 1, 0.3, 1);
            user-select: none;
        }

        /* Cabecera Arrastrable */
        .cabecera {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 13px 15px 11px;
            border-bottom: 1px solid #f1f5f9;
            cursor: grab;
            background: #ffffff;
        }

        .cabecera:active {
            cursor: grabbing;
        }

        .cabecera-info {
            display: flex;
            align-items: center;
            gap: 10px;
        }

        .icono-caja {
            width: 36px;
            height: 36px;
            border-radius: 10px;
            background: #1e40af;
            color: #ffffff;
            display: flex;
            align-items: center;
            justify-content: center;
            flex-shrink: 0;
            box-shadow: 0 2px 5px rgba(30, 64, 175, 0.28);
        }

        .icono-caja svg {
            width: 20px;
            height: 20px;
            fill: none;
            stroke: currentColor;
            stroke-width: 2;
            stroke-linecap: round;
            stroke-linejoin: round;
        }

        .titulos-caja {
            display: flex;
            flex-direction: column;
        }

        .titulo-app {
            font-size: 16px;
            font-weight: 800;
            color: #1e40af;
            line-height: 1.2;
            letter-spacing: -0.2px;
        }

        .subtitulo-app {
            font-size: 11px;
            color: #64748b;
            font-weight: 600;
        }

        .cabecera-acciones {
            display: flex;
            align-items: center;
            gap: 6px;
        }

        .btn-copiar-todo-mini {
            display: inline-flex;
            align-items: center;
            gap: 4px;
            padding: 5px 9px;
            border-radius: 6px;
            border: 1px solid #bfdbfe;
            background: #eff6ff;
            color: #1e40af;
            font-size: 11.5px;
            font-weight: 700;
            cursor: pointer;
            transition: all 0.15s ease;
        }

        .btn-copiar-todo-mini:hover {
            background: #dbeafe;
            color: #1e3a8a;
        }

        .btn-copiar-todo-mini.copiado-exito {
            background: #059669 !important;
            color: #ffffff !important;
            border-color: #059669 !important;
        }

        .btn-cerrar {
            width: 26px;
            height: 26px;
            border-radius: 6px;
            border: 0;
            background: transparent;
            color: #94a3b8;
            font-size: 16px;
            line-height: 1;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            transition: all 0.15s ease;
        }

        .btn-cerrar:hover {
            background: #f1f5f9;
            color: #0f172a;
        }

        /* Sección de etiquetas */
        .seccion-label-fila {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 10px 16px 4px;
        }

        .seccion-label {
            font-size: 11px;
            font-weight: 800;
            letter-spacing: 0.6px;
            color: #1e40af;
            text-transform: uppercase;
        }

        /* Lista vertical con scroll */
        .lista-scroll {
            padding: 4px 14px 10px;
            display: flex;
            flex-direction: column;
            gap: 8px;
            position: relative;
            overflow-y: auto;
            scrollbar-width: thin;
            scrollbar-color: #cbd5e1 transparent;
        }

        /* Si hay más de 6 recursos, se activa el scroll limitando la altura visible */
        .lista-scroll.con-scroll {
            max-height: 365px;
        }

        .lista-scroll::-webkit-scrollbar {
            width: 6px;
        }
        .lista-scroll::-webkit-scrollbar-track {
            background: transparent;
        }
        .lista-scroll::-webkit-scrollbar-thumb {
            background: #cbd5e1;
            border-radius: 4px;
        }
        .lista-scroll::-webkit-scrollbar-thumb:hover {
            background: #94a3b8;
        }

        /* Tarjeta vertical de cada recurso (con borde azul UVEG) */
        .item-tarjeta {
            border: 1.5px solid #1e40af;
            border-radius: 12px;
            padding: 10px 12px;
            background: #ffffff;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 10px;
            transition: all 0.15s ease;
        }

        .item-tarjeta:hover {
            background: #f0f7ff;
            border-color: #1d4ed8;
            transform: translateY(-1px);
            box-shadow: 0 3px 8px rgba(30, 64, 175, 0.15);
        }

        .item-tarjeta.copiado-exito {
            border-color: #059669 !important;
            background: #ecfdf5 !important;
        }

        .item-titulo {
            font-size: 12.5px;
            font-weight: 700;
            color: #1e293b;
            line-height: 1.35;
            flex: 1;
            word-break: break-word;
        }

        .item-tarjeta.copiado-exito .item-titulo {
            color: #065f46;
        }

        /* Botón intuitivo de Copiar con Icono en Azul UVEG */
        .item-acciones {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            flex-shrink: 0;
        }
        .btn-descargar-item {
            display: inline-flex;
            align-items: center;
            gap: 5px;
            padding: 5px 9px;
            border-radius: 7px;
            border: 1.5px solid #059669;
            background: #ecfdf5;
            color: #059669;
            font-size: 11.5px;
            font-weight: 700;
            cursor: pointer;
            flex-shrink: 0;
            transition: all 0.15s ease;
        }
        .btn-descargar-item:hover {
            background: #d1fae5;
            border-color: #047857;
            color: #047857;
            transform: translateY(-1px);
        }
        .btn-descargar-item svg {
            width: 13px;
            height: 13px;
            stroke: currentColor;
            stroke-width: 2.2;
            fill: none;
            stroke-linecap: round;
            stroke-linejoin: round;
        }
        .btn-descargar-item.descargando {
            opacity: 0.85;
            pointer-events: none;
            background: #fef3c7;
            border-color: #d97706;
            color: #b45309;
        }
        .btn-descargar-item.descargado-exito {
            background: #059669;
            border-color: #047857;
            color: #ffffff;
        }
        .btn-copiar-item {
            display: inline-flex;
            align-items: center;
            gap: 5px;
            padding: 5px 9px;
            border-radius: 7px;
            border: 1.5px solid #1e40af;
            background: #eff6ff;
            color: #1e40af;
            font-size: 11.5px;
            font-weight: 700;
            cursor: pointer;
            flex-shrink: 0;
            transition: all 0.15s ease;
        }

        .btn-copiar-item svg {
            width: 12px;
            height: 12px;
            stroke: currentColor;
            fill: none;
            stroke-width: 2;
            stroke-linecap: round;
            stroke-linejoin: round;
            flex-shrink: 0;
        }

        .btn-copiar-item:hover {
            background: #dbeafe;
            border-color: #1d4ed8;
            color: #1e3a8a;
            transform: scale(1.02);
        }

        .item-tarjeta.copiado-exito .btn-copiar-item {
            background: #059669 !important;
            border-color: #059669 !important;
            color: #ffffff !important;
        }

        /* Pie de la tarjeta: Botón en Azul UVEG (#1e40af) */
        .pie-caja {
            padding: 10px 14px 12px;
            border-top: 1px solid #f1f5f9;
            background: #ffffff;
        }

        .btn-pie-cerrar {
            width: 100%;
            padding: 10px 14px;
            border-radius: 10px;
            border: 0;
            background: #1e40af;
            color: #ffffff;
            font-size: 13px;
            font-weight: 700;
            cursor: pointer;
            transition: background 0.15s, transform 0.1s;
            text-align: center;
            box-shadow: 0 2px 6px rgba(30, 64, 175, 0.25);
        }

        .btn-pie-cerrar:hover {
            background: #1d4ed8;
        }

        .btn-pie-cerrar:active {
            background: #1e3a8a;
            transform: scale(0.99);
        }

        .btn-pie-cerrar.copiado-exito {
            background: #059669 !important;
        }

        /* Estado de carga */
        .contenedor-carga {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            padding: 30px 16px;
            gap: 12px;
        }

        .spinner-azul {
            width: 32px;
            height: 32px;
            border: 3px solid #dbeafe;
            border-top-color: #1e40af;
            border-radius: 50%;
            animation: girar 0.8s linear infinite;
        }

        .texto-carga {
            font-size: 12px;
            font-weight: 600;
            color: #475569;
            text-align: center;
            line-height: 1.4;
        }

        @keyframes girar {
            to { transform: rotate(360deg); }
        }

        @keyframes deslizarEntrada {
            from {
                opacity: 0;
                transform: translateY(-50%) translateX(-18px);
            }
            to {
                opacity: 1;
                transform: translateY(-50%) translateX(0);
            }
        }
    `;

    function asegurarHost() {
        if (host && host.isConnected) return;

        host = document.createElement('div');
        host.id = ID_HOST;

        const shadow = host.attachShadow({ mode: 'closed' });
        const style = document.createElement('style');
        style.textContent = ESTILOS;

        contenedor = document.createElement('div');
        contenedor.className = 'tarjeta-flotante';
        contenedor.setAttribute('role', 'dialog');
        contenedor.setAttribute('aria-label', 'Recursos detectados UVEG');

        shadow.appendChild(style);
        shadow.appendChild(contenedor);
        document.documentElement.appendChild(host);

        // Activar Drag & Drop arrastrable
        habilitarArrastre(contenedor);
    }

    function quitarHost() {
        if (host) {
            host.remove();
            host = null;
            contenedor = null;
        }
    }

    // Lógica para arrastrar libremente la ventana con el ratón
    function habilitarArrastre(elemento) {
        let arrastrando = false;
        let startX, startY;
        let initialLeft, initialTop;

        elemento.addEventListener('mousedown', (e) => {
            const target = e.composedPath ? e.composedPath()[0] : e.target;
            if (target.closest('button') || !target.closest('.cabecera')) {
                return;
            }

            arrastrando = true;
            const rect = elemento.getBoundingClientRect();
            startX = e.clientX;
            startY = e.clientY;
            initialLeft = rect.left;
            initialTop = rect.top;

            elemento.style.left = initialLeft + 'px';
            elemento.style.top = initialTop + 'px';
            elemento.style.transform = 'none';

            e.preventDefault();
        });

        window.addEventListener('mousemove', (e) => {
            if (!arrastrando) return;

            const deltaX = e.clientX - startX;
            const deltaY = e.clientY - startY;

            let newLeft = initialLeft + deltaX;
            let newTop = initialTop + deltaY;

            const rect = elemento.getBoundingClientRect();
            newLeft = Math.max(10, Math.min(newLeft, window.innerWidth - rect.width - 10));
            newTop = Math.max(10, Math.min(newTop, window.innerHeight - rect.height - 10));

            elemento.style.left = newLeft + 'px';
            elemento.style.top = newTop + 'px';
        });

        window.addEventListener('mouseup', () => {
            arrastrando = false;
        });
    }

    const SVG_COPIAR = `<svg viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`;
    const SVG_CHECK = `<svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
    const SVG_DESCARGAR = `<svg viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>`;

    // Vista de espera mientras se obtienen los recursos
    function renderizarEstadoCarga() {
        asegurarHost();
        contenedor.innerHTML = '';

        const cabecera = document.createElement('div');
        cabecera.className = 'cabecera';
        cabecera.innerHTML = `
            <div class="cabecera-info">
                <div class="icono-caja">
                    <svg viewBox="0 0 24 24"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path></svg>
                </div>
                <div class="titulos-caja">
                    <span class="titulo-app">UVEG</span>
                    <span class="subtitulo-app">Cargando recursos...</span>
                </div>
            </div>
            <button type="button" class="btn-cerrar" title="Cerrar">✕</button>
        `;

        cabecera.querySelector('.btn-cerrar').addEventListener('click', () => {
            cerrarWidget();
        });

        const carga = document.createElement('div');
        carga.className = 'contenedor-carga';
        carga.innerHTML = `
            <div class="spinner-azul"></div>
            <div class="texto-carga">
                Cargando recursos del curso...<br>
                <span style="font-size:11px;color:#64748b;">(Espera un momento)</span>
            </div>
        `;

        contenedor.appendChild(cabecera);
        contenedor.appendChild(carga);
    }

    // --- MOTOR ZIP AUTÓNOMO COMPATIBLE CON WINDOWS EXPLORER ---
    const crcTable = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
        let c = i;
        for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
        crcTable[i] = c;
    }
    function calcCRC32(buf) {
        let crc = 0xFFFFFFFF;
        for (let i = 0; i < buf.length; i++) crc = crcTable[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8);
        return (crc ^ 0xFFFFFFFF) >>> 0;
    }

    class VanillaZipEngine {
        constructor() { this.files = []; }
        add(name, uint8) { this.files.push({ name: name.replace(/^\/+/, ''), data: uint8 }); }
        buildBlob() {
            const parts = [];
            const central = [];
            let offset = 0;
            const enc = new TextEncoder();
            const dosTime = 0x6000;
            const dosDate = 0x58A1;

            for (const f of this.files) {
                const nb = enc.encode(f.name);
                const crc = calcCRC32(f.data);
                const size = f.data.length;

                const h = new Uint8Array(30);
                const hv = new DataView(h.buffer);
                hv.setUint32(0, 0x04034b50, true);
                hv.setUint16(4, 20, true);
                hv.setUint16(6, 0x0800, true);
                hv.setUint16(8, 0, true);
                hv.setUint16(10, dosTime, true);
                hv.setUint16(12, dosDate, true);
                hv.setUint32(14, crc, true);
                hv.setUint32(18, size, true);
                hv.setUint32(22, size, true);
                hv.setUint16(26, nb.length, true);
                parts.push(h, nb, f.data);

                const ch = new Uint8Array(46);
                const chv = new DataView(ch.buffer);
                chv.setUint32(0, 0x02014b50, true);
                chv.setUint16(4, 20, true);
                chv.setUint16(6, 20, true);
                chv.setUint16(8, 0x0800, true);
                chv.setUint16(10, 0, true);
                chv.setUint16(12, dosTime, true);
                chv.setUint16(14, dosDate, true);
                chv.setUint32(16, crc, true);
                chv.setUint32(20, size, true);
                chv.setUint32(24, size, true);
                chv.setUint16(28, nb.length, true);
                chv.setUint32(38, 0x20, true); // Archive attribute para Windows
                chv.setUint32(42, offset, true);

                central.push(ch, nb);
                offset += h.length + nb.length + size;
            }

            const cdOffset = offset;
            let cdSize = 0;
            for (const p of central) cdSize += p.length;

            const eocd = new Uint8Array(22);
            const ev = new DataView(eocd.buffer);
            ev.setUint32(0, 0x06054b50, true);
            ev.setUint16(8, this.files.length, true);
            ev.setUint16(10, this.files.length, true);
            ev.setUint32(12, cdSize, true);
            ev.setUint32(16, cdOffset, true);

            return new Blob([...parts, ...central, eocd], { type: 'application/zip' });
        }
    }

    function dispararDescargaNavegador(blob, nombreArchivo) {
        const blobUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = nombreArchivo;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
    }

    function limpiarRutaManifest(rutaRaw) {
        if (!rutaRaw) return '';
        return String(rutaRaw)
            .trim()
            .replace(/&amp;/gi, '&')
            .replace(/\\/g, '/')
            .replace(/^(\.\/|\/)+/, '');
    }

    async function descargarLeccionScormOPdf(item, btnElement) {
        if (!btnElement || btnElement.classList.contains('descargando')) return;

        descargasActivas++;
        btnElement.classList.add('descargando');
        btnElement.innerHTML = `<span>Buscando...</span>`;

        try {
            const destino = await resolverDestinoRecurso(item.url, { descargarBlobPdf: true });
            if (!destino) {
                throw new Error('No se pudo localizar el paquete SCORM o PDF');
            }

            const baseNombre = item.codigo || item.titulo || 'leccion';
            const slug = baseNombre
                .normalize('NFD')
                .replace(/[\u0300-\u036f]/g, '')
                .replace(/[^a-zA-Z0-9_-]/g, '_')
                .replace(/_+/g, '_')
                .replace(/^_|_$/g, '')
                .substring(0, 50) || 'leccion';

            // Caso 1: El recurso es un PDF directo o dio un salto hacia un PDF (ej. L3_Comic.pdf)
            if (destino.tipo === 'pdf') {
                btnElement.innerHTML = `<span>Descargando PDF...</span>`;
                let blobPdf = destino.blob;
                if (!blobPdf) {
                    const resPdf = await fetchConReintento(destino.url, { credentials: 'include' }, 3, 500);
                    if (!resPdf.ok) throw new Error('Error al descargar PDF (' + resPdf.status + ')');
                    blobPdf = await resPdf.blob();
                }

                const nombrePdf = extraerNombreArchivoPdf(destino.url) || `${slug}.pdf`;
                dispararDescargaNavegador(blobPdf, nombrePdf);

                btnElement.classList.remove('descargando');
                btnElement.classList.add('descargado-exito');
                btnElement.innerHTML = `${SVG_CHECK}<span>¡Listo!</span>`;

                setTimeout(() => {
                    btnElement.classList.remove('descargado-exito');
                    btnElement.innerHTML = `${SVG_DESCARGAR}<span>Descargar</span>`;
                }, 3500);
                return;
            }

            // Caso 2: El recurso es un paquete SCORM interactivo
            const baseScorm = destino.url.endsWith('/') ? destino.url : (destino.url + '/');
            btnElement.innerHTML = `<span>Leyendo...</span>`;

            const listaArchivos = new Set();
            listaArchivos.add('story.html');
            listaArchivos.add('index.html');
            listaArchivos.add('index_lms.html');

            if (destino.launchUrl && destino.launchUrl.startsWith(baseScorm)) {
                const relLaunch = limpiarRutaManifest(destino.launchUrl.slice(baseScorm.length).split('?')[0]);
                if (relLaunch) listaArchivos.add(relLaunch);
            }

            try {
                const manifestRes = await fetchConReintento(baseScorm + 'imsmanifest.xml', { credentials: 'include' }, 3, 450);
                if (manifestRes.ok) {
                    const manifestXml = await manifestRes.text();
                    listaArchivos.add('imsmanifest.xml');

                    let m;
                    const fileRegex = /<file\b[^>]*\bhref=["']([^"']+)["']/gi;
                    while ((m = fileRegex.exec(manifestXml)) !== null) {
                        const r = limpiarRutaManifest(m[1]);
                        if (r) listaArchivos.add(r);
                    }

                    const resRegex = /<resource\b[^>]*\bhref=["']([^"']+)["']/gi;
                    while ((m = resRegex.exec(manifestXml)) !== null) {
                        const r = limpiarRutaManifest(m[1]);
                        if (r) listaArchivos.add(r);
                    }
                }
            } catch (eManifest) {
                console.warn('[UVEG Bloc Notas] No se pudo leer imsmanifest.xml, usando archivos de entrada:', eManifest);
            }

            const arrayArchivos = Array.from(listaArchivos);
            const zip = new VanillaZipEngine();
            const pdfsInternos = new Set();
            let completados = 0;
            let archivosAgregados = 0;

            const BATCH_SIZE = 5;
            for (let i = 0; i < arrayArchivos.length; i += BATCH_SIZE) {
                const lote = arrayArchivos.slice(i, i + BATCH_SIZE);
                await Promise.all(lote.map(async (ruta) => {
                    try {
                        const urlArchivo = new URL(ruta, baseScorm).href;
                        const res = await fetchConReintento(urlArchivo, { credentials: 'include' }, 3, 400);
                        if (res.ok) {
                            const buf = await res.arrayBuffer();
                            const uint8 = new Uint8Array(buf);
                            zip.add(ruta, uint8);
                            archivosAgregados++;

                            // Si el archivo dentro del SCORM tiene un salto a un PDF de UVEG (como L3_Comic.pdf), detectarlo para descargarlo también
                            if (/\.(js|html|htm|xml|json)$/i.test(ruta)) {
                                try {
                                    const texto = normalizarHtmlScorm(new TextDecoder('utf-8').decode(uint8));
                                    const regexPdf = /https?:\/\/[^"'\s<>\\]+\/pluginfile\.php\/\d+\/[^"'\s<>\\]+\.pdf(?:\?[^"'\s<>\\]*)?/gi;
                                    let mPdf;
                                    while ((mPdf = regexPdf.exec(texto)) !== null) {
                                        pdfsInternos.add(mPdf[0]);
                                    }
                                } catch {}
                            }
                        }
                    } catch {} finally {
                        completados++;
                        const pct = Math.min(99, Math.round((completados / arrayArchivos.length) * 100));
                        btnElement.innerHTML = `<span>${pct}%</span>`;
                    }
                }));
            }

            if (archivosAgregados === 0 && pdfsInternos.size === 0) {
                throw new Error('No se pudieron descargar los archivos del paquete SCORM');
            }

            if (archivosAgregados > 0) {
                btnElement.innerHTML = `<span>Empacando...</span>`;
                const blobZip = zip.buildBlob();
                dispararDescargaNavegador(blobZip, `Leccion_${slug}_Offline.zip`);
            }

            // Si el SCORM tenía un salto interno a un PDF (como L3_Comic.pdf), descargarlo también automáticamente
            for (const urlPdfExtra of pdfsInternos) {
                try {
                    const resExtra = await fetchConReintento(urlPdfExtra, { credentials: 'include' }, 3, 450);
                    if (resExtra.ok) {
                        const blobExtra = await resExtra.blob();
                        const nomExtra = extraerNombreArchivoPdf(urlPdfExtra) || `${slug}_Anexo.pdf`;
                        dispararDescargaNavegador(blobExtra, nomExtra);
                    }
                } catch {}
            }

            btnElement.classList.remove('descargando');
            btnElement.classList.add('descargado-exito');
            btnElement.innerHTML = `${SVG_CHECK}<span>¡Listo!</span>`;

            setTimeout(() => {
                btnElement.classList.remove('descargado-exito');
                btnElement.innerHTML = `${SVG_DESCARGAR}<span>Descargar</span>`;
            }, 3500);

        } catch (err) {
            console.error('[UVEG Bloc Notas] Error al descargar recurso:', err);
            btnElement.classList.remove('descargando');
            btnElement.innerHTML = `<span>Error</span>`;
            setTimeout(() => {
                btnElement.innerHTML = `${SVG_DESCARGAR}<span>Descargar</span>`;
            }, 3000);
        } finally {
            descargasActivas = Math.max(0, descargasActivas - 1);
        }
    }

    function renderizar(items) {
        asegurarHost();
        contenedor.innerHTML = '';

        // 1. CABECERA
        const cabecera = document.createElement('div');
        cabecera.className = 'cabecera';

        const cabeceraInfo = document.createElement('div');
        cabeceraInfo.className = 'cabecera-info';

        // Icono azul UVEG
        const iconoCaja = document.createElement('div');
        iconoCaja.className = 'icono-caja';
        iconoCaja.innerHTML = `<svg viewBox="0 0 24 24"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path></svg>`;

        const titulosCaja = document.createElement('div');
        titulosCaja.className = 'titulos-caja';

        const tituloApp = document.createElement('span');
        tituloApp.className = 'titulo-app';
        tituloApp.textContent = 'UVEG';

        const subtituloApp = document.createElement('span');
        subtituloApp.className = 'subtitulo-app';
        subtituloApp.textContent = `${items.length} recurso${items.length > 1 ? 's' : ''} ordenado${items.length > 1 ? 's' : ''}`;

        titulosCaja.appendChild(tituloApp);
        titulosCaja.appendChild(subtituloApp);

        cabeceraInfo.appendChild(iconoCaja);
        cabeceraInfo.appendChild(titulosCaja);

        // Botones esquina derecha: Copiar todo + Cerrar
        const cabeceraAcciones = document.createElement('div');
        cabeceraAcciones.className = 'cabecera-acciones';

        const btnCopiarTodoMini = document.createElement('button');
        btnCopiarTodoMini.type = 'button';
        btnCopiarTodoMini.className = 'btn-copiar-todo-mini';
        btnCopiarTodoMini.title = 'Copiar todos los recursos ordenados';
        btnCopiarTodoMini.textContent = 'Copiar todo';

        btnCopiarTodoMini.addEventListener('click', async (e) => {
            e.stopPropagation();
            const textoTodos = items.map(it => formatearItem(it)).join('\n\n');
            const exito = await copiarAlPortapapeles(textoTodos);
            if (exito) {
                btnCopiarTodoMini.classList.add('copiado-exito');
                btnCopiarTodoMini.textContent = '¡Copiados!';
                setTimeout(() => {
                    btnCopiarTodoMini.classList.remove('copiado-exito');
                    btnCopiarTodoMini.textContent = 'Copiar todo';
                }, DURACION_AVISO_MS);
            }
        });

        const btnCerrar = document.createElement('button');
        btnCerrar.type = 'button';
        btnCerrar.className = 'btn-cerrar';
        btnCerrar.title = 'Cerrar esta ventana';
        btnCerrar.textContent = '✕';
        btnCerrar.addEventListener('click', (e) => {
            e.stopPropagation();
            cerrarWidget();
        });

        cabeceraAcciones.appendChild(btnCopiarTodoMini);
        cabeceraAcciones.appendChild(btnCerrar);

        cabecera.appendChild(cabeceraInfo);
        cabecera.appendChild(cabeceraAcciones);
        contenedor.appendChild(cabecera);

        // 2. ETIQUETA LIMPIA
        const filaSeccion = document.createElement('div');
        filaSeccion.className = 'seccion-label-fila';

        const seccionLabel = document.createElement('div');
        seccionLabel.className = 'seccion-label';
        seccionLabel.textContent = 'IMPORTANTES';

        filaSeccion.appendChild(seccionLabel);
        contenedor.appendChild(filaSeccion);

        // 3. LISTADO VERTICAL ORDENADO
        const listaScroll = document.createElement('div');
        listaScroll.className = 'lista-scroll';

        items.forEach((item) => {
            const tarjeta = document.createElement('div');
            tarjeta.className = 'item-tarjeta';
            tarjeta.title = 'Haz clic para copiar: ' + item.titulo;

            const tituloEl = document.createElement('span');
            tituloEl.className = 'item-titulo';
            tituloEl.textContent = item.titulo;

            // Contenedor de acciones en la tarjeta
            const accionesEl = document.createElement('div');
            accionesEl.className = 'item-acciones';

            // Botón Descargar para lecciones SCORM y documentos PDF (ej. L3_Comic.pdf)
            const esDescargable =
                item.tipo === 'scorm' ||
                item.tipo === 'pdf' ||
                /mod\/scorm|mod_scorm|mod\/resource|mod_resource|\.pdf/i.test(item.url);

            if (esDescargable) {
                const btnDescargar = document.createElement('button');
                btnDescargar.type = 'button';
                btnDescargar.className = 'btn-descargar-item';
                btnDescargar.innerHTML = `${SVG_DESCARGAR}<span>Descargar</span>`;
                btnDescargar.title = item.tipo === 'pdf'
                    ? 'Descargar documento PDF'
                    : 'Descargar lección interactiva offline (.zip o .pdf)';
                btnDescargar.addEventListener('click', (e) => {
                    e.stopPropagation();
                    descargarLeccionScormOPdf(item, btnDescargar);
                });
                accionesEl.appendChild(btnDescargar);
            }

            // Botón intuitivo "Copiar" con icono en azul UVEG
            const btnCopiar = document.createElement('button');
            btnCopiar.type = 'button';
            btnCopiar.className = 'btn-copiar-item';
            btnCopiar.innerHTML = `${SVG_COPIAR}<span>Copiar</span>`;

            accionesEl.appendChild(btnCopiar);
            tarjeta.appendChild(tituloEl);
            tarjeta.appendChild(accionesEl);

            const ejecutarCopia = async (e) => {
                if (e) e.stopPropagation();
                const texto = formatearItem(item);
                const exito = await copiarAlPortapapeles(texto);
                if (exito) {
                    tarjeta.classList.add('copiado-exito');
                    btnCopiar.innerHTML = `${SVG_CHECK}<span>¡Copiado!</span>`;
                    setTimeout(() => {
                        tarjeta.classList.remove('copiado-exito');
                        btnCopiar.innerHTML = `${SVG_COPIAR}<span>Copiar</span>`;
                    }, DURACION_AVISO_MS);
                }
            };

            tarjeta.addEventListener('click', ejecutarCopia);
            btnCopiar.addEventListener('click', ejecutarCopia);

            listaScroll.appendChild(tarjeta);
        });

        contenedor.appendChild(listaScroll);

        // 4. PIE DE TARJETA: Botón "Copiar todo y cerrar" en Azul UVEG (#1e40af)
        const pieCaja = document.createElement('div');
        pieCaja.className = 'pie-caja';

        const btnPieCerrar = document.createElement('button');
        btnPieCerrar.type = 'button';
        btnPieCerrar.className = 'btn-pie-cerrar';
        btnPieCerrar.textContent = 'Copiar todo y cerrar';

        btnPieCerrar.addEventListener('click', async () => {
            const textoTodos = items.map(it => formatearItem(it)).join('\n\n');
            await copiarAlPortapapeles(textoTodos);
            btnPieCerrar.classList.add('copiado-exito');
            btnPieCerrar.textContent = '¡Todo copiado!';
            setTimeout(() => {
                cerrarWidget();
            }, 600);
        });

        pieCaja.appendChild(btnPieCerrar);
        contenedor.appendChild(pieCaja);

        // Si hay más de 6 recursos, activar scroll limitando a la altura de las primeras 6 fichas
        if (items.length > 6) {
            listaScroll.classList.add('con-scroll');
            const ajustarAlturaScroll = () => {
                if (!listaScroll.isConnected) return;
                const tarjetas = listaScroll.querySelectorAll('.item-tarjeta');
                if (tarjetas.length >= 6) {
                    const tarjeta6 = tarjetas[5];
                    const rectScroll = listaScroll.getBoundingClientRect();
                    const rect6 = tarjeta6.getBoundingClientRect();
                    const distancia6 = (rect6.bottom - rectScroll.top) + listaScroll.scrollTop + 10;
                    const altura6 = Math.ceil(distancia6);
                    if (altura6 > 50) {
                        const maxViewport = Math.floor(window.innerHeight * 0.75) - 130;
                        listaScroll.style.maxHeight = `${Math.min(altura6, Math.max(200, maxViewport))}px`;
                    }
                }
            };
            ajustarAlturaScroll();
            requestAnimationFrame(ajustarAlturaScroll);
        } else {
            listaScroll.classList.remove('con-scroll');
            listaScroll.style.maxHeight = 'none';
        }
    }

    function actualizar() {
        // Evitar que el MutationObserver destruya el botón mientras hay una descarga activa
        if (descargasActivas > 0) {
            return;
        }

        const urlActual = window.location.href;
        const courseId = obtenerIdCurso();

        // 1. Si cambió el ID de curso, reiniciar estado completamente para el nuevo curso
        if (courseId !== ultimoCursoIdRegistrado) {
            ultimoCursoIdRegistrado = courseId;
            ultimaUrlRegistrada = urlActual;
            ultimoCursoEscaneado = null;
            itemsAcumulados = [];
            firmaActual = '';
            descartado = estaCursoCerradoEnSesion(courseId);
        } else if (urlActual !== ultimaUrlRegistrada) {
            ultimaUrlRegistrada = urlActual;
            if (estaCursoCerradoEnSesion(courseId)) {
                descartado = true;
            }
        }

        // 2. Si el usuario ya cerró este curso en esta pestaña, mantenerlo cerrado
        if (descartado || estaCursoCerradoEnSesion(courseId)) {
            descartado = true;
            quitarHost();
            return;
        }

        const itemsDom = encontrarIframesEnDocumento(document);

        // Incorporar items del DOM actual (excepto mod/resource sin validar cuando estamos en página de curso)
        for (const item of itemsDom) {
            if (item.requiereValidarSaltoPdf && (esPaginaCurso() || ultimoCursoEscaneado === courseId)) {
                continue;
            }
            const norm = normalizarUrl(item.url);
            if (!itemsAcumulados.some(it => normalizarUrl(it.url) === norm)) {
                itemsAcumulados.push(item);
            }
        }

        // 3. Si estamos en la página del curso en UVEG, lanzar el escaneo completo de las secciones 2, 3 y 4 ("por arriba")
        if (courseId && esPaginaCurso() && !escaneandoSecciones && ultimoCursoEscaneado !== courseId && hostname.endsWith('uveg.edu.mx')) {
            escanearTodasLasSecciones(courseId);
            return;
        }

        if (!seccionEsPermitida(itemsAcumulados) || itemsAcumulados.length === 0) {
            firmaActual = '';
            quitarHost();
            return;
        }

        if (!escaneandoSecciones) {
            itemsAcumulados = ordenarPorTitulo(itemsAcumulados);
            const firma = JSON.stringify(itemsAcumulados);
            if (firma !== firmaActual || !host || !host.isConnected) {
                firmaActual = firma;
                renderizar(itemsAcumulados);
            }
        }
    }

    window.addEventListener('popstate', actualizar);
    window.addEventListener('hashchange', actualizar);

    // Interceptar cambios de URL por History API (SPA / AJAX)
    try {
        const originalPushState = history.pushState;
        if (typeof originalPushState === 'function') {
            history.pushState = function() {
                const res = originalPushState.apply(this, arguments);
                actualizar();
                return res;
            };
        }
        const originalReplaceState = history.replaceState;
        if (typeof originalReplaceState === 'function') {
            history.replaceState = function() {
                const res = originalReplaceState.apply(this, arguments);
                actualizar();
                return res;
            };
        }
    } catch {}

    const observador = new MutationObserver(() => {
        clearTimeout(temporizador);
        temporizador = setTimeout(actualizar, ESPERA_REVISION_MS);
    });

    observador.observe(document.documentElement, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['src', 'data-src', 'title', 'aria-label']
    });

    // Ejecución inicial
    actualizar();
})();
