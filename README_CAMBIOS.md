# Bitácora de cambios — QuintiAmigas v2

Cada entrada tiene fecha/hora y archivo de respaldo para poder volver atrás.

---

## 2026-09-26 10:00:31 -0500 — Un mensaje por chica (fusionar bloques)

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
