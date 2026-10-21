import QRCode from 'qrcode';
import {compactFrame,acceptsParent} from './xbridge-input.mjs';
const embedded = new URLSearchParams(location.search).get('embed') === 'xbridge' && window.parent !== window;
const parentOrigin = 'https://xcloud-tv.onrender.com';
const notifyParent = (message:any) => { if(embedded) window.parent.postMessage(message,parentOrigin); };
import Player from '../vendor/packages/player/src/client/lib/player';
import {buttons,axes,sanitize,gamepadFrame} from './protocol.mjs';
const $=(id:string)=>document.getElementById(id) as any;
const status=(s:string)=>{$('status').textContent=s;notifyParent({type:'xbridge-player-status',message:s});};
const run=(fn:()=>any)=>async()=>{try{await fn();}catch(e:any){status(e.message||'Falha na conexão');}};
let backend='',room:any,ws:WebSocket,player:any,keepalive:any,frame=sanitize({}),lastFrame=0,started=false;
let map:any={},mappingKey='',calStep=-1,calWaiting=0,previous:any,baseAxes:number[]=[];
const fields=[...buttons,...axes];
function endpoint(p:string){return backend.replace(/\/$/,'')+p;}
async function api(action:string,body:any={}){
 const response=await fetch(endpoint('/api/'+action),{method:'POST',headers:{'Content-Type':'application/json',...(room?{'Authorization':'Bearer '+room.tvKey}:{})},body:JSON.stringify({...body,room:room?.id})});
 const data=await response.json();if(!response.ok)throw Error(data.error||'Servidor indisponível');return data;
}
function connect(role:string,key:string){
 if(ws)ws.close();ws=new WebSocket(endpoint('/relay').replace(/^http/,'ws'));
 ws.onopen=()=>{ws.send(JSON.stringify({role,key,room:room.id}));status('Conectado ao servidor. Aguardando comandos.');};
 ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.type==='frame'){frame=sanitize(m.frame);lastFrame=Date.now();$('remote').textContent='Comandos do Android recebidos';}};
 ws.onclose=()=>{frame=sanitize({});status('Conexão interrompida. Reconecte ou prepare uma nova sala.');};
 ws.onerror=()=>status('Falha no canal de comandos. Verifique servidor e HTTPS.');
}
function setBackend(value:string){
 const u=new URL(value);
 if(u.protocol!=='https:'&&u.hostname!=='localhost'&&u.hostname!=='127.0.0.1')throw Error('Use um servidor HTTPS');
 // The mounted /player path is the same-origin reverse proxy on the TV site.
 // No arbitrary proxy paths can be entered from the normal setup screen.
 backend=(embedded && u.origin===location.origin && u.pathname==='/player')
  ? u.origin+'/player' : u.origin;
}
$('backend').value=location.protocol==='https:'?location.origin:'http://localhost:3000';
$('diagnostics').textContent='WebRTC: '+(typeof RTCPeerConnection!=='undefined'?'sim':'ausente')+' · WebSocket: '+(typeof WebSocket!=='undefined'?'sim':'ausente')+' · Controle local: '+(navigator.getGamepads?'API disponível':'API ausente');
$('create').onclick=run(async()=>{
 setBackend($('backend').value);room=await api('create');$('setup').hidden=true;$('tv').hidden=false;
 const url=new URL(location.href);url.hash=new URLSearchParams({role:'phone',room:room.id,key:room.phoneKey,backend}).toString();$('phoneLink').value=url.href;await QRCode.toCanvas($('qr'),url.href,{width:280,margin:2});
 connect('tv',room.tvKey);status('Sala criada. Abra o link no Android.');
});
$('copy').onclick=run(async()=>{await navigator.clipboard.writeText($('phoneLink').value);status('Link copiado.');});
$('login').onclick=run(async()=>{status('Gerando código…');const d=await api('login');$('code').textContent='Acesse '+d.verification_uri+' e informe: '+d.user_code;$('verify').hidden=false;status('Autorize somente o código que acabou de gerar.');});
$('verify').onclick=run(async()=>{status('Verificando autorização…');await api('verify');$('titles').disabled=false;$('code').textContent='Conta conectada nesta sala.';status('Login concluído.');});
let titleList:any[]=[];
$('titles').onclick=run(async()=>{const data=await api('titles');titleList=data.results||data.titles||[];if(!Array.isArray(titleList)||!titleList.length)throw Error('Catálogo vazio ou formato não reconhecido');$('games').textContent='';for(const t of titleList){const o=document.createElement('option');o.value=t.titleId||t.id;o.textContent=t.details?.title||t.title||t.titleId||t.id;$('games').appendChild(o);}$('play').disabled=false;status(titleList.length+' jogos recebidos.');});
const pause=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
$('play').onclick=run(async()=>{
 if(started)throw Error('Uma sessão já foi solicitada. Encerre a sala para trocar o jogo.');
 if(typeof RTCPeerConnection==='undefined')throw Error('Este navegador não disponibiliza WebRTC.');
 started=true;$('play').disabled=true;await api('start',{id:$('games').value});status('Aguardando provisionamento do jogo…');
 let ready=false;for(let n=0;n<300;n++){const s=await api('state');status('Sessão Xbox: '+s.state);if(s.state==='Provisioned'){ready=true;break;}if(s.state==='Failed')throw Error('O serviço recusou a sessão');if(s.state==='ReadyToConnect')await api('connect');await pause(2000);}
 if(!ready)throw Error('Tempo de espera excedido. Encerre a sala para tentar novamente.');
 player=new Player('playerContainer');player.init();
 const channel=player._channels.control;
 // Register after the service's initial add/remove handshake; never use the TV's Gamepad API.
 const original=channel.sendAuthorization.bind(channel);channel.sendAuthorization=()=>{
  original();
  channel.sendGamepadState(0,true,{getGamepadState:()=>Date.now()-lastFrame<400?frame:sanitize({}),handleVibration:()=>{},detach:()=>{}});
  notifyParent({type:'xbridge-control-ready'});
};
 player._peerConnection.addEventListener('connectionstatechange',()=>{
 const state=player._peerConnection.connectionState; status('Transmissão: '+state);
 if(state==='failed'||state==='disconnected'||state==='closed'){document.body.classList.remove('stream-playing');notifyParent({type:'xbridge-playing',playing:false});}
 });
 const offer=await player.createOffer();const answer=await api('sdp',{offer});await player.setRemoteSDP(JSON.parse(answer.exchangeResponse).sdp);
 const local=await player.getICECandidates();const candidates=local.map((c:any)=>JSON.stringify({candidate:c.candidate,sdpMid:c.sdpMid,sdpMLineIndex:c.sdpMLineIndex,usernameFragment:c.usernameFragment}));
 const remote=await api('ice',{candidates});await player.setRemoteIceCandidates(JSON.parse(remote.exchangeResponse));
 keepalive=setInterval(()=>api('keepalive').catch(()=>status('Falha ao manter a sessão.')),30000);
});
$('fullscreen').onclick=run(()=> $('playerContainer').requestFullscreen());
$('sound').onclick=run(async()=>{for(const el of document.querySelectorAll('video,audio'))await(el as HTMLMediaElement).play();});
$('stop').onclick=run(async()=>{clearInterval(keepalive);player?.destroy();ws?.close();await api('close');location.hash='';location.reload();});
function advance(){calStep++;calWaiting=Date.now()+700;previous=null;baseAxes=[];if(calStep>=fields.length){calStep=-1;localStorage.setItem(mappingKey,JSON.stringify(map));$('calibration').textContent='Mapeamento salvo neste celular.';$('skip').hidden=true;}else $('calibration').textContent='Solte os comandos e depois acione: '+fields[calStep]+(axes.includes(fields[calStep])?' (mova para direita ou para baixo)':'');}
$('calibrate').onclick=()=>{map={};calStep=-1;advance();$('skip').hidden=false;};$('skip').onclick=advance;
function poll(){
 try{
 const pads=navigator.getGamepads?navigator.getGamepads():[];const g=Array.from(pads).find(Boolean) as Gamepad|undefined;
 if(g){$('gamepad').textContent=g.id+' · '+g.buttons.length+' botões / '+g.axes.length+' eixos';
  const key='ponte-map-'+g.id;if(mappingKey!==key){mappingKey=key;try{map=JSON.parse(localStorage.getItem(key)||'{}');}catch{map={};}if(!Object.keys(map).length&&g.mapping==='standard'){buttons.forEach((k:string,i:number)=>map[k]={kind:'button',index:i});axes.forEach((k:string,i:number)=>map[k]={kind:'axis',index:i});}}
  if(calStep>=0){
   if(Date.now()<calWaiting){baseAxes=Array.from(g.axes);previous=g.buttons.map(b=>b.value);}
   else if(previous){const k=fields[calStep];let found:any;
    if(!axes.includes(k)){g.buttons.forEach((b,i)=>{if(b.value>.55&&(previous[i]||0)<.2)found={kind:'button',index:i};});}
    if(!found)g.axes.forEach((v,i)=>{if(Math.abs(v-(baseAxes[i]||0))>.65)found={kind:'axis',index:i,direction:v<0?-1:1};});
    if(found){map[k]=found;advance();}else previous=g.buttons.map(b=>b.value);
   }
  }
  const f=calStep>=0?sanitize({}):gamepadFrame(g,map);$('inputs').textContent=Object.entries(f).filter(([k,v])=>k!=='GamepadIndex'&&v!==0).map(([k,v])=>k+': '+Number(v).toFixed(2)).join(' · ')||'Comandos soltos. Se necessário, configure o mapeamento.';
  if(ws?.readyState===WebSocket.OPEN&&ws.bufferedAmount<8192)ws.send(JSON.stringify({type:'frame',frame:f}));
 }else if(ws?.readyState===WebSocket.OPEN)ws.send(JSON.stringify({type:'frame',frame:sanitize({})}));
 }catch{status('Falha ao ler o controle. Reabra o Chrome e pressione um botão.');}
}
const hash=new URLSearchParams(location.hash.slice(1));
if(hash.get('role')==='phone'){
 $('setup').hidden=true;$('phone').hidden=false;
 $('phoneConnect').onclick=run(async()=>{setBackend(hash.get('backend')||'');room={id:hash.get('room')};connect('phone',hash.get('key')||'');$('phoneConnect').disabled=true;setInterval(poll,20);try{await(navigator as any).wakeLock?.request('screen');}catch{};});
}
document.addEventListener('visibilitychange',()=>{if(document.hidden&&ws?.readyState===WebSocket.OPEN&&hash.get('role')==='phone')ws.send(JSON.stringify({type:'frame',frame:sanitize({})}));});

// D-pad navigation for the TV remote, preserving selects and editable fields.
document.addEventListener('keydown',e=>{if(!['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)||['INPUT','TEXTAREA','SELECT'].includes((e.target as HTMLElement)?.tagName))return;const items=Array.from(document.querySelectorAll<HTMLElement>('button:not(:disabled),input,select,textarea')).filter(el=>el.offsetParent!==null);if(!items.length)return;const i=items.indexOf(document.activeElement as HTMLElement);const step=e.key==='ArrowDown'||e.key==='ArrowRight'?1:-1;items[(i+step+items.length)%items.length].focus();e.preventDefault();});


// The existing xBridge owns pairing and forwards its live packets to this player.
// Account tokens and the TV session key stay inside this frame/server.
if (embedded) {
 document.body.classList.add('xbridge-embedded');
 $('setup').hidden=true; $('tv').hidden=false;
 const handlers:any={}; ['login','verify','titles','play','sound','fullscreen','stop'].forEach(id=>handlers[id]=$(id).onclick);
 $('tv').innerHTML=`<div class="cloud-heading"><h1>Xbox Cloud Gaming</h1><p>Seu controle já está conectado pelo xBridge. Entre na Microsoft para carregar seus jogos.</p></div>
 <div class="cloud-steps"><section><h2>01 · Sua conta Xbox</h2><button id="embed-login" disabled>Entrar com a Microsoft</button><p id="embed-code"></p><button id="embed-verify" hidden>Já autorizei na Microsoft</button></section>
 <section><h2>02 · Seus jogos</h2><button id="embed-titles" disabled>Carregar catálogo</button><label>Escolha um jogo<select id="embed-games"></select></label><button id="embed-play" disabled>Jogar agora</button></section></div>
 <div class="cloud-actions"><button id="embed-sound">Ativar áudio / vídeo</button><button id="embed-fullscreen">Tela cheia</button><button id="embed-stop">Encerrar sessão</button></div>`;
 ['login','verify','titles','play','sound','fullscreen','stop','code','games'].forEach(id=>{$('embed-'+id).id=id; if(handlers[id]) $(id).onclick=handlers[id];});
 $('fullscreen').onclick=()=>notifyParent({type:'xbridge-fullscreen'});
 window.addEventListener('message',event=>{
  if(!acceptsParent(event,window.parent))return;
  if(event.data?.type==='xbridge-input'){
   frame=compactFrame(event.data.packet);lastFrame=Date.now();
   $('remote').textContent='Controle do celular recebendo comandos';
  } else if(event.data?.type==='xbridge-release'){
   frame=sanitize({});lastFrame=0;$('remote').textContent='Aguardando comandos do celular';
  }
 });
 document.addEventListener('playing',event=>{
  if(event.target instanceof HTMLVideoElement){document.body.classList.add('stream-playing');notifyParent({type:'xbridge-playing',playing:true});}
 },true);
 setInterval(()=>{if(lastFrame && Date.now()-lastFrame>400){frame=sanitize({});lastFrame=0;$('remote').textContent='Aguardando comandos do celular';}},200);
 const prepare=run(async()=>{
  status('Preparando sessão Xbox…');setBackend(location.origin+(location.pathname.startsWith('/player')?'/player':''));room=await api('create');
  $('login').disabled=false;status('Pronto. Entre com sua conta Microsoft.');notifyParent({type:'xbridge-ready'});
 });
 void prepare();
}

