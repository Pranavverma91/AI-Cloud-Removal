import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {build}=require(createRequire(require.resolve('vite/package.json')).resolve('esbuild'));
await build({entryPoints:['frontend/workers/personal.worker.ts'],outfile:'frontend/public/personal-worker.js',bundle:true,format:'iife',platform:'browser',target:'es2022',minify:true,logLevel:'warning'});
