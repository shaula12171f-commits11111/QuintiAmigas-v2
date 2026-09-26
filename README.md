# QuintiAmigas v2

Chatbot de roleplay con las Quintillizas Nakano (y Emilia). Versión limpia basada en los principios del proyecto original, con arquitectura más simple y control de escena más realista.

## Mejoras respecto a la versión anterior

- **Progresión realista**: no salta al sexo solo porque digas "vamos al hotel". Hay llegada + confirmación.
- **Diálogos más sueltos**: las chicas hablan de forma más directa, vulgar y cachonda según su personalidad.
- **Anti-censura reforzado**: system prompt y reintentos orientados a no romper el rol +18.
- **Código más limpio**: menos estados frágiles, menos lógica amontonada en un solo archivo.
- **API keys en localStorage**: usá el botón **🔑 APIs** en la app (no las subas al repo público).
- **Resumen progresivo**: ya no se manda el historial completo a la IA. Se mantiene un resumen que se actualiza en cada turno (ahorra tokens y evita errores 413).
- **Tags en llamada separada**: la lista grande de tags no va en el prompt principal; el tag de imagen se elige en una segunda API call.
- **Multi mejorado**: si mencionás a otros personajes actuando (ej. Miku y Aldo), también responden.
- **Un bloque por personaje**: si la IA repite `[Ichika]:` varias veces, se fusionan en un solo mensaje.
- **Ropa `cosplay`**: pedido de cosplay/disfraz actualiza el estado; el tag visual lo elige la IA entre los disponibles.
- **Invitación vs acto (tags)**: el selector de imagen (Qwen) decide si hay solo preparación/oferta de pose o sexo en curso. No fuerza `doggystyle` solo porque ella se pone a cuatro o dice “por detrás”.

## Lore (deshabilitado temporalmente)

El lore del mundo (`src/world/lore.js` → `getLore()`) está en **standby**.

- Motivo: reducir el tamaño del system prompt y evitar errores de límite de tokens (Groq 413 / TPM).
- El código de lore **sigue en el repo** como referencia.
- Para reactivarlo: en `src/core/logica.js`, donde se llama a `armarSystemPrompt(...)`, volver a pasar `getLore(estado.nombreUsuario)` en lugar de `''`.

## Cómo usar

1. Abrí la app (GitHub Pages o `index.html` local).
2. Tocá **🔑 Administrar API keys**, pegá tu key de Groq y una nota (ej. el correo).
3. Elegí una chica y chatea.
4. En el chat podés ver el **resumen progresivo** con el botón **📝 Resumen**.

> `config.js` ya no debe tener keys reales. Solo modelos y nombre por defecto.

## Estructura

```
src/
  core/           # motor y prompts
  characters/     # personalidades
  systems/        # apiKeys, imágenes, tags, etc.
  world/          # lore (actualmente en standby)
config.example.js
index.html
```

## Tags: invitación vs acto

El tag de imagen **no es una regla fija de keywords**. La IA (selector de tags) interpreta el contexto:

- **Solo invitación / preparación** (ofrece el culo, “acércate por detrás”, se apoya en la cama) → evita tags de penetración si el acto aún no empezó.
- **Acto en curso** (follar, meter, embestidas, oral activo) → tags de pose sexual normales (`doggystyle`, etc.).

Respaldo de `logica.js` ante cada cambio: carpeta `respaldos/` y bitácora en `README_CAMBIOS.md`.

## Imágenes grupales

Escenas con **2–5 chicas** en la misma acción sobre el usuario (ej. doble mamada) usan una **imagen compartida**.

- Archivo: `src/systems/imagenesGrupales.js`
- Organizado por secciones: **DUOS**, **TRIOS**, **CUARTETOS**, **QUINTETOS**
- Tag ejemplo: `nino_ichika_doble_mamada` (el orden de nombres en el chat no importa al buscar)
- Si no hay URL → fallback a imagen individual por chica
- Agregá solo combinaciones con arte real

## Notas

- Contenido +18. Todos los personajes son adultos (23 años / Emilia 18 aparentes).
- Proyecto personal de roleplay.
