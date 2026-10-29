# Historial de Cambios (Changelog)

Todos los cambios notables en este proyecto serán documentados en este archivo.

El formato se basa en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/)
y este proyecto se adhiere a [Semantic Versioning](https://semver.org/lang/es/).

---

## [1.5.0] - 2026-10-24

### Añadido
- **Gestión de ciclo de vida con persistencia en `sessionStorage`:**
  - Al cerrar la ventana flotante (mediante botón "✕" o "Copiar todo y cerrar"), se recuerda la decisión del usuario bajo la clave `uveg_curso_cerrado_[courseId]`.
  - El widget se mantiene cerrado durante toda la sesión mientras el alumno navega entre páginas hijas o retos del mismo curso (ej. `&mainsection=4&chall=9`, `&mainsection=2`).
- **Reinicio automático por cambio de curso:**
  - Si el parámetro de curso cambia (ej. de `id=103` a `id=104`), el estado se reinicia automáticamente y la ventana se abre mostrando los recursos del nuevo curso.
- **Intercepción de navegación dinámica (SPA):**
  - Soporte de escucha en `popstate`, `hashchange`, `history.pushState` y `history.replaceState` para detección de rutas sin recarga completa.
- **Panel de pruebas interactivo en `prueba.html`:**
  - Sección para simular navegación entre `id=103`, hijos de `103` y `id=104` con indicador en tiempo real de `sessionStorage`.

---

## [1.4.2] - 2026-10-23

### Añadido
- **Scroll dinámico inteligente (> 6 fichas):**
  - Para 6 o menos recursos (`<= 6`), la ventana se ajusta naturalmente sin scrollbar.
  - Para más de 6 recursos (`> 6`), la altura visible se limita con precisión milimétrica al tamaño de 6 fichas (`.con-scroll`) y activa scrollbar vertical fluido.
- **Identidad visual e íconos oficiales:**
  - Incorporación de logo oficial en medidas estándar de Chrome: `16x16`, `48x48` y `128x128` px en formato PNG.
  - Registro de íconos en `icons` y `action` de `manifest.json`.
- **Renombrado institucional:**
  - Nombre oficial actualizado a: `"UVEG - Lecciones bloc de notas"`.

### Corregido
- Eliminación de la altura fija desproporcionada (`max-height: 52vh`) que causaba la aparición de 10 fichas de golpe ocupando la pantalla completa.

---

## [1.4.1] - 2026-10-22

### Añadido
- **Ordenamiento natural por título:**
  - Algoritmo que clasifica los recursos incrustados de forma lógica (`L1, L2, L3... Reto 1, Reto 2...`) sin importar su orden en el código HTML.
- **Diseño institucional en Azul UVEG:**
  - Paleta en azul `#1e40af`, hover celeste `#dbeafe`, bordes definidos y botones con íconos SVG.
- **Copiado al portapapeles en 1 clic:**
  - Copiado individual de recurso con formato estandarizado (`titulo: ... \nurl: ...`) y retroalimentación visual (`¡Copiado!`).
  - Botón `"Copiar todo"` en cabecera y botón inferior `"Copiar todo y cerrar"`.
- **Ventana flotante con arrastre (Drag & Drop):**
  - Cabecera arrastrable con el ratón y límites de contención dentro del viewport.
- **Aislamiento Shadow DOM:**
  - Encapsulamiento en Shadow DOM (`closed`) para evitar conflictos de estilos con el CSS de Moodle.
- **Simulador local de pruebas:**
  - Archivo `prueba.html` con ejemplos de iframes interactivos y pruebas de copiado.
