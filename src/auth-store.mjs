// Encrypted Xbox authorization persistence. No passwords or Microsoft tokens
// are exposed to the VIDAA browser. Dedicated MongoDB readWrite user required.
// Data survives Render restarts, unlike the server's in-memory room map.
import {createCipheriv,createDecipheriv,createHash,randomBytes} from 'node:crypto';
import {MongoClient} from 'mongodb';

let clientPromise;
function settings() {
 const uri=process.env.XBRIDGE_AUTH_MONGODB_URI||'';
 const hex=process.env.XBRIDGE_AUTH_KEY||'';
 return {uri,key:/^[a-f0-9]{64}$/i.test(hex)?Buffer.from(hex,'hex'):null};
}
async function collection() {
 const {uri,key}=settings();
 if(!uri||!key)return null;
 if(!clientPromise){
  clientPromise=(async()=>{
   const client=await new MongoClient(uri,{serverSelectionTimeoutMS:10000,maxPoolSize:3}).connect();
   const col=client.db('xbridge_auth').collection('remembered_xbox');
   await col.createIndex({expiresAt:1},{expireAfterSeconds:0});
   return col;
  })().catch(error=>{clientPromise=null;throw error});
 }
 return clientPromise;
}
const hashId=value=>createHash('sha256').update(value).digest('hex');
function encrypt(value,key){
 const iv=randomBytes(12);
 const cipher=createCipheriv('aes-256-gcm',key,iv);
 const plaintext=Buffer.from(JSON.stringify(value),'utf8');
 const encrypted=Buffer.concat([cipher.update(plaintext),cipher.final()]);
 return {version:1,iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),data:encrypted.toString('base64')};
}
function decrypt(record,key){
 if(!record||record.version!==1)throw Error('Formato de autorização desconhecido');
 const decipher=createDecipheriv('aes-256-gcm',key,Buffer.from(record.iv,'base64'));
 decipher.setAuthTag(Buffer.from(record.tag,'base64'));
 const clear=Buffer.concat([decipher.update(Buffer.from(record.data,'base64')),decipher.final()]);
 return JSON.parse(clear.toString('utf8'));
}
export async function saveXboxRemember(key,record) {
 if(!/^[0-9a-f]{48}$/.test(key))return false;
 const collectionRef=await collection();
 if(!collectionRef)return false;
 const conf=settings();
 const expiresAt=new Date(record.expires);
 const document=encrypt({user:record.user,lastRefresh:0,expires:record.expires},conf.key);
 await collectionRef.updateOne({_id:hashId(key)},{$set:{payload:document,expiresAt,updatedAt:new Date()}},{upsert:true});
 return true;
}
export async function loadXboxRemember(key) {
 if(!/^[0-9a-f]{48}$/.test(key))return null;
 const collectionRef=await collection();
 if(!collectionRef)return null;
 const record=await collectionRef.findOne({_id:hashId(key),expiresAt:{$gt:new Date()}});
 if(!record)return null;
 const clear=decrypt(record.payload,settings().key);
 return clear&&clear.expires>Date.now()?{user:clear.user,token:null,host:'',lastRefresh:0,expires:clear.expires}:null;
}
export async function revokeXboxRemember(key) {
 if(!/^[0-9a-f]{48}$/.test(key))return false;
 const collectionRef=await collection();
 if(!collectionRef)return false;
 await collectionRef.deleteOne({_id:hashId(key)});
 return true;
}
