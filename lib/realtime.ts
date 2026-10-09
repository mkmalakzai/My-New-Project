import {get,onValue,ref,runTransaction,set,update} from "firebase/database";
import {rtdb} from "./firebase";

const arr=(v:any)=>Array.isArray(v)?v:(v&&typeof v==="object"?Object.values(v):[]);

export type RemoteUser={
  telegramId:number;
  name:string;
  username:string;
  photo?:string;
  balance:number;
  vipEarnings:number;
  referralEarnings:number;
  joinedAt:number;
  lastSeen:number;
  banned:boolean;
  referredBy?:number|null;
  stakes:any[];
  transactions:any[];
  requests:any[];
};

export function normalizeUser(v:any,id:number):RemoteUser{
  return {
    telegramId:Number(v?.telegramId||id),
    name:String(v?.name||"AFGlion User"),
    username:String(v?.username||""),
    photo:String(v?.photo||""),
    balance:Number(v?.balance||0),
    vipEarnings:Number(v?.vipEarnings||0),
    referralEarnings:Number(v?.referralEarnings||0),
    joinedAt:Number(v?.joinedAt||Date.now()),
    lastSeen:Number(v?.lastSeen||Date.now()),
    banned:v?.banned===true,
    referredBy:v?.referredBy?Number(v.referredBy):null,
    stakes:arr(v?.stakes),
    transactions:arr(v?.transactions),
    requests:arr(v?.requests)
  };
}

export async function ensureRemoteUser(input:{telegramId:number;name:string;username:string;photo?:string;referredBy?:number|null}){
  const userRef=ref(rtdb,"users/"+input.telegramId);
  let created=false;
  const result=await runTransaction(userRef,current=>{
    if(current){
      return {...current,name:input.name,username:input.username,photo:input.photo||current.photo||"",lastSeen:Date.now()};
    }
    created=true;
    return {
      telegramId:input.telegramId,name:input.name,username:input.username,photo:input.photo||"",
      balance:0,vipEarnings:0,referralEarnings:0,joinedAt:Date.now(),lastSeen:Date.now(),
      banned:false,referredBy:input.referredBy&&input.referredBy!==input.telegramId?input.referredBy:null,
      stakes:[],transactions:[],requests:[]
    };
  });
  if(created&&input.referredBy&&input.referredBy!==input.telegramId){
    const rr=ref(rtdb,`referrals/${input.referredBy}/${input.telegramId}`);
    await runTransaction(rr,current=>current||{
      inviterTelegramId:input.referredBy,invitedTelegramId:input.telegramId,
      status:"joined",reward:0,createdAt:Date.now()
    });
  }
  return {created,user:normalizeUser(result.snapshot.val(),input.telegramId)};
}

export async function saveRemoteUser(id:number,user:Partial<RemoteUser>){
  await update(ref(rtdb,"users/"+id),{...user,lastSeen:Date.now()});
}

export function watchRemoteUser(id:number,cb:(user:RemoteUser)=>void){
  return onValue(ref(rtdb,"users/"+id),snap=>{if(snap.exists())cb(normalizeUser(snap.val(),id))});
}

export async function loadGlobal(){
  const [settings,plans,security]=await Promise.all([
    get(ref(rtdb,"config/settings")),
    get(ref(rtdb,"config/plans")),
    get(ref(rtdb,"security"))
  ]);
  return {
    settings:settings.val()||null,
    plans:arr(plans.val()),
    security:security.val()||null
  };
}

export function watchGlobal(cb:(data:any)=>void){
  const emit=async()=>cb(await loadGlobal());
  const off1=onValue(ref(rtdb,"config/settings"),emit);
  const off2=onValue(ref(rtdb,"config/plans"),emit);
  const off3=onValue(ref(rtdb,"security"),emit);
  return ()=>{off1();off2();off3()};
}

export async function saveGlobalSettings(settings:any){
  await set(ref(rtdb,"config/settings"),settings);
}
export async function saveGlobalPlans(plans:any[]){
  await set(ref(rtdb,"config/plans"),plans);
}
export async function saveSecurity(security:any){
  await set(ref(rtdb,"security"),security);
}

export function watchAllUsers(cb:(users:RemoteUser[])=>void){
  return onValue(ref(rtdb,"users"),snap=>{
    const raw=snap.val()||{};
    cb(Object.entries(raw).map(([id,v])=>normalizeUser(v,Number(id))));
  });
}

export function watchReferrals(inviterId:number,cb:(items:any[])=>void){
  return onValue(ref(rtdb,"referrals/"+inviterId),async snap=>{
    const raw=snap.val()||{};
    const entries=Object.values(raw) as any[];
    const enriched=await Promise.all(entries.map(async r=>{
      const u=await get(ref(rtdb,"users/"+r.invitedTelegramId));
      return {
        id:String(r.invitedTelegramId),
        name:String(u.val()?.name||("User "+r.invitedTelegramId)),
        joinedAt:Number(r.createdAt||Date.now()),
        status:r.status==="rewarded"?"rewarded":"joined",
        reward:Number(r.reward||0)
      };
    }));
    cb(enriched);
  });
}

export async function rewardReferral(inviterId:number,inviteeId:number,amount:number){
  if(!inviterId||!inviteeId||!amount||amount<=0)return;
  const rounded=Math.round(amount*100)/100;
  await runTransaction(ref(rtdb,"users/"+inviterId),current=>{
    if(!current)return current;
    return {
      ...current,
      balance:Math.round((Number(current.balance||0)+rounded)*100)/100,
      referralEarnings:Math.round((Number(current.referralEarnings||0)+rounded)*100)/100
    };
  });
  await runTransaction(ref(rtdb,`referrals/${inviterId}/${inviteeId}`),current=>{
    const base=current||{inviterTelegramId:inviterId,invitedTelegramId:inviteeId,createdAt:Date.now()};
    return {...base,status:"rewarded",reward:Math.round((Number(base.reward||0)+rounded)*100)/100,lastRewardAt:Date.now()};
  });
}

export async function updateRemoteUserBalance(id:number,balance:number){
  await update(ref(rtdb,"users/"+id),{balance:Math.max(0,Math.round(balance*100)/100)});
}
export async function updateRemoteUserBan(id:number,banned:boolean){
  await update(ref(rtdb,"users/"+id),{banned});
}

export async function updateRemoteRequest(userId:number,requestId:string,patch:any){
  await runTransaction(ref(rtdb,"users/"+userId+"/requests"),current=>{
    const list=arr(current);
    return list.map((r:any)=>String(r?.id)===String(requestId)?{...r,...patch}:r);
  });
}
