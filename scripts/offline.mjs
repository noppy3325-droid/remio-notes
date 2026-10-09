import { readdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
const files = [];
async function walk(path) {
  for (const item of await readdir("dist" + path, { withFileTypes: true })) {
    const p = path + "/" + item.name;
    if (item.isDirectory()) await walk(p);
    else if (item.name !== "sw.js") files.push(p);
  }
}
await walk("");
const hash = createHash("sha256");
for (const file of files) hash.update(await readFile("dist" + file));
const cache = "knowledge-notes-" + hash.digest("hex").slice(0, 16);
await writeFile(
  "dist/sw.js",
  `const CACHE=${JSON.stringify(cache)};const FILES=${JSON.stringify(files)};
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(FILES)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('knowledge-notes-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{if(e.request.method!=='GET'||new URL(e.request.url).origin!==self.location.origin)return;const path=new URL(e.request.url).pathname;if(path.startsWith('/auth/')||path.startsWith('/api/'))return; if(!FILES.includes(path)&&e.request.mode!=='navigate')return;e.respondWith(caches.open(CACHE).then(async c=>{if(e.request.mode==='navigate'){try{return await fetch(e.request)}catch{return c.match('/index.html',{ignoreVary:true})}}return (await c.match(e.request,{ignoreVary:true}))||fetch(e.request)}))});
`,
);
console.log("Offline cache generated:", files.length, "assets");
