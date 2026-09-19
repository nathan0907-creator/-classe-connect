const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'public');
http.createServer((req,res)=>{
  let route;try{route=decodeURIComponent(new URL(req.url,'http://localhost').pathname);}catch{res.writeHead(400);return res.end();}
  const file=path.resolve(root,'.'+(route==='/'?'/index.html':route));
  if(!file.startsWith(root+path.sep)){res.writeHead(403);return res.end();}
  fs.readFile(file,(err,data)=>{if(err){res.writeHead(404);return res.end('Not found');}res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.xml':'application/xml; charset=utf-8','.txt':'text/plain; charset=utf-8'})[path.extname(file)]||'application/octet-stream');res.setHeader('Cache-Control','no-store');res.end(data);});
}).listen(4180,'127.0.0.1',()=>console.log('ClasseConnect http://127.0.0.1:4180'));
