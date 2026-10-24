# Especificación de Requerimientos de Software (SRS)

**Proyecto:** UVEG - Lecciones bloc de notas  
**Tipo de Sistema:** Extensión de Navegador Web (Chrome / Chromium / Firefox)  
**Versión:** 1.4.3  
**Fecha:** 2026-10-24  
**Estándar de Referencia:** IEEE 830 / ISO/IEC/IEEE 29148 / Ian Sommerville  

---

## 1. Introducción y Alcance

El presente documento especifica los requerimientos funcionales y no funcionales para la extensión **"UVEG - Lecciones bloc de notas"**. Su objetivo es automatizar la detección, acumulación, ordenamiento y copiado al portapapeles de los recursos de aprendizaje e interactivos incrustados (`iframes` de Genially y recursos internos) en las aulas virtuales del Campus Virtual de la Universidad Virtual del Estado de Guanajuato (UVEG).

---

## 2. Requerimientos Funcionales (RF)

| Código | Módulo | Tipo | Enunciado y Descripción Formal |
| :---: | :--- | :---: | :--- |
| **RF-01** | Detección de Recursos | Sistema | El sistema debe inspeccionar dinámicamente el DOM de las páginas del curso (`/course/view.php?id=...`) y extraer automáticamente todos los recursos interactivos incrustados mediante etiquetas `<iframe>` válidas (Genially y vistas interactivas UVEG). |
| **RF-02** | Escaneo Multi-sección en Paralelo | Sistema | Al identificar un ID de curso válido (`id=...`), el sistema debe realizar peticiones asíncronas en paralelo (`Promise.allSettled`) a las secciones principales restantes (`mainsection=2, 3, 4`) para recopilar la totalidad de recursos del curso sin obligar al usuario a navegar manualmente por cada sección. |
| **RF-03** | Ordenamiento Natural por Título | Sistema | El sistema debe aplicar un algoritmo de ordenamiento alfanumérico natural sobre los títulos extraídos, organizando lógicamente los elementos (ej. `L1`, `L2`, `L3`... `Reto 1`, `Reto 2`...) sin importar el orden desordenado en el código fuente HTML original. |
| **RF-04** | Copiado Individual | Usuario | El sistema debe permitir copiar individualmente cualquier ficha de recurso con un solo clic (ya sea sobre la tarjeta o sobre su botón *"Copiar"*), enviando al portapapeles el texto formateado: `titulo: [Nombre]\nurl: [Enlace]`, acompañado de un indicador visual temporal (`¡Copiado!`). |
| **RF-05** | Copiado Masivo | Usuario | El sistema debe proveer dos mecanismos de copiado masivo:<br>1. Botón *"Copiar todo"* en la cabecera del widget.<br>2. Botón *"Copiar todo y cerrar"* en el pie del widget.<br>Ambos consolidan todos los recursos con separación de doble salto de línea. |
| **RF-06** | Scroll Dinámico Inteligente | Sistema | El contenedor vertical de fichas debe ajustar dinámicamente su altura visible según la cantidad de elementos:<br>• **Hasta 6 recursos (`<= 6`):** Altura natural y compacta sin barras de desplazamiento.<br>• **Más de 6 recursos (`> 6`):** La altura máxima se limita con precisión a la base de la 6ta ficha (`.con-scroll`) y se habilita el scroll vertical (`overflow-y: auto`), garantizando que la ventana no invada la pantalla. |
| **RF-07** | Control de Sesión y Persistencia por Curso | Usuario / Sistema | • Al cerrar la ventana flotante (con el botón **"✕"** o **"Copiar todo y cerrar"**), el sistema registra el curso como cerrado en el almacenamiento de sesión de la pestaña (`sessionStorage`).<br>• Mientras no se cierre la pestaña, el widget se mantendrá cerrado aunque el alumno navegue entre páginas hijas del mismo curso (ej. `id=103&mainsection=4&chall=9`).<br>• Si la URL cambia a un curso distinto (ej. `id=104`), el estado se reinicia automáticamente y la ventana vuelve a abrirse para el nuevo curso. |
| **RF-08** | Interfaz Flotante Arrastrable | Usuario | El sistema debe permitir arrastrar libremente la ventana flotante por la pantalla mediante eventos de ratón en la cabecera (Drag & Drop), restringiendo las coordenadas para evitar que la ventana se desplace fuera del área visible del navegador. |

---

## 3. Requerimientos No Funcionales (RNF)

Siguiendo la clasificación de ingeniería de software de **Ian Sommerville**:

### 3.1. Requerimientos de Producto

* **RNF-P01 (Arquitectura y Plataforma):** El software debe apegarse a la especificación **Google Chrome Extensions Manifest V3**, siendo compatible con navegadores basados en Chromium versión 109.0 o superior (Chrome, Edge, Brave, Opera) y Firefox Gecko.
* **RNF-P02 (Tecnología Base y Ligereza):** El sistema debe estar programado en **Vanilla JavaScript moderno (ES6+)**, sin frameworks pesados ni dependencias de terceros, asegurando un consumo mínimo de memoria RAM y CPU.
* **RNF-P03 (Encapsulamiento y Aislamiento de Estilos):** La interfaz visual del widget debe renderizarse dentro de un **Shadow DOM (`mode: 'closed'`)**, garantizando que los estilos CSS de la plataforma Moodle del campus UVEG no deformen el widget y que los estilos del widget no alteren la página del campus.
* **RNF-P04 (Rendimiento y Observación no bloqueante):** La detección de inserciones dinámicas en el DOM debe ejecutarse mediante un `MutationObserver` con técnica de *debounce* (`ESPERA_REVISION_MS = 350 ms`), evitando sobrecarga en el hilo principal del navegador.
* **RNF-P05 (Identidad Visual y Usabilidad):** La interfaz gráfica debe respetar la identidad visual de la UVEG utilizando su azul institucional (`#1e40af`), bordes de alto contraste (`1.5px solid #1e40af`), tipografía legible del sistema y retroalimentación inmediata en hover y clic.
* **RNF-P06 (Tamaño de Almacenamiento):** La extensión completa instalada no debe superar los **5 MB** de almacenamiento en disco, incluyendo activos gráficos optimizados en PNG.

### 3.2. Requerimientos de Organización

* **RNF-O01 (Formato de Intercambio Uniforme):** Toda salida copiada al portapapeles debe tener la estructura estándar:
  ```text
  titulo: [Nombre de la lección o reto]
  url: [URL del interactivo o Genially]
  ```
  Asegurando compatibilidad inmediata con Microsoft Word, Excel, Bloc de notas, Google Docs y formularios de entrega.
* **RNF-O02 (Control de Versiones y Trazabilidad):** El código debe versionarse en Git utilizando la especificación de versionado semántico (*SemVer*: `MAJOR.MINOR.PATCH`).
* **RNF-O03 (Identidad del Paquete):** El paquete de la extensión debe nombrarse oficialmente como `"UVEG - Lecciones bloc de notas"`.

### 3.3. Requerimientos Externos

* **RNF-E01 (Privacidad de Datos y Legislación):** Cumpliendo con la **Ley Federal de Protección de Datos Personales en Posesión de los Particulares (LFPDPPP)** de México y las Políticas de Desarrollador de Chrome Web Store:
  - El sistema **no recopila, no almacena y no transmite** datos personales, correos, nombres de usuario ni credenciales del alumno a ningún servidor externo.
  - Todo procesamiento de texto e iframes se ejecuta 100% de manera local y en memoria en el equipo del alumno.
* **RNF-E02 (Delimitación de Seguridad de Dominio):** La extensión restringe su inyección exclusivamente a los dominios autorizados en `manifest.json`:
  - `https://avalicmod19d.uveg.edu.mx/*` (Campus Virtual oficial)
  - `http://localhost/*` y `http://127.0.0.1/*` (Entornos de depuración)

---

## 4. Matriz de Priorización (MoSCoW)

| Prioridad | Requerimientos Incluidos | Justificación |
| :--- | :--- | :--- |
| **Must Have (Obligatorio)** | RF-01, RF-03, RF-04, RF-07, RNF-P01, RNF-E01 | Funcionalidad nuclear: detectar, ordenar, copiar y recordar cierre por curso. |
| **Should Have (Deseable)** | RF-02, RF-05, RF-06, RNF-P03, RNF-P04 | Automatización multi-sección, scroll inteligente y aislamiento Shadow DOM. |
| **Could Have (Opcional)** | RF-08, RNF-P05 | Capacidad de arrastrar la ventana y personalización estética avanzada. |
| **Won't Have (Descartado)** | Almacenamiento en la nube de enlaces del alumno | Descartado por cumplimiento estricto de privacidad y para evitar costos de servidor. |
