// Copia este archivo como config.js si hace falta.
// Las API keys de Groq YA NO van acá: usá el botón 🔑 APIs en la app
// (se guardan en localStorage del navegador).
//
// NO subas keys reales a un repo público.

export const GROQ_KEYS = []; // legacy vacío — preferí localStorage

export const MODELO = "openai/gpt-oss-120b"; // diálogo de las chicas

// Modelo para selector de tags (debe existir en Groq)
export const MODELO_TAGS = "qwen/qwen3.8-27b";

export const NOMBRE_USUARIO_DEFAULT = "Fabrizio";
