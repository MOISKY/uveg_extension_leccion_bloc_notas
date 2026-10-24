# UVEG - Lecciones bloc de notas

![Version](https://img.shields.io/badge/version-1.4.3-blue.svg)
![Manifest](https://img.shields.io/badge/manifest-v3-green.svg)
![License](https://img.shields.io/badge/license-MIT-orange.svg)
![Platform](https://img.shields.io/badge/platform-Chrome%20%7C%20Edge%20%7C%20Firefox-lightgrey.svg)

Extensión de navegador web ligera y moderna para el **Campus Virtual UVEG** (`avalicmod19d.uveg.edu.mx`). Detecta, acumula, ordena y permite copiar en 1 solo clic los recursos e interactivos incrustados (`iframes` de Genially y recursos internos) en formato listo para el Bloc de notas o documentos de entrega.

---

## 🎯 Problema que resuelve

En las aulas virtuales de la UVEG, las lecciones y retos interactivos suelen estar dispersos en diferentes secciones (`mainsection=2`, `3`, `4`) o en desorden dentro del código HTML. Esta extensión:
1. **Rastrea todas las secciones del curso en paralelo** sin que el alumno tenga que cambiar de página manualmente.
2. **Ordena los recursos naturalmente** (`L1, L2, L3... Reto 1, Reto 2...`).
3. **Ofrece copiado con 1 solo clic** para respaldar o estudiar offline.
4. **Respeta la lectura del alumno:** Permite cerrar la ventana y **la mantiene cerrada** mientras navega entre secciones del mismo curso, reabriéndose sola si entra a un curso diferente.

---

## ✨ Características Principales

* 🔄 **Ordenamiento Natural por Título:** Clasifica las lecciones y retos con orden numérico lógico (`L1`, `L2`, `L3`... `Reto 1`, `Reto 2`...), sin importar el orden desordenado del HTML original.
* 📋 **Copiado en 1 Clic con Retroalimentación:**
  * Clic individual en cualquier ficha para copiar su título y URL formateada.
  * Botón **"Copiar todo"** en la cabecera para extraer el curso completo.
  * Botón **"Copiar todo y cerrar"** en el pie para copiar y despejar la pantalla en un solo movimiento.
* 📜 **Scroll Dinámico Inteligente (> 6 recursos):**
  * **Hasta 6 recursos (`<= 6`):** La ventana se adapta de forma compacta y natural sin barras de scroll.
  * **Más de 6 recursos (`> 6`):** La altura visible se fija exactamente al tamaño de 6 fichas (`.con-scroll`) y activa scrollbar vertical fluido, evitando saturar la pantalla.
* 🧠 **Persistencia Inteligente de Sesión (`sessionStorage`):**
  * Si cierras el widget en el curso `id=103`, **se mantendrá cerrado** mientras navegues por los temas, secciones o retos de ese mismo curso en esa pestaña.
  * Si cambias a otro curso (`id=104`), el estado se reinicia y **se vuelve a abrir automáticamente** con los recursos del nuevo curso.
* 🎨 **Diseño Institucional en Azul UVEG:**
  * Tarjetas estilizadas con borde azul institucional (`#1e40af`), hover celeste (`#dbeafe`), avisos de éxito verde esmeralda (`#059669`) e íconos SVG.
* 🛡️ **Aislamiento Total con Shadow DOM (`closed`):**
  * La interfaz vive dentro de un Shadow DOM para que los estilos del campus Moodle nunca interfieran con el diseño de la extensión ni viceversa.
* 🖱️ **Cabecera Arrastrable (Drag & Drop):**
  * Puedes mover la ventana flotante con el ratón a cualquier punto de la pantalla para evitar tapar diagramas o textos de estudio.

---

## 📝 Formato de Salida

Cada recurso se copia al portapapeles con la siguiente estructura limpia:

```text
titulo: L1 - Presentación de Introducción a la Contabilidad
url: https://view.genially.com/600000000000000000000001
```

---

## 🚀 Instalación y Despliegue (3 Pasos)

La extensión no requiere compilación previa. Se instala directamente en modo desarrollador:

1. Abre tu navegador (Google Chrome, Microsoft Edge, Brave u Opera) e ingresa a:
   ```text
   chrome://extensions/
   ```
   *(o `edge://extensions/` en Microsoft Edge)*.
2. Activa el interruptor **"Modo de desarrollador"** (ubicado en la esquina superior derecha).
3. Haz clic en el botón **"Cargar descomprimida"** (Load unpacked) y selecciona la carpeta del proyecto:
   ```text
   C:\xampp\htdocs\uveg_extension_leccion_bloc_notas
   ```
¡Listo! La extensión quedará activa y con su ícono oficial visible en la barra de extensiones.

---

## 🧪 Simulador Local de Pruebas (`prueba.html`)

El proyecto incluye un entorno de simulación autónomo para verificar todas las funciones sin necesidad de estar dentro del campus virtual:

1. Abre [prueba.html](prueba.html) en tu navegador.
2. **Prueba de Scroll:**
   * Haz clic en *"+ Insertar L4"* para ver cómo se muestran 6 recursos de forma natural sin scroll.
   * Haz clic en *"+ Insertar hasta 10 recursos"* para verificar la activación del scroll dinámico limitando la altura a 6 fichas.
3. **Prueba de Cierre y Reinicio de Sesión:**
   * Haz clic en *"1. Ir a Curso ?id=103"*, abre la ventana y ciérrala con la **✕**.
   * Haz clic en *"2. Navegar a Hijo (?id=103&mainsection=4&chall=9)"*: comprobarás que se mantiene cerrada.
   * Haz clic en *"3. Cambiar a Nuevo Curso ?id=104"*: la extensión detecta el nuevo curso y se vuelve a abrir sola.

---

## 📚 Documentación de Ingeniería de Software (Docs-as-Code)

La especificación formal del sistema bajo estándares internacionales se encuentra en la carpeta [`docs/`](docs/):

* 📋 [**01. Especificación de Requerimientos (RF y RNF)**](docs/01-especificacion-rf-rnf.md): Requerimientos Funcionales (RF-01 a RF-08), Requerimientos No Funcionales según Ian Sommerville (Producto, Organización y Externos) y Matriz MoSCoW.
* 🗂️ [**02. Catálogo General de Casos de Uso**](docs/02-catalogo-casos-de-uso.md): Definición de actores, matriz de trazabilidad y diagrama UML en Mermaid.
* 📑 [**03. Fichas Técnicas de Casos de Uso**](docs/03-fichas-casos-de-uso.md): Especificación paso a paso de los 7 casos de uso (`CU001` a `CU007`) con flujos principales, alternativos y excepcionales.

---

## 🔒 Privacidad y Seguridad

En apego a la **Ley Federal de Protección de Datos Personales en Posesión de los Particulares (LFPDPPP)** y las directrices de seguridad de Google Chrome:
* Esta extensión **no almacena, no procesa y no envía** credenciales, contraseñas, calificaciones ni datos sensibles a ningún servidor externo.
* Toda la ejecución es 100% local en el cliente.
* La inyección de código está restringida exclusivamente al dominio educativo `avalicmod19d.uveg.edu.mx`.

---

## 📄 Licencia

Distribuido bajo la Licencia **MIT**. Consulta el archivo [LICENSE](LICENSE) para más información.
