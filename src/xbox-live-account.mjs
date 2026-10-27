// Xbox Live read-only profile and achievements with the Microsoft session
// already authorized by the xCloud player. No second login, no token exposure.
export function normalizeXboxWebToken(wrapper){
 const data=wrapper?.data||wrapper;
 const xui=data?.DisplayClaims?.xui?.[0];
 const token=typeof data?.Token==='string'?data.Token:'';
 const xuid=String(xui?.xid||'');
 const userHash=String(xui?.uhs||'');
 if(!token||!/^\d{8,20}$/.test(xuid)||!/^[A-Za-z0-9]+$/.test(userHash))
  return null;
 return {token,xuid,userHash};
}
const short=(v,max=150)=>typeof v==='string'?v.slice(0,max):'';
export function summarizeXboxAchievements(payload,filterTitleId=''){
 const data=payload&&typeof payload==='object'?payload:{};
 const list=Array.isArray(data.achievements)?data.achievements.slice(0,60):[];
 const records=list.map(x=>{
  const unlocked=x?.progressState==='Achieved',secret=x?.isSecret===true&&!unlocked;
  const reward=Array.isArray(x?.rewards)?x.rewards.find(r=>r?.type==='Gamerscore'):null;
  const points=/^\d{1,4}$/.test(String(reward?.value??''))?Number(reward.value):null;
  return {id:short(x?.id,100),
   name:secret?'Conquista secreta':short(x?.name,180),
   description:short(secret?x?.lockedDescription:x?.description,200),
   unlocked,points,unlockedAt:unlocked?short(x?.progression?.timeUnlocked,48):''};
 });
 const count=Number(data.pagingInfo?.totalRecords);
 const total=Number.isSafeInteger(count)&&count>=records.length?count:records.length;
 return {source:'xbox-live',scope:filterTitleId?'game':'account',
  titleId:filterTitleId||null,achievements:records,
  unlockedCount:records.filter(x=>x.unlocked).length,
  shownCount:records.length,totalCount:total,
  // A partial page is never falsely presented as the whole game.
  partial:total>records.length||Boolean(data.pagingInfo?.continuationToken),
  gamerscoreShown:records.reduce((sum,x)=>sum+(x.unlocked?x.points||0:0),0)};
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
 const achievementsUrl=new URL('https://achievements.xboxlive.com/users/xuid('+auth.xuid+')/achievements');
 achievementsUrl.searchParams.set('maxItems','60');
 achievementsUrl.searchParams.set('orderBy','UnlockTime');
 const id=/^\d{1,12}$/.test(String(titleId))?String(titleId):'';
 if(id)achievementsUrl.searchParams.set('titleId',id);
 let gamertag='',gamerscore=null,profileCode='',achievementsCode='',achievements=null;
 try{
  const result=await request(profileUrl,{method:'POST',redirect:'error',
   signal:AbortSignal.timeout(12000),
   headers:{...headers,'Content-Type':'application/json'},
   body:JSON.stringify({userIds:[auth.xuid],settings:['Gamertag','Gamerscore']})});
  if(result.ok){
   const data=await result.json();
   const settings=data?.profileUsers?.[0]?.settings;
   if(Array.isArray(settings))for(const field of settings){
    if(field?.id==='Gamertag')gamertag=short(field.value,50);
    if(field?.id==='Gamerscore'&&/^\d{1,9}$/.test(String(field.value)))
     gamerscore=Number(field.value);
   }
  }else profileCode=result.status===401||result.status===403?'xbox_permission':'profile_unavailable';
 }catch{profileCode='profile_unavailable';}
 try{
  const result=await request(achievementsUrl.href,{method:'GET',redirect:'error',signal:AbortSignal.timeout(12000),headers});
  if(result.ok)achievements=summarizeXboxAchievements(await result.json(),id);
  else achievementsCode=result.status===401||result.status===403?'xbox_permission':
    result.status===429?'rate_limited':'achievements_unavailable';
 }catch{achievementsCode='achievements_unavailable';}
 return {ok:Boolean(gamertag||gamerscore!==null||achievements),
  source:'xbox-live',profile:{gamertag:gamertag||null,gamerscore},
  achievements,profileCode:profileCode||null,achievementsCode:achievementsCode||null};
}
