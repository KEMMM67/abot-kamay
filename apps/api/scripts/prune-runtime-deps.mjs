// apps/api/scripts/prune-runtime-deps.mjs
//
// Removes packages the API never loads at runtime from a production install (the Docker prod-deps
// stage; run from the repository root after `npm ci --workspace @abotkamay/api --omit=dev`).
//
// Why: `--omit=dev` keeps the Prisma CLI and TypeScript, because besides being dev dependencies they
// are optional peers of @prisma/client, and with them come Prisma Studio, a local Postgres (PGlite)
// and React: about half of node_modules. The generated Prisma client is compiled into dist and loads
// none of them.
//
// How: walk package-lock.json from apps/api's production dependencies (dependencies,
// optionalDependencies and required peers, never optional peers), resolving names the way Node does,
// and delete every installed top-level package outside that set. It refuses to run if the result
// would lose a package the API imports directly.
import { existsSync, readdirSync, readFileSync, rmSync } from 'node:fs';

const lock = JSON.parse(readFileSync('package-lock.json', 'utf8'));
const packages = lock.packages ?? {};
const api = packages['apps/api'];
if (!api?.dependencies) throw new Error('package-lock.json has no apps/api workspace');

/** The lockfile key Node would load for `name` required from the package at `from`. */
function resolve(from, name) {
  let dir = from;
  for (;;) {
    const key = `${dir ? `${dir}/` : ''}node_modules/${name}`;
    if (packages[key]) return key;
    if (!dir) return null;
    const cut = dir.lastIndexOf('/node_modules/');
    dir = cut === -1 ? '' : dir.slice(0, cut);
  }
}

const needed = new Set();
const queue = Object.keys(api.dependencies).map((name) => ['', name]);
while (queue.length > 0) {
  const [from, name] = queue.shift();
  const key = resolve(from, name);
  if (!key || needed.has(key)) continue;
  needed.add(key);
  const entry = packages[key];
  for (const dep of Object.keys({ ...entry.dependencies, ...entry.optionalDependencies }))
    queue.push([key, dep]);
  for (const dep of Object.keys(entry.peerDependencies ?? {})) {
    if (!entry.peerDependenciesMeta?.[dep]?.optional) queue.push([key, dep]);
  }
}

for (const name of Object.keys(api.dependencies)) {
  if (!needed.has(`node_modules/${name}`)) throw new Error(`Refusing to prune: ${name} would be removed`);
}

const installed = readdirSync('node_modules').flatMap((name) => {
  if (name.startsWith('.')) return [];
  if (!name.startsWith('@')) return [name];
  return readdirSync(`node_modules/${name}`).map((scoped) => `${name}/${scoped}`);
});
const removed = installed.filter((name) => !needed.has(`node_modules/${name}`));
for (const name of removed) rmSync(`node_modules/${name}`, { recursive: true, force: true });
for (const scope of new Set(
  removed.filter((name) => name.startsWith('@')).map((name) => name.split('/')[0]),
)) {
  if (existsSync(`node_modules/${scope}`) && readdirSync(`node_modules/${scope}`).length === 0) {
    rmSync(`node_modules/${scope}`, { recursive: true });
  }
}
console.log(`Pruned ${removed.length} packages the API does not load at runtime (${needed.size} kept).`);
