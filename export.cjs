const fs=require('node:fs');
const path=require('node:path');
const read=file=>fs.readFileSync(path.join(__dirname,file),'utf8');
let html=read('public/index.html');
html=html.replace('<link rel="stylesheet" href="base.css"><link rel="stylesheet" href="design.css">',()=>'<style>'+read('public/base.css')+'\n'+read('public/design.css')+'</style>');
html=html.replace('<script src="app.js"></script>',()=>'<script>'+read('public/app.js')+'</script>');
fs.writeFileSync(path.join(__dirname,'classe-connect-ameliore.html'),html);
console.log('Version HTML autonome créée.');
