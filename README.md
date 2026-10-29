# UVEG - Lecciones bloc de notas (v1.5.0 - Visualización `<p class="leccion2-pLeccion">` + Ordenamiento Interno `LEC_L1..L12` + Descargas SCORM/PDF)

![Version](https://img.shields.io/badge/version-1.5.0-blue.svg)
![Manifest](https://img.shields.io/badge/manifest-v3-green.svg)
![License](https://img.shields.io/badge/license-MIT-orange.svg)
![Platform](https://img.shields.io/badge/platform-Chrome%20%7C%20Edge%20%7C%20Firefox-lightgrey.svg)

Extensión de navegador web 100% autónoma (sin conexión a Supabase ni servidores externos) para el **Campus Virtual UVEG** (`avalicmod19d.uveg.edu.mx`). Detecta, acumula, ordena internamente por código (`LEC_L1..L12`), muestra visualmente en cada fichita el título de `<p class="leccion2-pLeccion">`, copia en 1 solo clic al portapapeles y **descarga localmente paquetes SCORM (`.zip` Offline) y archivos PDF de salto (`.pdf`)**.

---

## 🎯 Cómo funciona la versión actual

1. **Escaneo Automático Multi-Sección ("Por Arriba"):**
   - Al entrar a `/course/view.php?id=...` (con o sin `mainsection` en la URL), recorre en segundo plano `mainsection=2`, `3` y `4` (Unidades 1, 2 y 3) y acumula las 12 lecciones de golpe en el panel flotante.
2. **Visualización Limpia con `<p class="leccion2-pLeccion">` en la Fichita:**
   - Extrae todos los `<p class="leccion2-pLeccion">` de las unidades del curso y los respalda en `localStorage` (`uveg_bloc_mapa_pleccion_{courseId}`).
   - En cada fichita del panel flotante (y al copiar al portapapeles) se muestra **únicamente el nombre completo de la lección**:
     `Lección 1. Definición y disposiciones generales de las personas físicas`
   - Si se detecta un PDF de salto como `L3_Comic.pdf` (que pertenece a la Lección 3), su fichita también muestra el texto de `<p class="leccion2-pLeccion">` de la Lección 3.
3. **Ordenamiento Interno por Código (`LEC_L1..LEC_L12`, `CPFI_L4..CPFI_L12`, `L3_Comic`):**
   - El código corto (`LEC_L1`, `CPFI_L4`, `LEC_L12`, `L3_Comic`) se guarda **internamente** en cada ítem (`item.codigo` y `item.numero`) para ordenar las fichitas del `1` al `12` de forma exacta y evitar colisiones entre un SCORM (`LEC_L3`) y su PDF de salto (`L3_Comic`), sin mostrar el código crudo en la etiqueta visual.
4. **Descarga Local de Paquetes SCORM (`.zip` Offline) y PDFs (`.pdf`):**
   - **Resolución Profunda (`resolverDestinoRecurso` + `extraerParametrosScorm`)**: Desambigua `view.php` $\rightarrow$ `player.php` (`M.mod_scorm.init(...)`) $\rightarrow$ `loadSCO.php` para localizar la raíz `/pluginfile.php/{ctx}/mod_scorm/content/{rev}/`.
   - **Empaquetador ZIP Nativo (`VanillaZipEngine`)**: Descarga en lotes paralelos de 8 archivos (`story.html`, `html5/data/js/data.js`, imágenes, audios, etc.), genera el `index.html` lanzador y descarga `Leccion_<nombre>_Offline.zip`.
   - **Auto-descarga de PDFs de salto**: Si un paquete SCORM tiene un salto interno a un PDF (ej. `L3_Comic.pdf`), o si el recurso salta directamente a un PDF, descarga el archivo `.pdf` automáticamente al equipo.

---

## 📝 Formato de Salida (Portapapeles)

Cada recurso se copia al portapapeles usando el título de `<p class="leccion2-pLeccion">`:

```text
titulo: Lección 1. Definición y disposiciones generales de las personas físicas
url: https://avalicmod19d.uveg.edu.mx/mod/scorm/view.php?id=5626

titulo: Lección 4. Ingresos y obligaciones del régimen...
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
