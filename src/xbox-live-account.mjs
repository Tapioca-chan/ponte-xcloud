// Xbox Live read-only profile and achievements from the existing Microsoft
// session. Never forward user hashes, Xbox IDs or tokens to the TV.
export function normalizeXboxWebToken(wrapper){
 const data=wrapper?.data||wrapper;
 const xui=data?.DisplayClaims?.xui?.[0];
 const token=typeof data?.Token==='string'?data.Token:'';
 const xuid=String(xui?.xid||'');
 const userHash=String(xui?.uhs||'');
 if(!token||!/^\d{8,20}$/.test(xuid)||!/^[A-Za-z0-9]+$/.test(userHash))return null;
 return {token,xuid,userHash};
}
const short=(v,max=150)=>typeof v==='string'?v.slice(0,max):'';
const validXboxTitleId=v=>/^\d{1,12}$/.test(String(v||''))?String(v):'';
export function xboxAchievementImage(value){
 if(typeof value!=='string'||!value)return null;
 try{
  // Historical Xbox metadata sometimes uses HTTP for a public asset.
  // Upgrade only trusted Xbox/Microsoft asset hosts to HTTPS.
  const parsed=new URL(value);
  const host=parsed.hostname.toLowerCase();
  const allowed=['xboxlive.com','xbox.com','microsoft.com','s-microsoft.com'];
  if(!allowed.some(d=>host===d||host.endsWith('.'+d))||
     !['https:','http:'].includes(parsed.protocol))return null;
  parsed.protocol='https:';
  return parsed.toString().slice(0,520);
 }catch{return null;}
}
export function summarizeXboxAchievements(payload,filterTitleId=''){
 const data=payload&&typeof payload==='object'?payload:{};
 const list=Array.isArray(data.achievements)?data.achievements.slice(0,100):[];
 const records=list.map(x=>{
  const unlocked=x?.progressState==='Achieved';
  const secret=x?.isSecret===true&&!unlocked;
  const reward=Array.isArray(x?.rewards)?x.rewards.find(r=>r?.type==='Gamerscore'):null;
  const points=/^\d{1,4}$/.test(String(reward?.value??''))?Number(reward.value):null;
  const media=Array.isArray(x?.mediaAssets)?x.mediaAssets.find(m=>m?.type==='Icon'&&m.url):null;
  const associate=Array.isArray(x?.titleAssociations)?x.titleAssociations.find(t=>t?.name):null;
  const requirements=Array.isArray(x?.progression?.requirements)?x.progression.requirements:[];
  const progressNumbers=requirements.length===1?requirements[0]:null;
  const current=Number(progressNumbers?.current),target=Number(progressNumbers?.target);
  const progressPercent=unlocked?100:(progressNumbers && Number.isFinite(current)&&
   Number.isFinite(target)&&target>0?Math.max(0,Math.min(100,Math.round(current/target*100))):null);
  return {id:short(x?.id,100),titleId:validXboxTitleId(associate?.id)||filterTitleId,
   gameName:short(associate?.name,120),
   name:secret?'Conquista secreta':short(x?.name,180),
   description:short(secret?x?.lockedDescription:x?.description,240),
   unlocked,points,icon:secret?null:xboxAchievementImage(media?.url),
   progressPercent,unlockedAt:unlocked?short(x?.progression?.timeUnlocked,48):''};
 });
 const declared=Number(data.pagingInfo?.totalRecords);
 const total=Number.isSafeInteger(declared)&&declared>=records.length?declared:records.length;
 return {source:'xbox-live',scope:filterTitleId?'game':'account',
  titleId:filterTitleId||null,gameName:filterTitleId?(records.find(r=>r.gameName)?.gameName||''):null,
  achievements:records,unlockedCount:records.filter(x=>x.unlocked).length,
  shownCount:records.length,totalCount:total,partial:total>records.length||
   Boolean(data.pagingInfo?.continuationToken),
  gamerscoreShown:records.reduce((sum,x)=>sum+(x.unlocked?x.points||0:0),0),
  gamerscoreAvailable:records.reduce((sum,x)=>sum+(x.points||0),0)};
}
export async function readXboxLiveAccount(webToken,{titleId='',request=fetch}={}){
 const auth=normalizeXboxWebToken(webToken);
 if(!auth)return {ok:false,code:'xbox_identity_unavailable'};
 const headers={
  Authorization:'XBL3.0 x='+auth.userHash+';'+auth.token,
  'x-xbl-contract-version':'2',
  'Accept-Language':'pt-BR,pt,en-US'
 };
 const profileUrl='https://profile.xboxlive.com/users/batch/profile/settings';
 let gamertag='',gamerscore=null,profileCode='',achievementsCode='',achievements=null;
 try{
  const result=await request(profileUrl,{method:'POST',redirect:'error',signal:AbortSignal.timeout(12000),
   headers:{...headers,'Content-Type':'application/json'},
   body:JSON.stringify({userIds:[auth.xuid],settings:['Gamertag','Gamerscore']})});
  if(result.ok){
   const data=await result.json();const settings=data?.profileUsers?.[0]?.settings;
   if(Array.isArray(settings))for(const field of settings){
    if(field?.id==='Gamertag')gamertag=short(field.value,50);
    if(field?.id==='Gamerscore'&&/^\d{1,9}$/.test(String(field.value)))gamerscore=Number(field.value);
   }
  }else profileCode=result.status===401||result.status===403?'xbox_permission':'profile_unavailable';
 }catch{profileCode='profile_unavailable';}
 const id=validXboxTitleId(titleId);
 if(!id){
  // User asked for achievements of the running game. Do not incorrectly
  // fall back to recently unlocked achievements from unrelated Xbox games.
  achievementsCode='game_title_id_missing';
 }else{
  try{
   const result=await requestAchievements(auth,headers,id,request);
   achievements=result.achievements;
   achievementsCode=result.code;
  }catch{achievementsCode='achievements_unavailable';}
 }
 return {ok:Boolean(gamertag||gamerscore!==null||achievements),
  source:'xbox-live',profile:{gamertag:gamertag||null,gamerscore},
  achievements,profileCode:profileCode||null,achievementsCode:achievementsCode||null};
}
async function requestAchievements(auth,headers,titleId,request){
 const all=[];let totalRecords=0,continuation='',more=false;
 // A single query commonly covers an entire game's achievements. Follow at
 // most 2 additional pages, capped to avoid straining the Render/Xbox player.
 for(let page=0;page<3;page++){
  const url=new URL('https://achievements.xboxlive.com/users/xuid('+auth.xuid+')/achievements');
  url.searchParams.set('maxItems','100');url.searchParams.set('orderBy','Title');
  url.searchParams.set('titleId',titleId);
  if(continuation)url.searchParams.set('continuationToken',continuation);
  const response=await request(url.href,{method:'GET',redirect:'error',signal:AbortSignal.timeout(12000),headers});
  if(!response.ok)return {achievements:null,code:response.status===401||response.status===403?
   'xbox_permission':response.status===429?'rate_limited':'achievements_unavailable'};
  const body=await response.json();
  if(!Array.isArray(body?.achievements))return {achievements:null,code:'invalid_achievements_response'};
  const normalized=summarizeXboxAchievements(body,titleId);
  all.push(...normalized.achievements);
  totalRecords=Math.max(totalRecords,normalized.totalCount);
  continuation=typeof body.pagingInfo?.continuationToken==='string'?
   body.pagingInfo.continuationToken.slice(0,1000):'';
  more=Boolean(continuation);
  if(!more||!body.achievements.length)break;
 }
 const combined={source:'xbox-live',scope:'game',titleId,
  gameName:all.find(r=>r.gameName)?.gameName||'',
  achievements:all.slice(0,300),unlockedCount:all.filter(a=>a.unlocked).length,
  shownCount:all.length,totalCount:Math.max(totalRecords,all.length),
  partial:more||totalRecords>all.length,
  gamerscoreShown:all.reduce((n,a)=>n+(a.unlocked?a.points||0:0),0),
  gamerscoreAvailable:all.reduce((n,a)=>n+(a.points||0),0)};
 return {achievements:combined,code:''};
}
