# Fichas Técnicas de Casos de Uso

**Proyecto:** UVEG - Lecciones bloc de notas  
**Versión:** 1.5.0  
**Fecha:** 2026-10-24  

---

### Ficha: CU001
* **Código:** `CU001`
* **Caso de uso:** Detectar y listar recursos del curso
* **Fuente:** Requerimiento nuclear de automatización de interactivos UVEG
* **Actor:** Alumno / Docente UVEG, Campus Virtual Moodle
* **Descripción:** El sistema rastrea los iframes incrustados en la vista del curso actual y en las secciones complementarias, ordenándolos alfanuméricamente y mostrándolos en una tarjeta flotante.
* **Flujo básico o principal:**
  1. El usuario navega a un curso en el Campus Virtual UVEG (`/course/view.php?id=[idCurso]`).
  2. La extensión comprueba que el dominio y ruta sean válidos y que el curso no haya sido cerrado previamente en la pestaña.
  3. El sistema inspecciona el DOM de la página activa en busca de iframes que apunten a Genially o recursos UVEG (`mainsection=2,3,4`).
  4. El sistema extrae el título de cada recurso (desde atributos `title`, `aria-label` o cabeceras `.instancename`).
  5. El sistema lanza en paralelo (`Promise.allSettled`) peticiones asíncronas para escanear las demás secciones (`mainsection=2, 3, 4`) pertenecientes al mismo `id` de curso.
  6. El sistema acumula todos los recursos encontrados evitando duplicados de URL.
  7. El sistema ordena la lista completa mediante ordenamiento natural alfanumérico (`L1, L2, L3... Reto 1, Reto 2...`).
  8. El sistema inyecta en el DOM un contenedor Host con Shadow DOM (`closed`) y renderiza la tarjeta flotante con el total de recursos ordenados.
* **Flujo alternativo:**
  * **A1 - Página sin recursos interactivos o sin sección permitida:**
    1. En el paso 3, si no se encuentran iframes de Genially ni secciones interactivas, el sistema no despliega la ventana flotante y permanece en espera de cambios en el DOM.
* **Flujo excepcional:**
  * **E1 - Error en petición de red a secciones paralelas:**
    1. En el paso 5, si una petición de red falla o responde con código de error HTTP, el sistema captura el fallo con `Promise.allSettled`, omite esa sección sin interrumpir la ejecución y renderiza los recursos de las secciones que sí respondieron correctamente.
* **Pre-condiciones:**
  1. El usuario debe tener la extensión instalada y habilitada en el navegador.
  2. El usuario debe encontrarse autenticado en la plataforma `avalicmod19d.uveg.edu.mx`.
* **Post-condiciones:**
  1. La tarjeta flotante se muestra visible en el lateral de la pantalla con las fichas de los recursos ordenadas.
* **Puntos de extensión:** Ninguno.
* **Puntos de inclusión:** `CU004: Navegar lista con scroll (> 6 fichas)` si el total de recursos supera los 6.
* **Notas:** Toda la renderización ocurre en Shadow DOM para garantizar total aislamiento con el CSS de Moodle.

---

### Ficha: CU002
* **Código:** `CU002`
* **Caso de uso:** Copiar recurso individual
* **Fuente:** Requerimiento de portapapeles rápido para tareas y apuntes
* **Actor:** Alumno / Docente UVEG
* **Descripción:** Permite al usuario copiar al portapapeles el título y URL de un recurso específico con un solo clic.
* **Flujo básico o principal:**
  1. El usuario ubica el recurso deseado en la lista de la tarjeta flotante.
  2. El usuario hace clic sobre la ficha del recurso o sobre su botón azul *"Copiar"*.
  3. El sistema genera la cadena de texto con el formato: `titulo: [Título del recurso]\nurl: [URL del recurso]`.
  4. El sistema escribe la cadena en el portapapeles mediante la API nativa `navigator.clipboard.writeText`.
  5. El sistema cambia visualmente el estilo de la ficha y el botón a verde esmeralda con el texto *"¡Copiado!"* y un ícono de verificación.
  6. Tras 1.8 segundos (`DURACION_AVISO_MS`), el sistema restablece la ficha a su estado azul original.
* **Flujo alternativo:**
  * **A1 - Entorno sin permisos de Clipboard API:**
    1. En el paso 4, si `navigator.clipboard` arroja una excepción, el sistema crea dinámicamente un `<textarea>` temporal invisible fuera de pantalla, ejecuta `document.execCommand('copy')` y retira el elemento inmediatamente.
* **Flujo excepcional:**
  * **E1 - Portapapeles bloqueado por el sistema operativo:**
    1. Si ambos métodos fallan, la ficha no muestra el estado de éxito y no se interrumpe la navegación del usuario.
* **Pre-condiciones:** La tarjeta flotante debe estar visible con al menos 1 recurso listado.
* **Post-condiciones:** El texto formateado queda listo en el portapapeles para pegarse con `Ctrl + V`.
* **Puntos de extensión:** Ninguno.
* **Puntos de inclusión:** Ninguno.
* **Notas:** No se alteran otros contenidos del portapapeles hasta que el usuario realiza el clic voluntario.

---

### Ficha: CU003
* **Código:** `CU003`
* **Caso de uso:** Copiar todos los recursos del curso
* **Fuente:** Requerimiento de recopilación masiva para estudio offline o reportes
* **Actor:** Alumno / Docente UVEG
* **Descripción:** Concatena todos los recursos detectados en el curso en un único bloque de texto y los copia al portapapeles.
* **Flujo básico o principal:**
  1. El usuario hace clic en el botón *"Copiar todo"* en la cabecera de la tarjeta (o en *"Copiar todo y cerrar"* en el pie).
  2. El sistema recorre todos los elementos de la colección `itemsAcumulados` ordenados.
  3. El sistema formatea cada elemento y los une con un doble salto de línea (`\n\n`).
  4. El sistema copia la cadena resultante al portapapeles del sistema operativo.
  5. El botón pulsado cambia temporalmente a color verde con la leyenda *"¡Copiados!"* (o *"¡Todo copiado!"*).
* **Flujo alternativo:**
  * **A1 - Acción "Copiar todo y cerrar":**
    1. Si el usuario utilizó el botón inferior *"Copiar todo y cerrar"*, tras copiar y mostrar el aviso, el sistema invoca automáticamente a `CU005` para registrar el cierre en `sessionStorage` y retirar el widget tras 600 ms.
* **Flujo excepcional:** Ninguno.
* **Pre-condiciones:** La tarjeta flotante debe tener al menos 1 recurso acumulado.
* **Post-condiciones:** Todos los recursos quedan en el portapapeles en orden alfanumérico.
* **Puntos de extensión:** `CU005: Cerrar widget y persistir estado en curso` (cuando se usa el botón de pie).
* **Puntos de inclusión:** Ninguno.
* **Notas:** Compatible con cualquier editor de notas o suite ofimática.

---

### Ficha: CU004
* **Código:** `CU004`
* **Caso de uso:** Navegar lista con scroll (> 6 fichas)
* **Fuente:** Requerimiento de optimización visual y control de ocupación de pantalla
* **Actor:** Alumno / Docente UVEG
* **Descripción:** Regula la altura del contenedor para que, si el curso tiene más de 6 recursos, la ventana muestre 6 fichas completas y habilite scrollbar vertical para navegar el resto.
* **Flujo básico o principal:**
  1. El sistema contabiliza el total de recursos en `items.length`.
  2. Al detectar que `items.length > 6`, el sistema aplica la clase `.con-scroll` al contenedor `.lista-scroll`.
  3. El sistema mide la posición inferior (`bottom`) de la sexta ficha (`tarjetas[5]`) respecto al contenedor scroll, sumando el padding inferior.
  4. El sistema asigna dicha medida en píxeles a `style.maxHeight`.
  5. El navegador activa la barra de scroll vertical estilizada (`::-webkit-scrollbar`).
  6. El usuario utiliza la rueda del ratón o la barra de desplazamiento para visualizar los recursos a partir del séptimo.
* **Flujo alternativo:**
  * **A1 - Curso con 6 o menos recursos (`<= 6`):**
    1. En el paso 2, el sistema detecta que no supera 6 elementos.
    2. El sistema remueve `.con-scroll` y fija `maxHeight = 'none'`.
    3. Todas las fichas se visualizan completas sin barra de scroll.
* **Flujo excepcional:**
  * **E1 - Pantalla con resolución vertical pequeña (ej. laptops de 600px de altura):**
    1. En el paso 4, si la altura calculada de las 6 fichas compromete la visibilidad de la pantalla, el sistema aplica un tope proporcional de `window.innerHeight * 0.75 - 130` garantizando que el widget quepa íntegramente.
* **Pre-condiciones:** `CU001` ejecutado y tarjeta flotante renderizada en pantalla.
* **Post-condiciones:** La tarjeta flotante mantiene dimensiones estables y no tapa el área principal de lectura.
* **Puntos de extensión:** Ninguno.
* **Puntos de inclusión:** Ninguno.
* **Notas:** Evita la aparición de 10 o más fichas de golpe que antes saturaban la vista.

---

### Ficha: CU005
* **Código:** `CU005`
* **Caso de uso:** Cerrar widget y persistir estado en curso
* **Fuente:** Requerimiento de persistencia por pestaña para no interrumpir el estudio
* **Actor:** Alumno / Docente UVEG
* **Descripción:** Cierra la ventana flotante y almacena en la sesión de la pestaña que el curso actual ya fue cerrado, evitando que vuelva a abrirse mientras se navegue dentro del mismo curso.
* **Flujo básico o principal:**
  1. El usuario hace clic en el botón de cerrar ("✕") de la cabecera o en "Copiar todo y cerrar".
  2. El sistema obtiene el ID del curso actual desde la URL (parámetro `id=...`).
  3. El sistema guarda en `sessionStorage`: `sessionStorage.setItem('uveg_curso_cerrado_' + courseId, 'true')`.
  4. El sistema destruye el elemento host del Shadow DOM de la página.
  5. El usuario hace clic en cualquier enlace interno o hijo del mismo curso (ej. `&mainsection=4&chall=9`, `&mainsection=2`, retos).
  6. La extensión detecta el evento de navegación (`popstate`, `pushState` o recarga).
  7. El sistema verifica el `id` del curso en la URL y consulta `sessionStorage`.
  8. Al estar marcado como cerrado, el sistema aborta la apertura y mantiene la pantalla limpia.
* **Flujo alternativo:**
  * **A1 - Cierre de pestaña del navegador:**
    1. El usuario cierra la pestaña del navegador y más tarde abre una nueva pestaña hacia el mismo curso.
    2. Por especificación web, `sessionStorage` se limpia automáticamente.
    3. La extensión vuelve a abrir la ventana en la nueva pestaña de forma natural.
* **Flujo excepcional:**
  * **E1 - Modo incógnito estricto con almacenamiento bloqueado:**
    1. Si `sessionStorage` no permite escritura, el sistema mantiene el descarte en la variable local `descartado = true` en memoria mientras dure la página activa.
* **Pre-condiciones:** Tarjeta flotante visible en pantalla.
* **Post-condiciones:** El widget desaparece y no vuelve a mostrarse en esa pestaña para ese curso.
* **Puntos de extensión:** Ninguno.
* **Puntos de inclusión:** Ninguno.
* **Notas:** Satisface la regla: *"mientras no cierres la pestaña se va a mantener cerrado aunque cambies entre hijos"*.

---

### Ficha: CU006
* **Código:** `CU006`
* **Caso de uso:** Reiniciar widget por cambio de curso
* **Fuente:** Requerimiento de detección multi-curso en misma pestaña
* **Actor:** Alumno / Docente UVEG, Campus Virtual Moodle
* **Descripción:** Al cambiar el identificador del curso (`id=`) en la URL, el sistema limpia la memoria del curso previo y reabre automáticamente el widget para el nuevo curso.
* **Flujo básico o principal:**
  1. El usuario, habiendo cerrado previamente un curso (ej. `id=103`), navega hacia otro curso diferente en la misma pestaña (ej. `id=104`).
  2. La extensión detecta el cambio de URL y extrae el nuevo ID: `courseId = '104'`.
  3. El sistema compara el nuevo ID contra `ultimoCursoIdRegistrado` (`'104' !== '103'`).
  4. Al detectar la discrepancia, el sistema reinicia el estado interno:
     - Limpia los recursos acumulados (`itemsAcumulados = []`).
     - Resetea la firma visual y último curso escaneado.
     - Consulta si `uveg_curso_cerrado_104` está en `sessionStorage`.
  5. Al no estar cerrado el curso `104`, el sistema invoca a `CU001`.
  6. La ventana flotante se abre automáticamente desplegando los recursos del curso `104`.
* **Flujo alternativo:**
  * **A1 - Retorno a un curso previamente cerrado:**
    1. Si el usuario vuelve a navegar a `id=103` en esa misma pestaña, el sistema consulta `sessionStorage` para `103`, detecta que fue cerrado previamente y lo mantiene cerrado.
* **Flujo excepcional:** Ninguno.
* **Pre-condiciones:** Navegación hacia una URL válida con parámetro `id=` distinto al curso activo anterior.
* **Post-condiciones:** La ventana se encuentra abierta con la información fresca del nuevo curso.
* **Puntos de extensión:** Ninguno.
* **Puntos de inclusión:** `CU001: Detectar y listar recursos del curso`.
* **Notas:** Satisface la regla: *"si en dado caso cambia de id= por 104 ahí se reinicia y se vuelve a abrir"*.

---

### Ficha: CU007
* **Código:** `CU007`
* **Caso de uso:** Arrastrar y posicionar ventana flotante
* **Fuente:** Ergonomía visual para lectura sin obstrucciones
* **Actor:** Alumno / Docente UVEG
* **Descripción:** Permite reubicar manualmente la ventana en cualquier posición de la pantalla arrastrándola desde su cabecera con el ratón.
* **Flujo básico o principal:**
  1. El usuario sitúa el cursor sobre la cabecera del widget (el cursor cambia a icono de mano `grab`).
  2. El usuario presiona el botón izquierdo del ratón (`mousedown`) sobre la cabecera.
  3. El cursor cambia a `grabbing` y el sistema registra las coordenadas iniciales (`clientX`, `clientY`) y la posición absoluta del widget.
  4. El usuario mueve el ratón (`mousemove`).
  5. El sistema calcula el desplazamiento delta y actualiza las propiedades `style.left` y `style.top` del widget.
  6. El sistema aplica límites de contención con `Math.min` y `Math.max` para impedir que la tarjeta salga de los márgenes visibles de la pantalla (mínimo 10px de margen).
  7. El usuario suelta el botón del ratón (`mouseup`) y el widget queda fijo en la nueva ubicación.
* **Flujo alternativo:** Ninguno.
* **Flujo excepcional:**
  * **E1 - Intento de arrastrar haciendo clic sobre los botones de la cabecera:**
    1. En el paso 2, si el clic se realiza sobre los botones *"Copiar todo"* o *"✕"*, el sistema detecta `target.closest('button')` y omite el inicio del arrastre para permitir el clic normal.
* **Pre-condiciones:** Tarjeta flotante visible en pantalla.
* **Post-condiciones:** La tarjeta permanece en las coordenadas elegidas por el usuario hasta nueva recarga.
* **Puntos de extensión:** Ninguno.
* **Puntos de inclusión:** Ninguno.
* **Notas:** Permite al alumno estudiar cómodamente sin que la tarjeta tape diagramas o textos del aula virtual.
