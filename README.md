# UVEG - Lecciones bloc de notas (Versión Standalone + Descargas SCORM/PDF)

![Version](https://img.shields.io/badge/version-1.4.3-blue.svg)
![Manifest](https://img.shields.io/badge/manifest-v3-green.svg)
![License](https://img.shields.io/badge/license-MIT-orange.svg)
![Platform](https://img.shields.io/badge/platform-Chrome%20%7C%20Edge%20%7C%20Firefox-lightgrey.svg)

Extensión de navegador web 100% autónoma (sin conexión a Supabase ni servidores externos) para el **Campus Virtual UVEG** (`avalicmod19d.uveg.edu.mx`). Detecta, acumula, ordena, copia en 1 solo clic al portapapeles (formato Bloc de notas) y **descarga localmente paquetes SCORM (`.zip` Offline) y archivos PDF de salto (`.pdf`)**.

---

## 🎯 Problema que resuelve

En las aulas virtuales de la UVEG, las lecciones y recursos interactivos suelen estar dispersos en diferentes unidades (`mainsection=2`, `3`, `4`), dentro de contenedores SCORM (`LEC_L1..LEC_L11`), `iframes` de Genially (`CPFI_L4..CPFI_L12`) o saltos directos a documentos PDF (`L3_Comic.pdf`). Esta extensión:
1. **Rastrea todas las secciones del curso automáticamente ("por arriba")** al entrar a `/course/view.php?id=...`, sin que el alumno tenga que entrar a cada unidad ni abrir cada lección manualmente.
2. **Filtra exactamente las 12 lecciones del módulo**, ignorando ejercicios SCORM de práctica o textos informativos como *"Tiempo estimado de revisión..."*.
3. **Ordena los recursos numéricamente** (`L1, L2, L3... L12`).
4. **Ofrece copiado en 1 solo clic** para el Bloc de notas y **botón de descarga directa** para paquetes SCORM (`.zip` ejecutable offline) y documentos PDF (`.pdf`).
5. **Respeta la lectura del alumno:** Permite cerrar la ventana y **la mantiene cerrada** mientras navega entre secciones del mismo curso, reabriéndose sola si entra a un curso diferente.

---

## ✨ Características Principales

* 🚀 **Escaneo Automático Multi-Sección ("Por Arriba"):**
  * Al abrir la portada del curso (`/course/view.php?id=324`), consulta en segundo plano `mainsection=2`, `3` y `4` (Unidades 1, 2 y 3) y acumula las 12 lecciones de inmediato.
* 🔍 **Detección Exacta de Lecciones (`LEC_L1..L12`, `CPFI_L4..L12` y Saltos PDF):**
  * **Genially (`iframe`)**: Detecta interactivos incrustados de Genially y extrae su código (`CPFI_L4`, `CPFI_L6`, etc.).
  * **Contenedores SCORM (`id="LEC_L1"`, `.img-leccion`)**: Prioriza el enlace de `.img-leccion` y el ID del contenedor (`LEC_L1` a `LEC_L12`), descartando ejercicios o actividades secundarias.
  * **Saltos a PDF (`L3_Comic.pdf`)**: Detecta enlaces a `/mod/resource/`, `/pluginfile.php/.../*.pdf`, saltos internos dentro de paquetes SCORM hacia archivos PDF y pestañas donde se abre un PDF directamente.
* 📦 **Descarga Local de Paquetes SCORM (`.zip` Offline) y PDFs (`.pdf`):**
  * **Resolución Profunda (`resolverDestinoRecurso` + `extraerParametrosScorm`)**: Desambigua `view.php` $\rightarrow$ `player.php` (`M.mod_scorm.init(...)`) $\rightarrow$ `loadSCO.php` para encontrar la raíz exacta `/pluginfile.php/{ctx}/mod_scorm/content/{rev}/`.
  * **Empaquetador ZIP Nativo (`VanillaZipEngine`)**: Descarga en lotes paralelos de 8 archivos (`story.html`, `html5/data/js/data.js`, `frame.js`, `paths.js`, imágenes, audios y fuentes), genera un `index.html` lanzador y descarga `Leccion_<nombre>_Offline.zip`.
  * **Auto-descarga de PDFs internos**: Si un paquete SCORM contiene un enlace o salto a un PDF (ej. `L3_Comic.pdf`), lo descarga automáticamente junto con el paquete `.zip`.
  * **Descarga directa de PDF**: Si el recurso o salto apunta a un PDF, lo descarga directamente al equipo con su nombre original (`L3_Comic.pdf`).
* 🔄 **Ordenamiento Natural por Número de Lección:** Clasifica las lecciones con orden numérico lógico (`L1` a `L12`), sin importar el orden en el DOM.
* 📋 **Copiado en 1 Clic con Retroalimentación:**
  * Clic individual en cualquier ficha para copiar su título y URL formateada.
  * Botón **"Copiar todo"** en la cabecera para extraer el curso completo.
  * Botón **"Copiar todo y cerrar"** en el pie para copiar y despejar la pantalla en un solo movimiento.
* 📜 **Scroll Dinámico Inteligente (> 6 recursos):**
  * **Hasta 6 recursos (`<= 6`):** La ventana se adapta de forma compacta sin barras de scroll.
  * **Más de 6 recursos (`> 6`):** La altura visible se fija a 6 fichas (`.con-scroll`) y activa scrollbar vertical fluido.
* 🛡️ **Aislamiento Total con Shadow DOM (`closed`)** y **Cabecera Arrastrable (Drag & Drop)**.

---

## 📝 Formato de Salida (Portapapeles)

Cada recurso se copia al portapapeles con la siguiente estructura limpia:

```text
titulo: LEC_L1
url: https://avalicmod19d.uveg.edu.mx/mod/scorm/view.php?id=5626

titulo: CPFI_L4
url: https://view.genially.com/66425624a5b...
```

---

## 🚀 Instalación y Actualización

1. Abre tu navegador (Google Chrome, Microsoft Edge, Brave u Opera) e ingresa a:
   ```text
   chrome://extensions/
   ```
2. Activa el interruptor **"Modo de desarrollador"** (esquina superior derecha).
3. Haz clic en **"Cargar descomprimida"** (o en el ícono de **Recargar `↻`** si ya está instalada) apuntando a:
   ```text
   C:\xampp\htdocs\uveg_extension_leccion_bloc_notas
   ```

---

## 📌 Nota de Desarrollo Pendiente (Roadmap)

> [!NOTE]
> **Escenario pendiente a desarrollo: Detector de Videos / YouTube en Iframes**
> - Actualmente la extensión filtra y procesa `iframes` de Genially (`view.genially.com` / `genial.ly`), paquetes SCORM (`mod_scorm`) y documentos PDF (`mod_resource` / `.pdf`).
> - **Pendiente a desarrollo:** Implementar el escenario de detección y extracción para `iframes` o contenedores que incrusten **videos o reproductores de YouTube** (`youtube.com/embed/...`, `youtu.be`, `vimeo.com`, o etiquetas `<video>` / reproductores multimedia internos de UVEG) para listarlos, copiarlos al bloc de notas y/o gestionar su recurso en las lecciones.
