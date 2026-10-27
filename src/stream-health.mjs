// Lightweight freeze check used by the VIDAA player.
// It distinguishes an inbound video transport stall from a game loading screen:
// continuously decoded frames mean transport is alive even if the picture is static.
export function classifyStreamHealth(previous,current,seconds=6){
 if(!current||current.connection==='failed')return {kind:'network-error',reason:'Conexão WebRTC interrompida'};
 if(!previous)return {kind:'warmup',reason:'Coletando dados de vídeo'};
 const decodedBefore=Number(previous.decoded)||0,decodedNow=Number(current.decoded)||0;
 const receivedBefore=Number(previous.received)||0,receivedNow=Number(current.received)||0;
 const width=Number(current.videoWidth)||0,height=Number(current.videoHeight)||0;
 const presentedBefore=Number.isFinite(previous.presented)?Number(previous.presented):null;
 const presentedNow=Number.isFinite(current.presented)?Number(current.presented):null;
 // Some VIDAA browsers expose a permanent zero framesRendered stub.
 // Only claim display stalls after this same counter has shown real progress.
 const presentationMeasured=presentedBefore!==null&&presentedNow!==null&&
   (presentedBefore>0||presentedNow>0);
 if(decodedNow>decodedBefore){
  if(presentationMeasured&&presentedNow===presentedBefore){
   return {kind:'presentation-stall',reason:'O Xbox envia quadros, mas o navegador não apresenta imagens novas',decoded:decodedNow-decodedBefore,presented:0,width,height};
  }
  if(presentationMeasured&&presentedNow>presentedBefore){
   return {kind:'active',reason:'Vídeo atualizado na tela ('+(presentedNow-presentedBefore)+' quadros)',decoded:decodedNow-decodedBefore,presented:presentedNow-presentedBefore,width,height};
  }
  return {kind:'active',reason:'Quadros decodificados; apresentação não mensurável neste VIDAA',decoded:decodedNow-decodedBefore,width,height};
 }
 if(receivedNow>receivedBefore)return {kind:'decode-stall',reason:'Vídeo recebido, mas a TV não está decodificando novos quadros',width,height};
 if(seconds>=5)return {kind:'network-stall',reason:'Sem novos quadros do servidor Xbox',width,height};
 return {kind:'warmup',reason:'Aguardando vídeo'};
}
