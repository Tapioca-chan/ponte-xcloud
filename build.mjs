import {build} from 'esbuild';
import {mkdir,cp} from 'node:fs/promises';
await mkdir('dist',{recursive:true}); await cp('public','dist',{recursive:true});
await build({entryPoints:['src/client.ts'],outfile:'dist/app.js',bundle:true,platform:'browser',target:'chrome80',format:'iife',drop:['console']});
await build({entryPoints:['src/server.ts'],outfile:'build/server.mjs',bundle:true,platform:'node',target:'node22',format:'esm',packages:'external'});
