import fs from 'node:fs';
import {build} from 'esbuild';
import {buildCurrentModel} from './current-spatial.js';
import {writeModelMarkers} from '../tools/build-model-markers.mjs';
import {readingMarkerData} from '../tools/build-reader-markers.mjs';
const graph=JSON.parse(fs.readFileSync('../scene_graph.json','utf8'));
const flow=JSON.parse(fs.readFileSync('../scene-flow.json','utf8'));
buildCurrentModel(graph,flow);
writeModelMarkers();
await build({entryPoints:['screenplay-reader.js'],bundle:true,minify:true,format:'iife',globalName:'ScreenplayMarkers',outfile:'../screenplay-markers.js',legalComments:'inline',define:{__READING_MARKERS__:JSON.stringify(readingMarkerData())}});
console.log('Built shared screenplay reading markers.');
for(const [entry,template,output] of [['current-model.js','current-template.html','index.html'],['model-source.js','template.html','editor.html']]) {
 const result=await build({entryPoints:[entry],bundle:true,minify:true,format:'iife',write:false,legalComments:'inline'});
 const html=fs.readFileSync(template,'utf8').replace('/* APP_BUNDLE */',()=>result.outputFiles[0].text.replaceAll('</script','<\\/script'));
 fs.writeFileSync(output,html);
 console.log(`Built ${output} with Three.js and scene data embedded.`);
}
