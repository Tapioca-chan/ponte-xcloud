import {needsXboxDialogCompatibility} from './game-compat.mjs';

// Bounded second chance during Metro's opening when the player repeatedly
// presses A and WebRTC reports video freezes, but the native VIDAA video plane
// cannot be sampled. Never apply to other games or indefinitely during play.
export function shouldRecoverMetroIntro({
 title, sessionAgeMs, aPresses=0, recentFreezeEvents=0, totalFreezeCount=0,
 attempts=0, lastAttemptAt=0, now=0,
 overlayOpen=false, videoReadyState=0, hasVideo=false, connection='connected'
}){
 if(!needsXboxDialogCompatibility(title))return false;
 if(!Number.isFinite(sessionAgeMs)||sessionAgeMs<90000||sessionAgeMs>300000)return false;
 if(!Number.isInteger(aPresses)||aPresses<3)return false;
 // VIDAA can report a single freeze BEFORE the 60s preroll grace and
 // never report another. Keep that browser-observed evidence for this one
 // Metro intro fallback; never turn it into a repeated periodic recovery.
 if(!(Number.isInteger(recentFreezeEvents)&&recentFreezeEvents>0) &&
    !(Number.isInteger(totalFreezeCount)&&totalFreezeCount>0))return false;
 // Only a single fallback during the opening; subsequent repairs require
 // stronger independent evidence, never periodic rebinds.
 if(attempts!==0||overlayOpen||!hasVideo||videoReadyState<2)return false;
 if(connection!=='connected'&&connection!=='completed')return false;
 if(lastAttemptAt>0 && now-lastAttemptAt<90000)return false;
 return true;
}

export function describeRecoveryBlockers({
 title,sessionAgeMs,freezeEvents=0,totalFreezeCount=0,aPresses=0,
 attempts=0,overlayOpen=false,hasVideo=false,videoReadyState=0,
 connection='connected',cooldownMs=0
}){
 const matched=needsXboxDialogCompatibility(title);
 if(!matched)return 'Título não identificado como Metro Exodus';
 if(overlayOpen)return 'Painel aberto: recuperação aguardando fechamento';
 if(!hasVideo||videoReadyState<2)return 'Vídeo ainda não está pronto';
 if(connection==='failed'||connection==='closed'||connection==='disconnected')return 'Conexão WebRTC indisponível';
 if(attempts>=3)return 'Limite de três recuperações atingido';
 if(cooldownMs>0)return 'Intervalo de proteção: '+Math.ceil(cooldownMs/1000)+' segundos';
 if(freezeEvents>=2)return 'Dois congelamentos WebRTC: recuperação autorizada';
 if(sessionAgeMs<60000)return 'Aguardando anúncio inicial e estabilização';
 const anyObservedFreeze=freezeEvents>=1 || totalFreezeCount>=1;
 if(anyObservedFreeze && aPresses>=3 && sessionAgeMs>=90000 && sessionAgeMs<=300000 && attempts===0)
  return 'Créditos do Metro: botão A repetido + congelamento WebRTC acumulado; recuperação autorizada';
 if(anyObservedFreeze && sessionAgeMs<90000)
  return 'Congelamento WebRTC registrado. Aguardando 90 s para proteger o anúncio';
 if(anyObservedFreeze && aPresses<3)
  return 'Congelamento WebRTC registrado. Aguardando 3 pressões de A na abertura';
 if(anyObservedFreeze)return 'Congelamento WebRTC acumulado; janela inicial de recuperação encerrada';
 return 'Nenhum congelamento WebRTC registrado desde o início da transmissão';
}
