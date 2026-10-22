import http from 'node:http';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {randomBytes} from 'node:crypto';
import {WebSocketServer,WebSocket} from 'ws';
import Auth from '../vendor/packages/platform/src/controller/auth';
import * as stream from '../vendor/packages/player/src/server/index';
import {sanitize} from './protocol.mjs';
import {gameCard} from './catalog.mjs';
import {saveRemember,loadRemember,revokeRemember,persistentConfigured} from './remember-store.mjs';
const rooms=new Map<string,any>();
// Opaque browser identity. No Microsoft passwords/tokens are sent to the TV.
// Durable encrypted authorization is persisted in an isolated MongoDB Atlas cluster.
const remembered=new Map<string,{user:any;token:any;host:string;lastRefresh:number;expires:number}>();
const rememberName='xb_session';
const rememberMaxAge=30*24*3600;
function getRememberId(req:any):string {
 const part=String(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(rememberName+'='));
 const key=part?.slice((rememberName+'=').length)||'';
 return /^[0-9a-f]{48}$/.test(key)?key:'';
}
function setRememberCookie(res:any,id:string) {
 res.setHeader('Set-Cookie',rememberName+'='+id+'; Path=/player; Max-Age='+rememberMaxAge+'; Secure; HttpOnly; SameSite=Lax');
}
function clearRememberCookie(res:any) {
 res.setHeader('Set-Cookie',rememberName+'=; Path=/player; Max-Age=0; Secure; HttpOnly; SameSite=Lax');
}
function allocateRoom():any {
 const id=secret(),tvKey=secret(),phoneKey=secret();
 const room={id,tvKey,phoneKey,created:Date.now(),sockets:new Map(),busy:false};
 rooms.set(id,room);
 return room;
}
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
 let actionName='initialization';
 try {
  if(u.pathname==='/health'){reply(res,200,{ok:true,experimental:true,clientBuild:process.env.XBRIDGE_CLIENT_FIX_VERSION||'base'});return;}
  if(u.pathname.startsWith('/api/')){
   if(req.method!=='POST'){reply(res,405,{error:'POST obrigatório'});return;}
   let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>131072){reply(res,413,{error:'Pedido grande demais'});return;}}
   const body=JSON.parse(raw||'{}');const action=u.pathname.slice(5);actionName=action;
   if(action==='create'){
    if(rooms.size>=20){reply(res,429,{error:'Limite de salas; tente depois'});return;}
    const room=allocateRoom();reply(res,200,{id:room.id,tvKey:room.tvKey,phoneKey:room.phoneKey});return;
   }
   if(action==='resume'){
    // Only the HttpOnly first-party cookie can identify the remembered account.
    // POST + Strict SameSite prevent login CSRF from other websites.
    const key=getRememberId(req);
    if(!key){
     reply(res,401,{ok:false,remembered:false,reason:'cookie_missing'});
     return;
    }
    if(!persistentConfigured()){
     reply(res,503,{ok:false,reason:'storage_not_configured',retryable:true});
     return;
    }
    let saved=remembered.get(key);
    if(!saved && key && persistentConfigured()){
      try { const user=await loadRemember(key); if(user) saved={user,token:null,host:'',lastRefresh:0,expires:Date.now()+rememberMaxAge*1000}; }
      catch { reply(res,503,{ok:false,reason:'storage_unavailable',retryable:true,error:'Armazenamento da conta Xbox temporariamente indisponível.'});return; }
    }
    if(!saved||saved.expires<Date.now()){
     if(key)remembered.delete(key);
     clearRememberCookie(res);
     reply(res,401,{ok:false,remembered:false,reason:'session_not_found'});return;
    }
    // Reloaded TV tabs should not accumulate obsolete Xbox rooms.
    // One remembered browser gets one live room; close its prior transport.
    for(const [existingId,existing] of rooms){
     if(existing.rememberKey===key){
      for(const socket of existing.sockets.values())socket.close();
      rooms.delete(existingId);
     }
    }
    if(rooms.size>=20){reply(res,429,{error:'Limite de sessões Xbox'});return;}
    if(!saved.token || Date.now()-saved.lastRefresh>25*60*1000){
     try{
      const refreshed=await auth.refreshUserToken(saved.user);
      if(!refreshed?.access_token)throw Error('Autorização Microsoft expirada');
      const tokens=await auth.getStreamingTokens(refreshed);
      const cloud=tokens.xCloudToken?.data;
      if(!cloud?.gsToken)throw Error('Não há token de nuvem');
      const region=cloud.offeringSettings?.regions?.find((r:any)=>r.isDefault)||cloud.offeringSettings?.regions?.[0];
      const host=new URL(region.baseUri);
      if(host.protocol!=='https:'||!host.hostname.endsWith('.xboxlive.com'))throw Error('Região inválida');
      saved.user=refreshed;saved.token={token:cloud.gsToken,market:cloud.market,language:'pt-BR'};
      saved.host=host.origin;saved.lastRefresh=Date.now();
      if(persistentConfigured()) await saveRemember(key,refreshed);
     }catch(error){
      // Preserve a persisted session if the upstream Microsoft/Xbox service
      // temporarily rejects requests; never erase credentials on a 5xx.
      const message=error instanceof Error?error.message:'';
      const revocation=/\binvalid_grant\b|AADSTS700082|AADSTS700084|token (?:revoked|invalidated)/i.test(message);
      console.warn('[Xbox resume]',revocation?'authorization_rejected':'refresh_unavailable');
      reply(res,revocation?401:503,{ok:false,remembered:true,
       reason:revocation?'authorization_rejected':'refresh_unavailable',
       retryable:!revocation,
       error:revocation?'A Microsoft exige uma nova autorização.':'A Microsoft não respondeu à restauração da conta. Tente novamente.'});
      return;
     }
    }
    saved.expires=Date.now()+rememberMaxAge*1000;
    remembered.set(key,saved);
    setRememberCookie(res,key);
    const room=allocateRoom();
    room.user=saved.user;room.token=saved.token;room.host=saved.host;room.rememberKey=key;
    reply(res,200,{ok:true,remembered:true,id:room.id,tvKey:room.tvKey});return;
   }
   const room=rooms.get(body.room);if(!room||req.headers.authorization!=='Bearer '+room.tvKey){reply(res,401,{error:'Sala inválida ou expirada'});return;}
   if(room.busy){reply(res,409,{error:'Aguarde a operação atual'});return;}
   room.busy=true;
   try {
    if(action==='close'){for(const s of room.sockets.values())s.close();rooms.delete(body.room);reply(res,200,{ok:true});return;}
    if(action==='logout'){
     const key=getRememberId(req);
     if(key&&room.rememberKey===key){remembered.delete(key);await revokeRemember(key);}
     if(room.rememberKey&&room.rememberKey!==key){remembered.delete(room.rememberKey);await revokeRemember(room.rememberKey);}
     clearRememberCookie(res);
     delete room.user;delete room.token;delete room.host;delete room.device;
     delete room.rememberKey;delete room.session;delete room.config;
     reply(res,200,{ok:true});return;
    }
    if(action==='reset'){
     // Best-effort termination permits a new game without Microsoft re-login.
     const old=room.session,config=room.config;
     room.session=undefined;room.config=undefined;
     if(old?.sessionPath&&config?.host&&room.token?.token){
      try {
       const destination=new URL('/'+old.sessionPath,config.host);
       if(destination.protocol==='https:'&&destination.hostname.endsWith('.xboxlive.com')){
        await fetch(destination,{method:'DELETE',headers:{Authorization:'Bearer '+room.token.token},signal:AbortSignal.timeout(9000)});
       }
      }catch{}
     }
     reply(res,200,{ok:true});return;
    }
    if(action==='login'){
     const data=await auth.startMsalAuth();
     room.device=data;
     // Microsoft may provide an already prefilled device verification URL.
     // Only ever send the official HTTPS Microsoft URL back to the client.
     let completeUrl='';
     if(typeof data.verification_uri_complete==='string'){
      try{
       const u=new URL(data.verification_uri_complete);
       const h=u.hostname.toLowerCase();
       if(u.protocol==='https:'&&(h==='microsoft.com'||h.endsWith('.microsoft.com')||h==='live.com'||h.endsWith('.live.com')||h==='microsoftonline.com'||h.endsWith('.microsoftonline.com')))completeUrl=u.href;
      }catch{}
     }
     reply(res,200,{user_code:data.user_code,verification_uri:data.verification_uri,verification_uri_complete:completeUrl,expires_in:data.expires_in,interval:data.interval});return;
    }
    if(action==='verify'){
     if(!room.device)throw Error('Inicie o login');
     const user=await auth.verifyDeviceCode(room.device.device_code,1);
     if(!user?.access_token)throw Error('Login ainda não concluído');
     const tokens=await auth.getStreamingTokens(user);const cloud=tokens.xCloudToken?.data;
     if(!cloud?.gsToken)throw Error('Conta sem token xCloud');
     const region=cloud.offeringSettings?.regions?.find((r:any)=>r.isDefault)||cloud.offeringSettings?.regions?.[0];
     const host=new URL(region.baseUri);if(host.protocol!=='https:'||!host.hostname.endsWith('.xboxlive.com'))throw Error('Região inválida');
     room.user=user;room.token={token:cloud.gsToken,market:cloud.market,language:'pt-BR'};room.host=host.origin;
     // Remember only an opaque secret in the TV browser; tokens remain server-side.
     const previous=getRememberId(req);if(previous){remembered.delete(previous);await revokeRemember(previous);}
     const key=secret();room.rememberKey=key;
     remembered.set(key,{user,token:room.token,host:room.host,lastRefresh:Date.now(),expires:Date.now()+rememberMaxAge*1000});
     if(!persistentConfigured())throw Error('Armazenamento persistente não configurado');
     const durable=await saveRemember(key,user);
     if(!durable)throw Error('Não foi possível salvar a autorização Xbox no banco');
     setRememberCookie(res,key);
     delete room.device;reply(res,200,{ok:true,remembered:true});return;
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
if(action==='recent'){
     // Per-account recently played cloud titles. Unlike /v2/titles, this
     // is personalized, but it is NOT a purchased-games ownership list.
     const r=await fetch(room.host+'/v2/titles/mru?mr=25',{
      headers:{Authorization:'Bearer '+room.token.token},
      signal:AbortSignal.timeout(15000)
     });
     if(!r.ok)throw Error('Jogos recentes indisponíveis ('+r.status+')');
     const data:any=await r.json();
     const recent=Array.isArray(data.results)?data.results:[];
     const ids=[...new Set(recent.map((t:any)=>t?.details?.productId).filter((id:any):id is string=>typeof id==='string'&&/^[a-z0-9]{8,20}$/i.test(id)))];
     let products:any={};
     if(ids.length){
      try{
       const meta=await fetch('https://catalog.gamepass.com/v3/products?market=BR&language=pt-BR&hydration=RemoteHighSapphire0',{
        method:'POST',
        headers:{'Content-Type':'application/json','ms-cv':'0','calling-app-name':'Xbox Cloud Gaming Web','calling-app-version':'21.0.0'},
        body:JSON.stringify({Products:ids}),
        signal:AbortSignal.timeout(12000)
       });
       if(meta.ok){const detail:any=await meta.json();products=detail.Products||{};}
      }catch{}
     }
     reply(res,200,{games:recent.map((t:any)=>gameCard(t,products[t?.details?.productId]||null)),source:'xbox-cloud-recent'});
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
  }catch(e){
    // Do not send or log tokens, Microsoft response bodies, or session IDs.
    const raw=e instanceof Error?e.message:'';
    const matched=raw.match(/(?:Streaming HTTP |indisponível \()([45][0-9]{2})/i);
    const upstreamStatus=matched?Number(matched[1]):undefined;
    const allowedActions=new Set(['create','resume','logout','login','verify','catalog','recent','titles','start','state','connect','sdp','ice','keepalive','reset','close']);
    const stage=allowedActions.has(actionName)?actionName:'init';
    const messages:Record<string,string>={
      create:'Não foi possível criar a sala de jogos.',
      resume:'Não foi possível restaurar a conta Xbox.',
      logout:'Não foi possível encerrar a conta Xbox.',
      login:'Não foi possível iniciar a autorização Microsoft.',
      verify:'Não foi possível confirmar a autorização Xbox.',
      catalog:'Falha ao carregar o catálogo Xbox.',
      recent:'Não foi possível consultar seus jogos recentes na nuvem.',
      titles:'Falha ao consultar os jogos Xbox.',
      start:'O Xbox não criou a sessão deste jogo. Verifique o acesso ao título.',
      state:'Não foi possível consultar o estado da sessão Xbox.',
      connect:'O Xbox não concluiu a autenticação da sessão.',
      sdp:'Falha ao negociar vídeo e áudio com o Xbox.',
      ice:'Falha ao negociar a conexão WebRTC.',
      keepalive:'Falha ao manter a sessão ativa.',
      reset:'Não foi possível reiniciar a sessão.'
    };
    console.warn('[Player action]',stage,'failed',upstreamStatus||'no-http-code');
    reply(res,upstreamStatus===429?429:upstreamStatus===403?403:502,{
      error:(messages[stage]||'Falha de comunicação com Xbox Cloud Gaming.')+(upstreamStatus?' (Xbox HTTP '+upstreamStatus+')':''),
      stage,upstreamStatus:upstreamStatus||null
    });
  }
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
setInterval(()=>{
 for(const[id,r]of rooms){if(Date.now()-r.created>4*3600000){for(const s of r.sockets.values())s.close();rooms.delete(id);}}
 for(const [key,saved] of remembered){if(Date.now()>saved.expires)remembered.delete(key);}
},60000).unref();
server.listen(port,'0.0.0.0',()=>console.log('Ponte xCloud experimental pronta na porta '+port));
