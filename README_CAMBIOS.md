# Bitácora de cambios — QuintiAmigas v2

Cada entrada tiene fecha/hora y archivo de respaldo para poder volver atrás.

---

## 2026-09-26 10:38:22 -0500 — Inventario looks solo por nombre de tag

**Qué**
- El inventario de cosplay/ropa se filtra **solo por el nombre del tag** (no por descripción).
- Se excluyen tags de acto sexual aunque digan "ropa" (ej. `nino_chupa_pene_ropa_idol`).
- Diálogo en natural: sin menú de nombres técnicos de tags.

**Respaldo:** `respaldos/logica_20260926_103821.js`

**Tipo:** filtro por nombre + instrucción de diálogo. Mejora real.


## 2026-09-26 10:28:01 -0500 — Inventario real cosplay/ropa (imagenes.js)

**Qué**
- Si preguntan qué cosplay/ropa tienen, se inyecta la lista real de tags+descripciones de `imagenes.js`.
- Si una chica no tiene ninguno: debe decir que **no tiene** (no inventar gatita/Sailor Moon).

**Respaldo:** `respaldos/logica_20260926_102759.js`

**Tipo:** datos reales del catálogo + instrucción IA. Mejora real de coherencia texto/imagen.


## 2026-09-26 10:00:33 -0500 — Un mensaje por chica (fusionar bloques)

**Qué**
- Si la IA devuelve varios `[Ichika]:` en el mismo turno, se fusionan en **un solo** mensaje.
- Prompt: máximo un bloque `[Nombre]:` por personaje por turno.

**Por qué**
- Un mensaje del usuario generaba 3 burbujas de la misma chica.

**Respaldo:** `respaldos/logica_20260926_100031.js`

**Tipo:** lógica necesaria de presentación + instrucción a la IA. Mejora real.


## 2026-09-26 09:22:29 -0500 — Estado de ropa cosplay (tag dinámico)

**Qué**
- Estado `cosplay` al pedir cosplay/disfraz/uniforme.
- Plural ("pónganse") aplica a chicas activas/nombradas.
- Selector IA prioriza tags de look cosplay si existen; sin tag fijo obligatorio.
- Narración: describir el cambio de traje.

**Respaldo:** `respaldos/logica_20260926_092114.js`

**Tipo:** mínimo necesario (estado ropa) + decisión dinámica de imagen. Mejora real.


## 2026-09-26 08:23:38 -0500 — Invitación vs acto (tags dinámicos)

**Qué se cambió**
- Selector de tags (Qwen): nueva regla contextual **invitación/preparación vs acto en curso**.
- `detectarPoseSexualEnTexto`: ya no trata “por detrás / culo / empujar” sin verbo de acto como sexo en curso (evita forzar `doggystyle` localmente).
- La decisión fina la hace la **IA** según el texto, no una lista fija de tags tipo `enseñando_culo`.

**Por qué**
- Caso real: Nino solo se ofrecía en el hotel (pose) y el bot ponía imagen de doggystyle de penetración.

**Archivos tocados**
- `logica.js` (en repo: `src/core/logica.js`)

**Respaldo para restaurar**
- `respaldos/logica_20260926_082320.js`
- Para volver: copiá ese archivo sobre `logica.js` / `src/core/logica.js`.

**Tipo de mejora**
- Dinámica (IA decide) + freno local suave anti falso positivo.
- Mejora real de coherencia imagen/escena.
