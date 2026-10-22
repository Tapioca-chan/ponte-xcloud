import http from 'node:http';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {randomBytes} from 'node:crypto';
import {WebSocketServer,WebSocket} from 'ws';
import Auth from '../vendor/packages/platform/src/controller/auth';
import * as stream from '../vendor/packages/player/src/server/index';
import {sanitize} from './protocol.mjs';
import {gameCard} from './catalog.mjs';
const rooms=new Map<string,any>();
const auth=new Auth();
const port=Number(process.env.PORT||3000);
const origins=(process.env.ALLOWED_ORIGINS||'http://localhost:3000').split(',');
const secret=()=>randomBytes(24).toString('hex');
function reply(res:any,code:number,value:any){res.writeHead(code,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(value));}
const server=http.createServer(async(req,res)=>{
 const origin=req.headers.origin;
 if(origin&&!origins.includes(origin)){reply(res,403,{error:'Origem não autorizada'});return;}
 if(origin)res.setHeader('Access-Control-Allow-Origin',origin);
 res.setHeader('Vary','Origin');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Content-Type-Options','nosniff');
 res.setHeader('Access-Control-Allow-Headers','Content-Type, Authorization');res.setHeader('Access-Control-Allow-Methods','POST, GET, OPTIONS');
 if(req.method==='OPTIONS'){res.writeHead(204);res.end();return;}
 const u=new URL(req.url||'/', 'http://localhost');
 try {
  if(u.pathname==='/health'){reply(res,200,{ok:true,experimental:true});return;}
  if(u.pathname.startsWith('/api/')){
   if(req.method!=='POST'){reply(res,405,{error:'POST obrigatório'});return;}
   let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>131072){reply(res,413,{error:'Pedido grande demais'});return;}}
   const body=JSON.parse(raw||'{}');const action=u.pathname.slice(5);
   if(action==='create'){
    if(rooms.size>=20){reply(res,429,{error:'Limite de salas; tente depois'});return;}
    const id=secret(),tvKey=secret(),phoneKey=secret();rooms.set(id,{tvKey,phoneKey,created:Date.now(),sockets:new Map(),busy:false});reply(res,200,{id,tvKey,phoneKey});return;
   }
   const room=rooms.get(body.room);if(!room||req.headers.authorization!=='Bearer '+room.tvKey){reply(res,401,{error:'Sala inválida ou expirada'});return;}
   if(room.busy){reply(res,409,{error:'Aguarde a operação atual'});return;}
   room.busy=true;
   try {
    if(action==='close'){for(const s of room.sockets.values())s.close();rooms.delete(body.room);reply(res,200,{ok:true});return;}
    if(action==='login'){
     const data=await auth.startMsalAuth();room.device=data;reply(res,200,{user_code:data.user_code,verification_uri:data.verification_uri,expires_in:data.expires_in,interval:data.interval});return;
    }
    if(action==='verify'){
     if(!room.device)throw Error('Inicie o login');
     const user=await auth.verifyDeviceCode(room.device.device_code,1);
     if(!user?.access_token)throw Error('Login ainda não concluído');
     const tokens=await auth.getStreamingTokens(user);const cloud=tokens.xCloudToken?.data;
     if(!cloud?.gsToken)throw Error('Conta sem token xCloud');
     const region=cloud.offeringSettings?.regions?.find((r:any)=>r.isDefault)||cloud.offeringSettings?.regions?.[0];
     const host=new URL(region.baseUri);if(host.protocol!=='https:'||!host.hostname.endsWith('.xboxlive.com'))throw Error('Região inválida');
     room.user=user;room.token={token:cloud.gsToken,market:cloud.market,language:'pt-BR'};room.host=host.origin;delete room.device;reply(res,200,{ok:true});return;
    }
    if(!room.token){reply(res,401,{error:'Faça login primeiro'});return;}
    if(action==='catalog'){
     // Stream availability is account-specific. The Xbox title service provides
     // the IDs, and the public Microsoft catalog provides artwork and names.
     // Fetch a small page to keep low-powered VIDAA browsers responsive.
     const offset=Math.max(0,Math.min(5000,Number.isInteger(body.offset)?body.offset:0));
     const limit=Math.max(12,Math.min(48,Number.isInteger(body.limit)?body.limit:36));
     if(!room.titlesCache || Date.now()-room.titlesFetched>10*60*1000){
      const response=await fetch(room.host+'/v2/titles',{
       headers:{Authorization:'Bearer '+room.token.token},signal:AbortSignal.timeout(20000)
      });
      if(!response.ok)throw Error('Catálogo Xbox indisponível ('+response.status+')');
      const data:any=await response.json();
      room.titlesCache=Array.isArray(data.results)?data.results:Array.isArray(data.titles)?data.titles:[];
      room.titlesFetched=Date.now();
     }
     const titles:any[]=room.titlesCache;
     const page=titles.slice(offset,offset+limit);
     const ids=[...new Set(page.map(t=>t?.details?.productId).filter((id):id is string=>typeof id==='string' && /^[a-z0-9]{8,20}$/i.test(id)))];
     let products:any={};
     if(ids.length){
      try {
       const url='https://catalog.gamepass.com/v3/products?market=BR&language=pt-BR&hydration=RemoteHighSapphire0';
       const meta=await fetch(url,{
        method:'POST',
        headers:{
         'Content-Type':'application/json','ms-cv':'0',
         'calling-app-name':'Xbox Cloud Gaming Web','calling-app-version':'21.0.0',
        },
        body:JSON.stringify({Products:ids}),
        signal:AbortSignal.timeout(15000),
       });
       if(meta.ok){const result:any=await meta.json();products=result.Products||{};}
      } catch {
       // If the public metadata service is slow, still display real playable IDs
       // from the Xbox cloud catalog; never invent game covers.
      }
     }
     const games=page.map(t=>gameCard(t,products[t?.details?.productId]||null));
     reply(res,200,{games,total:titles.length,offset,next:offset+page.length<titles.length?offset+page.length:null,source:'xbox'});
     return;
    }
    if(action==='titles'){
     const r=await fetch(room.host+'/v2/titles',{headers:{Authorization:'Bearer '+room.token.token},signal:AbortSignal.timeout(20000)});
     if(!r.ok)throw Error('Catálogo indisponível ('+r.status+')');const data=await r.json();reply(res,200,data);return;
    }
    if(action==='start'){
     if(typeof body.id!=='string'||body.id.length>160)throw Error('Jogo inválido');
     if(room.session)throw Error('Encerre a sala antes de iniciar outra sessão');
     room.config={id:body.id,type:'cloud',language:'pt-BR',host:room.host,resolution:720};
     const session:any=await stream.startStream(room.token,room.config);if(!session.sessionPath)throw Error('Sessão não criada');room.session=session;reply(res,200,{sessionId:session.sessionId,sessionPath:session.sessionPath});return;
    }
    if(!room.session)throw Error('Inicie um jogo');
    const args=[room.token,room.config,room.session.sessionPath] as const;
    let result;
    if(action==='state')result=await stream.getStreamStatus(...args);
    else if(action==='sdp')result=await stream.sendSDPOffer(...args,body.offer);
    else if(action==='ice')result=await stream.sendICECandidates(...args,body.candidates);
    else if(action==='connect')result=await stream.sendMsalToken(...args,room.user.refresh_token);
    else if(action==='keepalive')result=await stream.sendKeepalive(...args);
    else {reply(res,404,{error:'Operação desconhecida'});return;}
    reply(res,200,result);
   }finally{room.busy=false;}
  }else{
   const relative=u.pathname==='/'?'index.html':decodeURIComponent(u.pathname.slice(1));
   const file=path.resolve('dist',relative);if(!file.startsWith(path.resolve('dist')+path.sep)){res.writeHead(403);res.end();return;}
   const types:any={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css'};
   const data=await readFile(file);res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream'});res.end(data);
  }
 }catch(e){reply(res,400,{error:'Falha na operação. Confira conexão, login e suporte do serviço. Nenhum token foi registrado.'});}
});
const wss=new WebSocketServer({noServer:true,maxPayload:8192});
server.on('upgrade',(req,socket,head)=>{
 if(!origins.includes(req.headers.origin||'')){socket.destroy();return;}
 const u=new URL(req.url||'/', 'http://localhost');if(u.pathname!=='/relay'){socket.destroy();return;}
 wss.handleUpgrade(req,socket,head,ws=>{
  let room:any,role:string|undefined,last=0;const timeout=setTimeout(()=>ws.close(),5000);
  ws.on('message',data=>{
   try{const msg=JSON.parse(data.toString());
    if(!room){const candidate=rooms.get(msg.room);if(!candidate||!['tv','phone'].includes(msg.role)||msg.key!==(msg.role==='tv'?candidate.tvKey:candidate.phoneKey)){ws.close();return;}
     role=msg.role;room=candidate;room.sockets.get(role)?.close();room.sockets.set(role,ws);clearTimeout(timeout);ws.send(JSON.stringify({type:'connected'}));return;}
    if(role==='phone'&&msg.type==='frame'){
     if(Date.now()-last<10)return;last=Date.now();const tv=room.sockets.get('tv');if(tv?.readyState===WebSocket.OPEN&&tv.bufferedAmount<16384)tv.send(JSON.stringify({type:'frame',frame:sanitize(msg.frame)}));
    }
   }catch{ws.close();}
  });
  ws.on('close',()=>{clearTimeout(timeout);if(room?.sockets.get(role)===ws){room.sockets.delete(role);if(role==='phone')room.sockets.get('tv')?.send(JSON.stringify({type:'frame',frame:sanitize({})}));}});
 });
});
setInterval(()=>{for(const[id,r]of rooms){if(Date.now()-r.created>4*3600000){for(const s of r.sockets.values())s.close();rooms.delete(id);}}},60000).unref();
server.listen(port,'0.0.0.0',()=>console.log('Ponte xCloud experimental pronta na porta '+port));
