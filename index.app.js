import b0 from './b64_0.js';
import b1 from './b64_1.js';
import b2 from './b64_2.js';
const code = atob(b0 + b1 + b2);
const pageBase = new URL('./', location.href).href;
const fixed = code.replace(/from\s+['"](\.\/[^'"]+)['"]/g, (_, p) => {
  return "from '" + new URL(p, pageBase).href + "'";
});
const blob = new Blob([fixed], { type: 'text/javascript' });
await import(URL.createObjectURL(blob));
