// xal-node returns a UserToken wrapper for refreshUserToken(), but raw
// OAuth JSON for its device-code flow. Normalize both before persisting.
export function normalizeMicrosoftUserToken(token, previous) {
 const source=(token && typeof token==='object' && token.data && typeof token.data==='object')
   ? token.data : token;
 if(!source || typeof source!=='object' ||
    typeof source.access_token!=='string' || !source.access_token) {
  throw new Error('Resposta de token Microsoft incompatível');
 }
 const refresh_token=typeof source.refresh_token==='string' && source.refresh_token
  ? source.refresh_token : previous?.refresh_token;
 if(typeof refresh_token!=='string'||!refresh_token) {
  throw new Error('A Microsoft não retornou token de renovação');
 }
 const expires=Number(source.expires_in);
 const expires_on=typeof source.expires_on==='string' && !Number.isNaN(Date.parse(source.expires_on))
  ? source.expires_on
  : Number.isFinite(expires) && expires>0
    ? new Date(Date.now()+expires*1000).toISOString() : undefined;
 return {...source,refresh_token,...(expires_on?{expires_on}:{})};
}
