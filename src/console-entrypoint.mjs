// Historic XBridge URL launches the console, while the dedicated /player
// reverse proxy must keep receiving the unmodified Xbox WebRTC player.
// The browser is redirected to the canonical same-origin TV+Android app
// rather than embedding it cross-origin (which would break controller/iframe
// and Microsoft remember-cookie behavior).
export const CONSOLE_ORIGIN='https://xbridge-hnd9.onrender.com';

export function isDirectConsoleNavigation({pathname='/',method='GET',proxyMarker=''}={}){
 return method==='GET' && (pathname==='/'||pathname==='/index.html') &&
   proxyMarker!=='tv-player';
}

export function directConsoleDestination(query=''){
 const input=new URLSearchParams(String(query).replace(/^\?/,'')); 
 const result=new URL(CONSOLE_ORIGIN+'/');
 result.searchParams.set('role',input.get('role')==='mobile'?'mobile':'tv');
 const room=input.get('room')||'';
 if(/^[A-Z0-9]{4,8}$/i.test(room))result.searchParams.set('room',room.toUpperCase());
 return result.toString();
}
