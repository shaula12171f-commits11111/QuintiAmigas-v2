import c0 from './app_chunk_0.js';
import c1 from './app_chunk_1.js';
import c2 from './app_chunk_2.js';
import c3 from './app_chunk_3.js';
const code = c0+c1+c2+c3;
const pageBase = new URL('./', location.href).href;
const fixed = code.replace(/from\s+['"](\.\/[^'"]+)['"]/g, (_, p) => {
  return "from '" + new URL(p, pageBase).href + "'";
});
const blob = new Blob([fixed], { type: 'text/javascript' });
await import(URL.createObjectURL(blob));
