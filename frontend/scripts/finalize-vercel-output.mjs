import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const frontendRoot = path.resolve(__dirname, '..');
const distDir = path.join(frontendRoot, 'dist');
const outputDir = path.join(frontendRoot, '.vercel', 'output');
const staticDir = path.join(outputDir, 'static');

const backendUrl = (process.env.BACKEND_URL || process.env.VITE_API_URL || '')
  .trim()
  .replace(/\/$/, '');

console.log(
  `[vercel] finalize-vercel-output: BACKEND_URL=${backendUrl || '(not set — API proxy disabled)'}`
);

if (!fs.existsSync(distDir)) {
  console.error('[vercel] dist/ not found — vite build must run before finalize-vercel-output');
  process.exit(1);
}

fs.rmSync(outputDir, { recursive: true, force: true });
fs.mkdirSync(staticDir, { recursive: true });
fs.cpSync(distDir, staticDir, { recursive: true });

const routes = [];

if (backendUrl) {
  routes.push({
    src: '/api/(.*)',
    dest: `${backendUrl}/api/$1`,
  });
  console.log(`[vercel] API proxy route enabled: /api/* -> ${backendUrl}/api/*`);
} else {
  console.warn(
    '[vercel] BACKEND_URL is not set. Add it in Vercel Environment Variables (your Render URL, e.g. https://kumbuka-api.onrender.com).'
  );
}

routes.push({ handle: 'filesystem' });
routes.push({
  src: '/(.*)',
  dest: '/index.html',
});

const config = {
  version: 3,
  routes,
};

fs.writeFileSync(path.join(outputDir, 'config.json'), `${JSON.stringify(config, null, 2)}\n`);
console.log('[vercel] Wrote .vercel/output/config.json for Build Output API routing');
