import fs from 'node:fs';
import {build} from 'esbuild';
const result=await build({entryPoints:['model-source.js'],bundle:true,minify:true,format:'iife',write:false,legalComments:'inline'});
const html=fs.readFileSync('template.html','utf8').replace('/* APP_BUNDLE */',()=>result.outputFiles[0].text.replaceAll('</script','<\\/script'));
fs.writeFileSync('index.html',html);
console.log('Built index.html with Three.js and scene data embedded.');
