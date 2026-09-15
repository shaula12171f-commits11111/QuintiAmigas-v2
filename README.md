# QuintiAmigas v2

Chatbot de roleplay con las Quintillizas Nakano (y Emilia). Versión limpia basada en los principios del proyecto original, con arquitectura más simple y control de escena más realista.

## Mejoras respecto a la versión anterior

- **Progresión realista**: no salta al sexo solo porque digas "vamos al hotel". Hay llegada + confirmación.
- **Diálogos más sueltos**: las chicas hablan de forma más directa, vulgar y cachonda según su personalidad.
- **Anti-censura reforzado**: system prompt y reintentos orientados a no romper el rol +18.
- **Código más limpio**: menos estados frágiles, menos lógica amontonada en un solo archivo.
- **API keys en localStorage**: usá el botón **🔑 APIs** en la app (no las subas al repo público).

## Cómo usar

1. Abrí la app (GitHub Pages o `index.html` local).
2. Tocá **🔑 Administrar API keys**, pegá tu key de Groq y una nota (ej. el correo).
3. Elegí una chica y chatea.

> `config.js` ya no debe tener keys reales. Solo modelos y nombre por defecto.

## Estructura

```
src/
  core/           # motor y prompts
  characters/     # personalidades
  systems/        # apiKeys, imágenes, tags, etc.
config.example.js
index.html
```

## Notas

- Contenido +18. Todos los personajes son adultos (23 años / Emilia 18 aparentes).
- Proyecto personal de roleplay.
