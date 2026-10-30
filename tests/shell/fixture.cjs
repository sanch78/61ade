const path=require('node:path');
const root=path.resolve(__dirname,'../..');
const built=new Map();
// A frontend fixture bundle (the script output), built on first use and shared by the specs of a worker. Playwright
// loads every spec file in the runner to list the tests, so a top-level build would bundle the frontend once per file
// before any test runs (docs/development.md#browser-tests).
function lazyBundle(contents,options={}){
 const key=JSON.stringify([contents,options]);
 return ()=>{
  if(!built.has(key))built.set(key,require('esbuild').buildSync({stdin:{contents,resolveDir:root},bundle:true,format:'iife',globalName:'fixture',write:false,...options})
   .outputFiles.find(file=>!file.path.endsWith('.css')).text);
  return built.get(key);
 };
}
module.exports={root,lazyBundle};
