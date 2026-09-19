const fs=require('node:fs'),path=require('node:path');
const root=__dirname,source=path.join(root,'public');
const html=fs.readFileSync(path.join(source,'index.html'),'utf8');
// Keep independently cached assets in both GitHub Pages deployment modes.
for(const entry of fs.readdirSync(source,{withFileTypes:true}))if(entry.isFile())fs.copyFileSync(path.join(source,entry.name),path.join(root,entry.name));
let standalone=html.replace(/<link rel="stylesheet" href="([^"]+)">/g,(_,file)=>'<style>'+fs.readFileSync(path.join(source,file),'utf8')+'</style>');
standalone=standalone.replace(/<script defer src="(security.js|privacy.js|app.js)"><\/script>/g,(_,file)=>'<script>'+fs.readFileSync(path.join(source,file),'utf8')+'</script>');
standalone=standalone.replaceAll('<script defer src="https://www.gstatic.com','<script src="https://www.gstatic.com');
fs.writeFileSync(path.join(root,'classe-connect-ameliore.html'),standalone);
console.log('Pages et ressources synchronisées.');
