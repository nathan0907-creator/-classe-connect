// GitHub Pages also redirects at the edge. This guards copied/custom deployments.
if(location.protocol==='http:'&&!['localhost','127.0.0.1','[::1]'].includes(location.hostname))location.replace('https:'+location.href.slice(location.protocol.length));
