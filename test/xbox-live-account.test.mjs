import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeXboxWebToken,summarizeXboxAchievements,readXboxLiveAccount} from '../src/xbox-live-account.mjs';

const token={data:{Token:'SECRET_XSTS_TOKEN',DisplayClaims:{xui:[{xid:'1234567890123456',uhs:'12345ABC'}]}}};
test('Existing Microsoft token can be exchanged for Xbox web token without exposing token',()=>{
 assert.equal(normalizeXboxWebToken(token)?.xuid,'1234567890123456');
 assert.equal(normalizeXboxWebToken({data:{Token:'abc'}}),null);
});
test('Xbox achievements: progress is derived only from official response',()=>{
 const result=summarizeXboxAchievements({achievements:[
  {id:'1',name:'Complete',progressState:'Achieved',rewards:[{type:'Gamerscore',value:'10'}]},
  {id:'2',name:'Secret title',isSecret:true,progressState:'NotStarted',rewards:[{type:'Gamerscore',value:'50'}]}
 ],pagingInfo:{totalRecords:5}},'1234');
 assert.equal(result.scope,'game');
 assert.equal(result.unlockedCount,1);
 assert.equal(result.totalCount,5);
 assert.equal(result.partial,true);
 assert.equal(result.achievements[1].name,'Conquista secreta');
 assert.equal(result.gamerscoreShown,10);
});
test('Uses authorized XSTS token only in server requests; not returned to UI',async()=>{
 const calls=[];
 const request=async(url,opt)=>{
  calls.push({url,headers:opt.headers,method:opt.method});
  return {ok:true,status:200,json:async()=>url.includes('profile')?
   {profileUsers:[{settings:[{id:'Gamertag',value:'XbridgeGamer'},{id:'Gamerscore',value:'460'}]}]}:
   {achievements:[{id:'4',name:'Victory',progressState:'Achieved',rewards:[{type:'Gamerscore',value:'40'}]}],pagingInfo:{totalRecords:1}}};
 };
 const r=await readXboxLiveAccount(token,{request,titleId:'1234'});
 assert.equal(r.ok,true);assert.equal(r.profile.gamerscore,460);
 assert.equal(r.achievements?.scope,'game');
 assert.equal(calls.length,2);
 assert.match(calls[1].url,/titleId=1234/);
 assert.doesNotMatch(JSON.stringify(r),/SECRET_XSTS_TOKEN|1234567890123456|12345ABC/);
});
test('Xbox permission errors do not revoke the current Microsoft game login',async()=>{
 const request=async()=>({ok:false,status:403});
 const result=await readXboxLiveAccount(token,{request});
 assert.equal(result.ok,false);
 assert.equal(result.achievementsCode,'xbox_permission');
});

test('Achievement art keeps legitimate HTTPS Xbox assets, no spoofed hosts',async()=>{
 const {xboxAchievementImage}=await import('../src/xbox-live-account.mjs');
 assert.equal(xboxAchievementImage('http://images-eds.xboxlive.com/0/a.png'),
  'https://images-eds.xboxlive.com/0/a.png');
 assert.equal(xboxAchievementImage('https://xboxlive.com.attacker.com/image'),null);
 const shown=summarizeXboxAchievements({achievements:[{
  id:'12',titleAssociations:[{id:2064168993,name:'Game from Xbox'}],
  mediaAssets:[{type:'Icon',url:'http://images-eds.xboxlive.com/asset.png'}],
  name:'True Icon',progressState:'Achieved',isSecret:true,
  progression:{timeUnlocked:'2026-10-27T13:00:00Z'}
 }]},'2064168993');
 assert.equal(shown.achievements[0].icon,'https://images-eds.xboxlive.com/asset.png');
 assert.equal(shown.gameName,'Game from Xbox');
 assert.equal(shown.achievements[0].unlockedAt,'2026-10-27T13:00:00Z');
 const secret=summarizeXboxAchievements({achievements:[{
  id:'13',name:'Mystery',isSecret:true,progressState:'NotStarted',
  mediaAssets:[{type:'Icon',url:'https://xbox.com/secret.png'}]
 }]},'2064168993');
 assert.equal(secret.achievements[0].icon,null);
});
test('Missing verified Xbox TitleId NEVER mixes account achievements with active game',async()=>{
 let calls=0;
 const request=async()=>{calls++;return {ok:true,status:200,json:async()=>({profileUsers:[{settings:[]}]})}};
 const result=await readXboxLiveAccount(token,{request,titleId:''});
 assert.equal(calls,1);
 assert.equal(result.achievements,null);
 assert.equal(result.achievementsCode,'game_title_id_missing');
});
