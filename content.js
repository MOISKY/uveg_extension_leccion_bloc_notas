(() => {
    'use strict';

    if (window.__uveg_extension_iniciada) {
        return;
    }
    window.__uveg_extension_iniciada = true;

    // 1. Dominio permitido: avalicmod19d.uveg.edu.mx (o localhost / 127.0.0.1 / file: para pruebas locales)
    const hostname = window.location.hostname.toLowerCase();
    const esDominioValido = hostname === 'avalicmod19d.uveg.edu.mx' ||
                            hostname === 'localhost' ||
                            hostname === '127.0.0.1' ||
                            window.location.protocol === 'file:';

    if (!esDominioValido) {
        return;
    }

    const ID_HOST = 'uveg-copiar-recursos-host';
    const SIN_TITULO = '(sin título)';
    const ESPERA_REVISION_MS = 350;
    const DURACION_AVISO_MS = 1800;

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

    // Dominios o patrones de recursos (Genially, UVEG interactivo, etc.)
    const HOSTS_GENIALLY = ['view.genial.ly', 'view.genially.com', 'genial.ly', 'genially.com'];

    function esUrlRecurso(urlStr) {
        if (!urlStr) return false;
        try {
            const url = new URL(urlStr, window.location.href);
            const h = url.hostname.toLowerCase();
            const p = url.pathname.toLowerCase();
            const esGenially = HOSTS_GENIALLY.some(base => h === base || h.endsWith('.' + base));
            if (esGenially) return true;
            if (h.endsWith('uveg.edu.mx')) {
                if (/[?&]mainsection=[234]($|&)/i.test(url.search)) return true;
                if (p.includes('/mod/scorm/') || p.includes('/mod_scorm/')) return true;
                if (p.includes('/mod_resource/') || p.includes('/mod/resource/') || p.endsWith('.pdf')) return true;
            }
        } catch {
            if (/view\.genial\.ly|view\.genially\.com/i.test(urlStr)) return true;
            if (/mod\/scorm|mod_scorm|mod_resource|\.pdf/i.test(urlStr)) return true;
            if (/avalicmod19d\.uveg\.edu\.mx.*[?&]mainsection=[234]/i.test(urlStr)) return true;
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
        if (match) return match[1];
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

    // Comprobar internamente si corresponde a la vista del curso
    function seccionEsPermitida(itemsEncontrados = []) {
        if (hostname === 'localhost' || hostname === '127.0.0.1' || window.location.protocol === 'file:') {
            return true;
        }
        if (esPaginaCurso()) {
            return true;
        }
        if (obtenerSeccionActual() !== null) {
            return true;
        }
        if (itemsEncontrados.some(it => /[?&]mainsection=[234]($|&)/i.test(it.url))) {
            return true;
        }
        return false;
    }

    // Algoritmo de ordenamiento natural por título (L1, L2, L3... Reto 1, Reto 2...)
    function ordenarPorTitulo(items) {
        return items.slice().sort((a, b) => {
            return a.titulo.localeCompare(b.titulo, undefined, { numeric: true, sensitivity: 'base' });
        });
    }

    // Extraer título limpio del iframe o de su contenedor Moodle
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

        try {
            const actividad = iframe.closest ? iframe.closest('.activity, .activityinstance, .contentitem, .section, .box, [id^="module-"]') : null;
            if (actividad) {
                const header = actividad.querySelector('.instancename, .activityname, h2, h3, h4, .mod-indent-outer');
                if (header) {
                    const textoLimpio = header.innerText ? header.innerText.split('\n')[0].replace(/\s+/g, ' ').trim() : header.textContent.split('\n')[0].replace(/\s+/g, ' ').trim();
                    if (textoLimpio.length > 2) {
                        return textoLimpio;
                    }
                }
            }

            let prev = iframe.previousElementSibling;
            while (prev) {
                if (/^H[1-6]$/i.test(prev.tagName) || (prev.classList && (prev.classList.contains('title') || prev.classList.contains('instancename')))) {
                    const texto = (prev.innerText || prev.textContent || '').trim();
                    if (texto) return texto;
                }
                prev = prev.previousElementSibling;
            }
        } catch {}

        if (titleAttr) return titleAttr;
        if (nameAttr) return nameAttr;
        return SIN_TITULO;
    }

    function extraerTituloElemento(el, contextDoc = document) {
        if (el.tagName === 'IFRAME') {
            return extraerTitulo(el, contextDoc);
        }

        try {
            const contenedor = el.closest ? el.closest('.container-lesson, .activity, .activityinstance, .contentitem, .section, .box, [id^="module-"]') : null;
            if (contenedor) {
                const tituloUveg = contenedor.querySelector('.titulo, .title, .nombre-leccion');
                if (tituloUveg) {
                    const txt = (tituloUveg.innerText || tituloUveg.textContent || '').trim();
                    if (txt.length > 2) return txt.replace(/\s+/g, ' ');
                }

                const header = contenedor.querySelector('.instancename, .activityname, h2, h3, h4, .mod-indent-outer');
                if (header) {
                    const copia = header.cloneNode(true);
                    copia.querySelectorAll('.accesshide, .sr-only').forEach(s => s.remove());
                    const txt = (copia.innerText || copia.textContent || '').split('\n')[0].trim();
                    if (txt.length > 2) return txt.replace(/\s+/g, ' ');
                }
            }

            const titleAttr = (el.getAttribute('title') || el.getAttribute('aria-label') || el.getAttribute('alt') || '').trim();
            if (titleAttr && !/^(genially|view|iframe|embedded|icono|imagen|recurso)$/i.test(titleAttr)) {
                return titleAttr.replace(/\s+/g, ' ');
            }

            const inner = (el.innerText || el.textContent || '').trim();
            if (inner && inner.length > 2 && inner.length < 200) {
                return inner.replace(/\s+/g, ' ');
            }
        } catch {}

        return SIN_TITULO;
    }

    // Escanear tanto iframes (Genially) como elementos con data-link (SCORM / PDF)
    function encontrarLeccionesEnDocumento(doc = document) {
        const vistos = new Set();
        const encontrados = [];

        // 1. Iframes (Genially)
        for (const iframe of doc.querySelectorAll('iframe')) {
            const src = iframe.getAttribute('src') || iframe.getAttribute('data-src') || iframe.src;
            if (!src || !esUrlRecurso(src) || vistos.has(src)) continue;

            vistos.add(src);
            const titulo = extraerTitulo(iframe, doc);
            encontrados.push({
                titulo: titulo,
                url: src,
                tipo: 'genially'
            });
        }

        // 2. Elementos con data-link, SCORM y PDFs
        const selectores = [
            '[data-link]',
            'a[href*="/mod/scorm/"]',
            'a[href*="/mod_scorm/"]',
            'a[href*="/mod/resource/"]',
            'a[href*="/mod_resource/"]',
            'a[href*=".pdf"]',
            '.container-lesson',
            '.img-leccion'
        ].join(', ');

        for (const el of doc.querySelectorAll(selectores)) {
            let rawUrl = el.getAttribute('data-link') || el.getAttribute('href');
            if (!rawUrl && el.querySelector) {
                const hijo = el.querySelector('[data-link], a[href*="mod/scorm"], a[href*=".pdf"]');
                if (hijo) {
                    rawUrl = hijo.getAttribute('data-link') || hijo.getAttribute('href');
                }
            }

            if (!rawUrl || !esUrlRecurso(rawUrl) || vistos.has(rawUrl)) continue;

            vistos.add(rawUrl);
            const titulo = extraerTituloElemento(el, doc);
            let tipo = 'recurso';
            if (/mod\/scorm|mod_scorm/i.test(rawUrl)) {
                tipo = 'scorm';
            } else if (HOSTS_GENIALLY.some(b => rawUrl.includes(b))) {
                tipo = 'genially';
            } else if (/\.pdf|mod_resource/i.test(rawUrl)) {
                tipo = 'pdf';
            }

            encontrados.push({
                titulo: titulo,
                url: rawUrl,
                tipo: tipo
            });
        }

        return encontrados;
    }

    function encontrarIframesEnDocumento(doc = document) {
        return encontrarLeccionesEnDocumento(doc);
    }

    // Recorrido interno en paralelo sin referencias textuales externas
    async function escanearTodasLasSecciones(courseId, seccionActual) {
        if (escaneandoSecciones || !courseId || hostname === 'localhost' || hostname === '127.0.0.1' || window.location.protocol === 'file:') {
            return;
        }

        if (ultimoCursoEscaneado === courseId && itemsAcumulados.length > 0) {
            return;
        }

        escaneandoSecciones = true;
        ultimoCursoEscaneado = courseId;

        const secciones = [2, 3, 4];
        const seccionesOtras = secciones.filter(s => s !== seccionActual);

        // Mostrar estado de carga limpio
        renderizarEstadoCarga();

        // Peticiones en paralelo con Promise.allSettled
        await Promise.allSettled(seccionesOtras.map(async (sec) => {
            try {
                const urlSec = `${window.location.origin}/course/view.php?id=${courseId}&mainsection=${sec}`;
                const respuesta = await fetch(urlSec, { credentials: 'include' });
                if (!respuesta.ok) return;

                const html = await respuesta.text();
                const parser = new DOMParser();
                const docSec = parser.parseFromString(html, 'text/html');

                const nuevos = encontrarIframesEnDocumento(docSec);
                for (const item of nuevos) {
                    if (!itemsAcumulados.some(it => it.url === item.url)) {
                        itemsAcumulados.push(item);
                    }
                }
            } catch (err) {
                console.warn('[UVEG Extensión] Error al obtener recurso', err);
            }
        }));

        escaneandoSecciones = false;

        // Ordenar todos los items acumulados por título (L1, L2, L3...)
        itemsAcumulados = ordenarPorTitulo(itemsAcumulados);
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

    async function descargarLeccionScorm(item, btnElement) {
        if (!btnElement || btnElement.classList.contains('descargando')) return;

        btnElement.classList.add('descargando');
        btnElement.innerHTML = `<span>Buscando...</span>`;

        try {
            let baseScorm = '';
            // Si la URL es directa a mod_scorm/content:
            const matchContent = item.url.match(/(https?:\/\/[^"']+\/pluginfile\.php\/\d+\/mod_scorm\/content\/\d+\/)/i);
            if (matchContent) {
                baseScorm = matchContent[1];
            } else {
                // Si es un view.php, resolver loadSCO
                const resView = await fetch(item.url, { credentials: 'same-origin' });
                const htmlView = await resView.text();
                const matchBase = htmlView.match(/(https?:\/\/[^"']+\/pluginfile\.php\/\d+\/mod_scorm\/content\/\d+\/)/i);
                if (matchBase) {
                    baseScorm = matchBase[1];
                } else {
                    const matchSco = htmlView.match(/([a-zA-Z0-9_.-]*loadSCO\.php\?[^"']+)/i);
                    if (matchSco) {
                        const urlSco = new URL(matchSco[1], item.url).href;
                        const resSco = await fetch(urlSco, { credentials: 'same-origin' });
                        const htmlSco = await resSco.text();
                        const matchFinal = htmlSco.match(/(https?:\/\/[^"']+\/pluginfile\.php\/\d+\/mod_scorm\/content\/\d+\/)/i);
                        if (matchFinal) baseScorm = matchFinal[1];
                    }
                }
            }

            if (!baseScorm) {
                throw new Error('No se pudo localizar el paquete SCORM');
            }

            btnElement.innerHTML = `<span>Leyendo...</span>`;
            const manifestRes = await fetch(baseScorm + 'imsmanifest.xml');
            if (!manifestRes.ok) throw new Error('Error al leer imsmanifest.xml (' + manifestRes.status + ')');
            const manifestXml = await manifestRes.text();

            const listaArchivos = new Set();
            listaArchivos.add('imsmanifest.xml');
            listaArchivos.add('story.html');
            listaArchivos.add('index.html');

            let m;
            const fileRegex = /<file\b[^>]*\bhref=["']([^"']+)["']/gi;
            while ((m = fileRegex.exec(manifestXml)) !== null) {
                if (m[1]) listaArchivos.add(m[1].trim());
            }

            const resRegex = /<resource\b[^>]*\bhref=["']([^"']+)["']/gi;
            while ((m = resRegex.exec(manifestXml)) !== null) {
                if (m[1]) listaArchivos.add(m[1].trim());
            }

            const arrayArchivos = Array.from(listaArchivos);
            const zip = new VanillaZipEngine();
            let completados = 0;

            for (let i = 0; i < arrayArchivos.length; i++) {
                const ruta = arrayArchivos[i];
                try {
                    const res = await fetch(baseScorm + ruta);
                    if (res.ok) {
                        const buf = await res.arrayBuffer();
                        zip.add(ruta, new Uint8Array(buf));
                        completados++;
                        if (completados % 10 === 0 || completados === arrayArchivos.length) {
                            const pct = Math.round((completados / arrayArchivos.length) * 100);
                            btnElement.innerHTML = `<span>${pct}%</span>`;
                        }
                    }
                } catch {}
            }

            btnElement.innerHTML = `<span>Empacando...</span>`;
            const blob = zip.buildBlob();

            const slug = (item.titulo || 'leccion')
                .replace(/[^a-zA-Z0-9_-]/g, '_')
                .replace(/_+/g, '_')
                .substring(0, 40);

            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = `Leccion_${slug}_Offline.zip`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);

            btnElement.classList.remove('descargando');
            btnElement.classList.add('descargado-exito');
            btnElement.innerHTML = `${SVG_CHECK}<span>¡Listo!</span>`;

            setTimeout(() => {
                btnElement.classList.remove('descargado-exito');
                btnElement.innerHTML = `${SVG_DESCARGAR}<span>Descargar</span>`;
            }, 3500);

        } catch (err) {
            console.error('[UVEG Bloc Notas] Error al descargar SCORM:', err);
            btnElement.classList.remove('descargando');
            btnElement.innerHTML = `<span>Error</span>`;
            setTimeout(() => {
                btnElement.innerHTML = `${SVG_DESCARGAR}<span>Descargar</span>`;
            }, 3000);
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

            // Botón selectivo: Únicamente para lecciones de tipo SCORM
            const esScorm = item.tipo === 'scorm' || /mod\/scorm|mod_scorm/i.test(item.url);
            if (esScorm) {
                const btnDescargar = document.createElement('button');
                btnDescargar.type = 'button';
                btnDescargar.className = 'btn-descargar-item';
                btnDescargar.innerHTML = `${SVG_DESCARGAR}<span>Descargar</span>`;
                btnDescargar.title = 'Descargar lección interactiva offline (.zip)';
                btnDescargar.addEventListener('click', (e) => {
                    e.stopPropagation();
                    descargarLeccionScorm(item, btnDescargar);
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
                    // Distancia exacta desde el tope hasta la base de la 6ta tarjeta + scroll + padding inferior (10px)
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
            // Misma ID de curso, pero cambió URL interna (hijos, mainsection, chall, etc.)
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

        const seccionActual = obtenerSeccionActual();
        const itemsDom = encontrarIframesEnDocumento(document);

        // Incorporar items del DOM actual
        for (const item of itemsDom) {
            if (!itemsAcumulados.some(it => it.url === item.url)) {
                itemsAcumulados.push(item);
            }
        }

        if (!seccionEsPermitida(itemsAcumulados) || itemsAcumulados.length === 0) {
            firmaActual = '';
            quitarHost();
            return;
        }

        // Lanzar escaneo silencioso en segundo plano
        if (courseId && seccionActual && !escaneandoSecciones && ultimoCursoEscaneado !== courseId) {
            escanearTodasLasSecciones(courseId, seccionActual);
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
