# QuintiAmigas v2

Chatbot de roleplay con las Quintillizas Nakano (y Emilia). Versión limpia basada en los principios del proyecto original, con arquitectura más simple y control de escena más realista.

## Mejoras respecto a la versión anterior

- **Progresión realista**: no salta al sexo solo porque digas "vamos al hotel". Hay llegada + confirmación.
- **Diálogos más sueltos**: las chicas hablan de forma más directa, vulgar y cachonda según su personalidad.
- **Anti-censura reforzado**: system prompt y reintentos orientados a no romper el rol +18.
- **Código más limpio**: menos estados frágiles, menos lógica amontonada en un solo archivo.
- **API keys fuera del código**: se configuran en `config.js` (no subas keys reales al repo público).

## Cómo usar

1. Copia `config.example.js` → `config.js` y pon tus API keys de Groq.
2. Abre `index.html` en un navegador moderno (o sirve la carpeta con un server local).
3. Elige una chica y chatea.

## Estructura

```
src/
  core/           # motor y prompts
  characters/     # personalidades
  systems/        # memoria ligera, imágenes, fallbacks
config.example.js
index.html
```

## Notas

- Contenido +18. Todos los personajes son adultos (23 años / Emilia 18 aparentes).
- Proyecto personal de roleplay.
