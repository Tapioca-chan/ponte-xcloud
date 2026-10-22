import QRCode from 'qrcode';
import {mountEmbeddedDashboard} from './embedded-dashboard.mjs';
import {serializeLocalIceCandidates} from './ice-bridge.mjs';
import {compactFrame,acceptsParent} from './xbridge-input.mjs';
import {MenuInputEdges,selectMenuTarget} from './menu-input.mjs';
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
// The TV receives status updates even if the Xbox rejects the session.
// The previous handler permanently set started=true after its first failure.
$('play').onclick=async()=>{
 if(started){status('Já existe uma tentativa em andamento.');return}
 started=true;
 $('play').disabled=true;
 let phase='verificação';
 const announce=(message:string)=>{status(message); const el=document.getElementById('xb-launch-status');if(el)el.textContent=message;};
 try{
  if(typeof RTCPeerConnection==='undefined')throw Error('Este navegador não oferece WebRTC.');
  if(!$('games').value)throw Error('Selecione um jogo da biblioteca antes de jogar.');
  phase='start';announce('Solicitando o jogo aos servidores Xbox…');
  await api('start',{id:$('games').value});
  phase='state';announce('Aguardando o Xbox preparar o jogo…');
  let ready=false,connectedToXbox=false,lastState='';
  for(let n=0;n<90;n++){
   const s=await api('state');
   const state=typeof s.state==='string'?s.state:'Aguardando';
   if(state!==lastState){lastState=state;announce('Xbox: '+state);}
   if(state==='Provisioned'){ready=true;break}
   if(state==='Failed'){
    const code=String(s.errorDetails?.code||'desconhecido').replace(/[^a-zA-Z0-9_-]/g,'').slice(0,48);
    throw Error('O Xbox recusou a sessão (código '+code+').');
   }
   if(state==='ReadyToConnect'&&!connectedToXbox){
    phase='connect';announce('Autenticando o jogo nos servidores Xbox…');
    await api('connect');connectedToXbox=true;
    phase='state';
   }
   await pause(2000);
  }
  if(!ready)throw Error('O Xbox não concluiu o preparo do jogo.');
  phase='webrtc';announce('Iniciando conexão de vídeo e controle WebRTC…');
  player=new Player('playerContainer');player.init();
  const channel=player._channels.control;
  const original=channel.sendAuthorization.bind(channel);
  let controlRegistered=false;
  const registerGamepad=()=>{
   if(controlRegistered)return;
   const dataChannel=(channel as any)._dataChannel as RTCDataChannel;
   if(dataChannel?.readyState!=='open'){
    // The message-channel handshake may beat the control channel on slower
    // VIDAA devices. Previously the authorization and gamepadChanged packets
    // could be silently discarded, leaving the running game uncontrollable.
    if(dataChannel)dataChannel.addEventListener('open',registerGamepad,{once:true});
    announce('Aguardando canal de controle do Xbox…');
    return;
   }
   controlRegistered=true;
   original();
   channel.sendGamepadState(0,true,{
    getGamepadState:()=>Date.now()-lastFrame<650?frame:sanitize({}),
    handleVibration:()=>{},detach:()=>{}
   });
   notifyParent({type:'xbridge-control-ready'});
  };
  channel.sendAuthorization=registerGamepad;
  player._peerConnection.addEventListener('connectionstatechange',()=>{
   const state=player._peerConnection.connectionState;
   announce('Conexão de vídeo: '+state);
   if(state==='failed'||state==='disconnected'||state==='closed'){
    document.body.classList.remove('stream-playing');
    notifyParent({type:'xbridge-playing',playing:false});
   }
  });
  phase='sdp';announce('Negociando áudio e vídeo com o Xbox…');
  const offer=await player.createOffer();
  const answer=await api('sdp',{offer});
  const remoteSdp=JSON.parse(answer.exchangeResponse||'{}');
  if(typeof remoteSdp.sdp!=='string')throw Error('O Xbox não retornou a resposta de vídeo esperada.');
  await player.setRemoteSDP(remoteSdp.sdp);
  phase='ice';announce('Estabelecendo conexão de rede com o Xbox…');
  // Allow the ICE agent time to expose candidate addresses on slower TVs.
  const rtc=player._peerConnection;
  for(let i=0;i<15&&rtc.iceGatheringState!=='complete';i++)await pause(200);
  // getICECandidates() returns a Promise. Resolve it before serialization:
  // attempting .map() directly on the Promise caused the Metro Exodus failure.
  const candidates=await serializeLocalIceCandidates(()=>player.getICECandidates());
  const remote=await api('ice',{candidates});
  const parsed=JSON.parse(remote.exchangeResponse||'[]');
  const remoteCandidates=Array.isArray(parsed)?parsed:Array.isArray(parsed.candidates)?parsed.candidates:parsed.iceCandidates;
  if(!Array.isArray(remoteCandidates))throw Error('O Xbox retornou candidatos de rede em formato desconhecido.');
  await player.setRemoteIceCandidates(remoteCandidates);
  announce('Conexão negociada. Aguardando imagem do jogo…');
  keepalive=setInterval(()=>api('keepalive').catch(()=>announce('Falha ao manter a sessão Xbox ativa.')),30000);
 }catch(e:any){
  const message=String(e?.message||'Erro desconhecido').slice(0,180);
  const detail='Não foi possível iniciar o jogo ['+phase+']: '+message;
  announce(detail);
  notifyParent({type:'xbridge-player-error',message:detail});
  clearInterval(keepalive);
  try{player?.destroy()}catch(_){}
  player=undefined;
  try{await api('reset')}catch(_){}
  started=false;
  $('play').disabled=false;
 }
};
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
 const handlers:any={};
 ['play','sound','fullscreen','stop'].forEach(id=>handlers[id]=$(id).onclick);
 const dashboard=mountEmbeddedDashboard({api,QRCode,status,notifyParent,handlers});
 const inputEdges=new MenuInputEdges();
 function handleConsoleController(actions:string[]){
  if(document.body.classList.contains('stream-playing'))return;
  const panel=$('xb-settings-panel');
  const scope=panel&&!panel.hidden?panel:
   !$('xb-auth').hidden?$('xb-auth'):$('xb-library');
  const visible=(selector:string)=>Array.from(document.querySelectorAll<HTMLElement>(selector))
    .filter(el=>!el.hidden&&!el.hasAttribute('disabled')&&el.getClientRects().length>0
      &&getComputedStyle(el).visibility!=='hidden'
      &&!el.closest('[hidden]'));
  for(const action of actions){
   if(action==='menu'){
    $('xb-settings-toggle')?.click();
    ($('xb-settings-panel').hidden?$('xb-settings-toggle'):$('xb-settings-close'))?.focus();
    continue;
   }
   if(action==='back'){
    if(panel&&!panel.hidden){$('xb-settings-close').click();$('xb-settings-toggle').focus();}
    else if(!$('xb-library').hidden){$('xb-nav-home')?.focus();$('xb-nav-home')?.click();}
    continue;
   }
   const candidates=visible('button, a[href], input[type="search"], input:not([type]), [role="button"]')
      .filter(el=>scope.contains(el)||(!panel||panel.hidden)&&el.closest('.xb-app-top'));
   const current=document.activeElement as HTMLElement;
   if(action==='confirm'){
    if(current&&candidates.includes(current)){ if(current.tagName==='INPUT'){current.focus()}else current.click();}
    else if(candidates.length){candidates[0].focus();}
   }else if(['up','down','left','right'].includes(action)){
    const next=selectMenuTarget(candidates,current,action);
    if(next){next.focus();if(typeof next.scrollIntoView==='function')next.scrollIntoView({block:'nearest',inline:'nearest'});}
   }
  }
 }

 window.addEventListener('message',event=>{
  if(!acceptsParent(event,window.parent))return;
  if(event.data?.type==='xbridge-input'){
   frame=compactFrame(event.data.packet);lastFrame=Date.now();
   // In catalog mode the Android D-pad, left stick and A/B/Menu operate UI.
   // In play mode every original frame remains dedicated to Xbox input.
   if(!document.body.classList.contains('stream-playing'))handleConsoleController(inputEdges.sample(frame));
   else inputEdges.release();
   $('remote').textContent='Controle do celular recebendo comandos';
  } else if(event.data?.type==='xbridge-release'){
   frame=sanitize({});lastFrame=0;inputEdges.release();$('remote').textContent='Aguardando comandos do celular';
  } else if(event.data?.type==='xbridge-game-menu') {
   // Return to catalog WITHOUT losing the Xbox account cookie.
   // Await reset before enabling another title; avoids concurrent Xbox sessions.
   void (async()=>{
    document.body.classList.remove('stream-playing');
    notifyParent({type:'xbridge-playing',playing:false});
    clearInterval(keepalive);
    try{player?.destroy();player=undefined;}catch(_){}
    $('play').disabled=true;
    status('Encerrando partida atual no Xbox…');
    try{await api('reset')}catch(_){status('Não foi possível encerrar a partida no Xbox.')}
    started=false;
    $('play').disabled=false;
    status('Pronto para escolher outro jogo. Conta Xbox mantida.');
   })();
  } else if(event.data?.type==='xbridge-resume-media'){
   // A user gesture in the TV settings may unlock media on VIDAA.
   void (async()=>{
    let resumed=false;
    for(const element of document.querySelectorAll('video,audio')){
     try{await (element as HTMLMediaElement).play();resumed=true}catch(_){}
    }
    status(resumed?'Reprodução solicitada.':'O navegador bloqueou a reprodução. Tente iniciar o vídeo pelo controle da TV.');
   })();
  }
 });
 document.addEventListener('playing',event=>{
  if(event.target instanceof HTMLVideoElement){document.body.classList.add('stream-playing');notifyParent({type:'xbridge-playing',playing:true});}
 },true);
 setInterval(()=>{if(lastFrame && Date.now()-lastFrame>400){frame=sanitize({});lastFrame=0;$('remote').textContent='Aguardando comandos do celular';}},200);
 const prepare=run(async()=>{
  status('Verificando conexão Xbox salva…');
  setBackend(location.origin+(location.pathname.startsWith('/player')?'/player':''));
  try {
   // /api/resume checks an HttpOnly first-party cookie and returns only a
   // fresh transient room key. Never store Microsoft access tokens in JS.
   const previous=await api('resume');
   if(previous.ok&&previous.id&&previous.tvKey){
    room={id:previous.id,tvKey:previous.tvKey};
    dashboard.ready();
    status('Conta Xbox restaurada. Carregando biblioteca…');
    notifyParent({type:'xbridge-ready'});
    await dashboard.restored();
    return;
   }
  }catch(_){
   // Invalid/expired backend session means the user must authorize again.
   // No Microsoft password is ever asked by the xBridge page.
  }
  room=await api('create');
  dashboard.ready();status('Pronto. Autorize sua conta Microsoft pelo QR Code.');
  notifyParent({type:'xbridge-ready'});
 });
 void prepare();
}

