const {onCall, HttpsError} = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const crypto = require("crypto");

admin.initializeApp();
const db = admin.firestore();
const DEFAULT_OWNER_ID = 6589090462;
const money = n => Math.round((Number(n) || 0) * 100) / 100;
const now = () => Date.now();

const DEFAULT_SETTINGS = {
  currency: "AFN",
  currencySymbol: "؋",
  minDeposit: 100,
  maxDeposit: 100000,
  minWithdraw: 100,
  maxWithdraw: 50000,
  referralPercent: 5,
  announcement: "Welcome to AFGlion — your premium finance dashboard.",
  botUsername: "Afglionbot",
  channels: [],
  paymentMethods: [
    {id:"hesab-pay",name:"HESAB PAY",number:"",details:"Add payment instructions here.",active:true,kind:"both"},
    {id:"momo",name:"MOMO",number:"",details:"Add payment instructions here.",active:true,kind:"both"}
  ]
};

const DEFAULT_PLANS = [
  {id:"lion-start",name:"Lion Start",price:1000,dailyReward:8,durationDays:30,badge:"START",active:true},
  {id:"lion-pro",name:"Lion Pro",price:3000,dailyReward:27,durationDays:60,badge:"POPULAR",active:true},
  {id:"lion-elite",name:"Lion Elite",price:6000,dailyReward:60,durationDays:90,badge:"ELITE",active:true}
];

function clean(value, max=300){
  return String(value ?? "").trim().slice(0,max);
}
function verifyTelegram(initData, botToken){
  if(!initData) throw new HttpsError("unauthenticated","Telegram login required");
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if(!hash) throw new HttpsError("unauthenticated","Invalid Telegram data");
  params.delete("hash");
  const check = [...params.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>k+"="+v).join("\n");
  const secret = crypto.createHmac("sha256","WebAppData").update(botToken).digest();
  const calc = crypto.createHmac("sha256",secret).update(check).digest("hex");
  if(calc.length!==hash.length || !crypto.timingSafeEqual(Buffer.from(calc),Buffer.from(hash))){
    throw new HttpsError("unauthenticated","Telegram verification failed");
  }
  const authDate = Number(params.get("auth_date")||0);
  if(!authDate || Math.abs(Date.now()/1000-authDate)>86400){
    throw new HttpsError("unauthenticated","Telegram session expired");
  }
  let user;
  try{ user=JSON.parse(params.get("user")||"{}"); }catch{}
  if(!user?.id) throw new HttpsError("unauthenticated","Telegram user missing");
  return {user,params};
}
function requireAuth(req){
  const id = Number(req.auth?.token?.telegram_id || 0);
  if(!req.auth || !id) throw new HttpsError("unauthenticated","Open AFGlion from Telegram first");
  return id;
}
async function ensureDefaults(){
  const secRef=db.doc("system/security"), cfgRef=db.doc("publicConfig/app");
  const [sec,cfg]=await Promise.all([secRef.get(),cfgRef.get()]);
  const batch=db.batch();
  let changed=false;
  if(!sec.exists){
    batch.set(secRef,{ownerId:DEFAULT_OWNER_ID,adminIds:[],updatedAt:now()});
    changed=true;
  }
  if(!cfg.exists){
    batch.set(cfgRef,{...DEFAULT_SETTINGS,updatedAt:now()});
    changed=true;
  }
  const planRefs=DEFAULT_PLANS.map(p=>db.doc("vipPlans/"+p.id));
  const planSnaps=await db.getAll(...planRefs);
  planSnaps.forEach((snap,i)=>{
    if(!snap.exists){
      const p=DEFAULT_PLANS[i];
      batch.set(planRefs[i],{name:p.name,price:p.price,dailyReward:p.dailyReward,durationDays:p.durationDays,badge:p.badge,active:p.active,createdAt:now(),createdBy:DEFAULT_OWNER_ID});
      changed=true;
    }
  });
  if(changed) await batch.commit();
}
async function getSecurity(){
  await ensureDefaults();
  const s=await db.doc("system/security").get();
  const d=s.data()||{};
  return {ownerId:Number(d.ownerId||DEFAULT_OWNER_ID),adminIds:Array.isArray(d.adminIds)?d.adminIds.map(Number).filter(Boolean):[]};
}
function roleFor(id,security){
  if(Number(id)===Number(security.ownerId)) return "owner";
  if(security.adminIds.includes(Number(id))) return "admin";
  return "user";
}
async function requireAdmin(req){
  const id=requireAuth(req);
  const security=await getSecurity();
  const role=roleFor(id,security);
  if(role==="user") throw new HttpsError("permission-denied","Admin access required");
  return {id,security,role};
}
async function requireOwner(req){
  const id=requireAuth(req);
  const security=await getSecurity();
  if(Number(id)!==Number(security.ownerId)) throw new HttpsError("permission-denied","Owner access required");
  return {id,security};
}
async function assertActiveUser(id){
  const s=await db.doc("users/"+id).get();
  if(!s.exists) throw new HttpsError("not-found","User not found");
  if(s.data()?.isBanned===true) throw new HttpsError("permission-denied","Account restricted");
  return s;
}
async function getSettings(){
  await ensureDefaults();
  const s=await db.doc("publicConfig/app").get();
  return {...DEFAULT_SETTINGS,...(s.data()||{})};
}
function activeMethod(settings,name,kind){
  const methods=Array.isArray(settings.paymentMethods)?settings.paymentMethods:[];
  return methods.find(m=>m.active!==false && clean(m.name,60)===clean(name,60) && (m.kind==="both"||m.kind===kind));
}
function sortCreated(list){
  return list.sort((a,b)=>Number(b.createdAt||b.startAt||0)-Number(a.createdAt||a.startAt||0));
}
function docData(snap){
  return {id:snap.id,...snap.data()};
}

exports.authenticateTelegram = onCall(async req=>{
  await ensureDefaults();
  const {user,params}=verifyTelegram(req.data?.initData,process.env.TELEGRAM_BOT_TOKEN||"");
  const uid=String(user.id), userRef=db.doc("users/"+uid);
  const security=await getSecurity();
  const role=roleFor(user.id,security);
  const refRaw=String(req.data?.ref||params.get("start_param")||"");
  const referredBy=refRaw.startsWith("ref_")?Number(refRaw.slice(4)):Number(refRaw)||null;

  await db.runTransaction(async tx=>{
    const us=await tx.get(userRef);
    let referralRef=null, referralSnap=null, inviterRef=null, inviterSnap=null;
    if(!us.exists && referredBy && referredBy!==user.id){
      referralRef=db.doc("referrals/"+referredBy+"_"+user.id);
      inviterRef=db.doc("users/"+referredBy);
      [referralSnap,inviterSnap]=await Promise.all([tx.get(referralRef),tx.get(inviterRef)]);
    }
    if(!us.exists){
      tx.set(userRef,{
        telegramId:user.id,
        firstName:clean(user.first_name,100)||"User",
        username:clean(user.username,100),
        photoUrl:clean(user.photo_url,500),
        balance:0,totalVipProfit:0,referralEarnings:0,totalReferrals:0,
        referredBy:referredBy&&referredBy!==user.id?referredBy:null,
        isBanned:false,createdAt:now(),lastSeen:now()
      });
      if(referralRef && referralSnap && !referralSnap.exists){
        tx.set(referralRef,{inviterTelegramId:referredBy,invitedTelegramId:user.id,status:"joined",reward:0,createdAt:now()});
        if(inviterRef && inviterSnap?.exists){
          tx.update(inviterRef,{totalReferrals:Number(inviterSnap.data().totalReferrals||0)+1});
        }
      }
    }else{
      tx.update(userRef,{
        firstName:clean(user.first_name,100)||"User",
        username:clean(user.username,100),
        photoUrl:clean(user.photo_url,500),
        lastSeen:now()
      });
    }
  });

  const userSnap=await userRef.get();
  const banned=userSnap.data()?.isBanned===true;
  const token=await admin.auth().createCustomToken(uid,{
    telegram_id:user.id,
    admin:role!=="user",
    owner:role==="owner"
  });
  return {
    token,role,banned,
    user:{id:user.id,first_name:user.first_name||"User",username:user.username||"",photo_url:user.photo_url||""}
  };
});

exports.getPublicState = onCall(async ()=>{
  await ensureDefaults();
  const [settings,plansSnap]=await Promise.all([getSettings(),db.collection("vipPlans").where("active","==",true).get()]);
  return {settings,plans:plansSnap.docs.map(docData)};
});

exports.getBootstrap = onCall(async req=>{
  const userId=requireAuth(req);
  await ensureDefaults();
  const [userSnap,settings,security,plansSnap,vipsSnap,txSnap,refSnap,depSnap,wdSnap]=await Promise.all([
    db.doc("users/"+userId).get(),
    getSettings(),
    getSecurity(),
    db.collection("vipPlans").get(),
    db.collection("vipPurchases").where("userTelegramId","==",userId).get(),
    db.collection("transactions").where("userTelegramId","==",userId).get(),
    db.collection("referrals").where("inviterTelegramId","==",userId).get(),
    db.collection("deposits").where("userTelegramId","==",userId).get(),
    db.collection("withdrawals").where("userTelegramId","==",userId).get()
  ]);
  if(!userSnap.exists) throw new HttpsError("not-found","User not found");
  await userSnap.ref.update({lastSeen:now()});
  const role=roleFor(userId,security);
  const user=userSnap.data();
  const plans=plansSnap.docs.map(docData);
  const stakes=sortCreated(vipsSnap.docs.map(docData));
  const transactions=sortCreated(txSnap.docs.map(docData));
  const deposits=depSnap.docs.map(s=>({id:s.id,type:"deposit",...s.data(),reference:s.data().txid||"",proofUrl:s.data().proofUrl||""}));
  const withdrawals=wdSnap.docs.map(s=>({id:s.id,type:"withdraw",...s.data(),reference:s.data().destination||""}));
  const requests=sortCreated([...deposits,...withdrawals]);

  const referralDocs=refSnap.docs.map(docData);
  let referrals=referralDocs;
  if(referralDocs.length){
    const refs=referralDocs.map(r=>db.doc("users/"+r.invitedTelegramId));
    const invited=await db.getAll(...refs);
    const map=new Map(invited.filter(x=>x.exists).map(x=>[Number(x.id),x.data()]));
    referrals=referralDocs.map(r=>{
      const u=map.get(Number(r.invitedTelegramId))||{};
      return {...r,name:u.firstName||("User "+r.invitedTelegramId),username:u.username||"",joinedAt:r.createdAt||0};
    });
  }

  const base={
    role,
    user:{
      telegramId:Number(user.telegramId||userId),
      name:user.firstName||"User",
      username:user.username||"",
      photoUrl:user.photoUrl||"",
      balance:Number(user.balance||0),
      vipEarnings:Number(user.totalVipProfit||0),
      referralEarnings:Number(user.referralEarnings||0),
      totalReferrals:Number(user.totalReferrals||0),
      joinedAt:Number(user.createdAt||0),
      lastSeen:Number(user.lastSeen||0),
      banned:user.isBanned===true
    },
    settings,
    plans:plans.filter(p=>p.active===true),
    allPlans:role==="user"?undefined:plans,
    stakes,transactions,referrals,requests
  };

  if(role==="user") return base;

  const [usersSnap,allDepSnap,allWdSnap]=await Promise.all([
    db.collection("users").limit(500).get(),
    db.collection("deposits").limit(500).get(),
    db.collection("withdrawals").limit(500).get()
  ]);
  const users=usersSnap.docs.map(s=>{
    const u=s.data();
    return {
      telegramId:Number(u.telegramId||s.id),name:u.firstName||"User",username:u.username||"",
      balance:Number(u.balance||0),vipEarnings:Number(u.totalVipProfit||0),referralEarnings:Number(u.referralEarnings||0),
      joinedAt:Number(u.createdAt||0),lastSeen:Number(u.lastSeen||0),banned:u.isBanned===true
    };
  });
  const userMap=new Map(users.map(u=>[u.telegramId,u]));
  const adminDeposits=allDepSnap.docs.map(s=>{
    const d=s.data(),u=userMap.get(Number(d.userTelegramId));
    return {id:s.id,type:"deposit",...d,reference:d.txid||"",proofUrl:d.proofUrl||"",userName:u?.name||"User",username:u?.username||"",telegramId:Number(d.userTelegramId||0)};
  });
  const adminWithdrawals=allWdSnap.docs.map(s=>{
    const d=s.data(),u=userMap.get(Number(d.userTelegramId));
    return {id:s.id,type:"withdraw",...d,reference:d.destination||"",userName:u?.name||"User",username:u?.username||"",telegramId:Number(d.userTelegramId||0)};
  });
  return {...base,users,security,requests:sortCreated([...adminDeposits,...adminWithdrawals]),allPlans:plans};
});

exports.createDeposit = onCall(async req=>{
  const userId=requireAuth(req);
  await assertActiveUser(userId);
  const amount=money(req.data?.amount), method=clean(req.data?.method,60), proofUrl=clean(req.data?.proofUrl,1000), txid=clean(req.data?.txid,200);
  const cfg=await getSettings();
  const min=Number(cfg.minDeposit||100),max=Number(cfg.maxDeposit||100000);
  if(amount<min||amount>max) throw new HttpsError("invalid-argument",`Deposit must be between ${min} and ${max} ${cfg.currency||"AFN"}`);
  if(!proofUrl) throw new HttpsError("invalid-argument","Payment proof is required");
  if(!txid) throw new HttpsError("invalid-argument","Payment reference is required");
  if(!activeMethod(cfg,method,"deposit")) throw new HttpsError("invalid-argument","Payment method unavailable");
  const r=await db.collection("deposits").add({userTelegramId:userId,amount,method,proofUrl,txid,status:"pending",createdAt:now()});
  return {id:r.id};
});

exports.createWithdrawal = onCall(async req=>{
  const userId=requireAuth(req);
  await assertActiveUser(userId);
  const amount=money(req.data?.amount),method=clean(req.data?.method,60),destination=clean(req.data?.destination,300);
  const cfg=await getSettings();
  const min=Number(cfg.minWithdraw||100),max=Number(cfg.maxWithdraw||50000);
  if(amount<min||amount>max) throw new HttpsError("invalid-argument",`Withdrawal must be between ${min} and ${max} ${cfg.currency||"AFN"}`);
  if(!destination) throw new HttpsError("invalid-argument","Account / wallet details required");
  if(!activeMethod(cfg,method,"withdraw")) throw new HttpsError("invalid-argument","Withdrawal method unavailable");
  const uref=db.doc("users/"+userId),wref=db.collection("withdrawals").doc();
  await db.runTransaction(async tx=>{
    const us=await tx.get(uref);
    if(!us.exists) throw new HttpsError("not-found","User not found");
    if(us.data().isBanned===true) throw new HttpsError("permission-denied","Account restricted");
    const balance=Number(us.data().balance||0);
    if(balance<amount) throw new HttpsError("failed-precondition","Insufficient balance");
    tx.update(uref,{balance:money(balance-amount)});
    tx.set(wref,{userTelegramId:userId,amount,method,destination,status:"pending",reserved:true,createdAt:now()});
  });
  return {id:wref.id};
});

exports.buyVip = onCall(async req=>{
  const userId=requireAuth(req);
  await assertActiveUser(userId);
  const planId=clean(req.data?.planId,120);
  if(!planId) throw new HttpsError("invalid-argument","Plan missing");
  const uref=db.doc("users/"+userId),pref=db.doc("vipPlans/"+planId),purchase=db.collection("vipPurchases").doc();
  await db.runTransaction(async tx=>{
    const [u,p,cfgSnap]=await Promise.all([tx.get(uref),tx.get(pref),tx.get(db.doc("publicConfig/app"))]);
    if(!u.exists||!p.exists||p.data().active!==true) throw new HttpsError("not-found","Package unavailable");
    if(u.data().isBanned===true) throw new HttpsError("permission-denied","Account restricted");
    const price=money(p.data().price),balance=Number(u.data().balance||0);
    if(balance<price) throw new HttpsError("failed-precondition","Insufficient balance");
    const ts=now(),days=Math.max(1,Number(p.data().durationDays||0)),daily=money(p.data().dailyReward||0);
    const cfg=cfgSnap.exists?cfgSnap.data():DEFAULT_SETTINGS;
    const refId=Number(u.data().referredBy||0),percent=Math.max(0,Math.min(100,Number(cfg.referralPercent||0)));
    let inviterRef=null,inviterSnap=null,referralRef=null,referralSnap=null;
    if(refId&&percent>0){
      inviterRef=db.doc("users/"+refId);
      referralRef=db.doc("referrals/"+refId+"_"+userId);
      [inviterSnap,referralSnap]=await Promise.all([tx.get(inviterRef),tx.get(referralRef)]);
    }
    tx.update(uref,{balance:money(balance-price)});
    tx.set(purchase,{userTelegramId:userId,planId,planName:p.data().name,price,dailyReward:daily,durationDays:days,startAt:ts,endAt:ts+days*86400000,status:"active",claimedReward:0,lastClaimAt:ts});
    tx.set(db.collection("transactions").doc(),{userTelegramId:userId,type:"stake_activation",amount:-price,status:"completed",referenceId:purchase.id,createdAt:ts,note:p.data().name});
    if(inviterRef&&inviterSnap?.exists){
      const reward=money(price*percent/100);
      if(reward>0){
        tx.update(inviterRef,{balance:money(Number(inviterSnap.data().balance||0)+reward),referralEarnings:money(Number(inviterSnap.data().referralEarnings||0)+reward)});
        if(referralRef&&referralSnap?.exists) tx.update(referralRef,{status:"rewarded",reward:money(Number(referralSnap.data().reward||0)+reward),lastRewardAt:ts});
        tx.set(db.collection("transactions").doc(),{userTelegramId:refId,type:"referral_commission",amount:reward,status:"completed",referenceId:purchase.id,createdAt:ts,note:"Referral reward"});
      }
    }
  });
  return {id:purchase.id};
});

exports.claimVip = onCall(async req=>{
  const userId=requireAuth(req);
  await assertActiveUser(userId);
  const purchaseId=clean(req.data?.purchaseId,120);
  const uref=db.doc("users/"+userId),vref=db.doc("vipPurchases/"+purchaseId);
  const reward=await db.runTransaction(async tx=>{
    const [u,v]=await Promise.all([tx.get(uref),tx.get(vref)]);
    if(!u.exists||!v.exists) throw new HttpsError("not-found","Membership not found");
    const d=v.data();
    if(Number(d.userTelegramId)!==userId||d.status!=="active") throw new HttpsError("failed-precondition","Membership is not active");
    const ts=now(),effective=Math.min(ts,Number(d.endAt)),last=Number(d.lastClaimAt||d.startAt),days=Math.floor((effective-last)/86400000);
    if(days<1) throw new HttpsError("failed-precondition","No reward available yet");
    const amount=money(days*Number(d.dailyReward||0)),balance=Number(u.data().balance||0);
    tx.update(uref,{balance:money(balance+amount),totalVipProfit:money(Number(u.data().totalVipProfit||0)+amount)});
    tx.update(vref,{claimedReward:money(Number(d.claimedReward||0)+amount),lastClaimAt:last+days*86400000,status:ts>=Number(d.endAt)?"completed":"active"});
    tx.set(db.collection("transactions").doc(),{userTelegramId:userId,type:"vip_reward",amount,status:"completed",referenceId:purchaseId,createdAt:ts,note:d.planName||"VIP reward"});
    return amount;
  });
  return {reward};
});

exports.adminSaveSettings = onCall(async req=>{
  await requireAdmin(req);
  const d=req.data||{};
  const methods=Array.isArray(d.paymentMethods)?d.paymentMethods.slice(0,20).map((m,i)=>({
    id:clean(m.id,100)||("method-"+i),
    name:clean(m.name,60),
    number:clean(m.number,150),
    details:clean(m.details,500),
    active:m.active!==false,
    kind:["deposit","withdraw","both"].includes(m.kind)?m.kind:"both"
  })).filter(m=>m.name):[];
  const channels=Array.isArray(d.channels)?d.channels.slice(0,2).map(x=>({name:clean(x.name,80),url:clean(x.url,300)})).filter(x=>x.name&&x.url):[];
  const payload={
    currency:clean(d.currency,10)||"AFN",currencySymbol:clean(d.currencySymbol,5)||"؋",
    minDeposit:Math.max(0,Number(d.minDeposit||0)),maxDeposit:Math.max(0,Number(d.maxDeposit||0)),
    minWithdraw:Math.max(0,Number(d.minWithdraw||0)),maxWithdraw:Math.max(0,Number(d.maxWithdraw||0)),
    referralPercent:Math.max(0,Math.min(100,Number(d.referralPercent||0))),
    announcement:clean(d.announcement,500),paymentMethods:methods,channels,botUsername:"Afglionbot",updatedAt:now()
  };
  if(payload.maxDeposit&&payload.minDeposit>payload.maxDeposit) throw new HttpsError("invalid-argument","Deposit minimum cannot exceed maximum");
  if(payload.maxWithdraw&&payload.minWithdraw>payload.maxWithdraw) throw new HttpsError("invalid-argument","Withdrawal minimum cannot exceed maximum");
  await db.doc("publicConfig/app").set(payload,{merge:true});
  return {ok:true};
});

exports.adminCreatePlan = onCall(async req=>{
  const {id}=await requireAdmin(req);
  const d=req.data||{},name=clean(d.name,100),price=money(d.price),dailyReward=money(d.dailyReward),durationDays=Math.floor(Number(d.durationDays||0));
  if(!name||price<=0||dailyReward<0||durationDays<=0) throw new HttpsError("invalid-argument","Complete all package fields");
  const r=await db.collection("vipPlans").add({name,price,dailyReward,durationDays,badge:clean(d.badge,30)||"VIP",active:true,createdBy:id,createdAt:now()});
  return {id:r.id};
});
exports.adminTogglePlan = onCall(async req=>{
  await requireAdmin(req);
  const id=clean(req.data?.id,120); if(!id) throw new HttpsError("invalid-argument","Plan missing");
  await db.doc("vipPlans/"+id).update({active:req.data?.active===true,updatedAt:now()});
  return {ok:true};
});
exports.adminDeletePlan = onCall(async req=>{
  await requireAdmin(req);
  const id=clean(req.data?.id,120); if(!id) throw new HttpsError("invalid-argument","Plan missing");
  await db.doc("vipPlans/"+id).delete();
  return {ok:true};
});

exports.adminReviewRequest = onCall(async req=>{
  const {id:adminId}=await requireAdmin(req);
  const id=clean(req.data?.id,120),type=clean(req.data?.type,20),approve=req.data?.approve===true;
  if(!id||!["deposit","withdraw"].includes(type)) throw new HttpsError("invalid-argument","Invalid request");
  const coll=type==="deposit"?"deposits":"withdrawals",rref=db.doc(coll+"/"+id);
  await db.runTransaction(async tx=>{
    const rs=await tx.get(rref);
    if(!rs.exists||rs.data().status!=="pending") throw new HttpsError("failed-precondition","Request already processed");
    const d=rs.data(),uref=db.doc("users/"+d.userTelegramId),us=await tx.get(uref);
    if(!us.exists) throw new HttpsError("not-found","User missing");
    if(type==="deposit"&&approve){
      tx.update(uref,{balance:money(Number(us.data().balance||0)+Number(d.amount||0))});
      tx.set(db.collection("transactions").doc(),{userTelegramId:d.userTelegramId,type:"deposit",amount:Number(d.amount||0),status:"completed",referenceId:id,createdAt:now(),note:d.method||""});
    }
    if(type==="withdraw"&&!approve){
      tx.update(uref,{balance:money(Number(us.data().balance||0)+Number(d.amount||0))});
      tx.set(db.collection("transactions").doc(),{userTelegramId:d.userTelegramId,type:"withdrawal_refund",amount:Number(d.amount||0),status:"refunded",referenceId:id,createdAt:now(),note:d.method||""});
    }
    if(type==="withdraw"&&approve){
      tx.set(db.collection("transactions").doc(),{userTelegramId:d.userTelegramId,type:"withdrawal",amount:-Number(d.amount||0),status:"completed",referenceId:id,createdAt:now(),note:d.method||""});
    }
    tx.update(rref,{status:approve?"approved":"rejected",reviewedBy:adminId,reviewedAt:now()});
  });
  return {ok:true};
});

exports.adminAdjustBalance = onCall(async req=>{
  const {id:adminId}=await requireAdmin(req);
  const targetId=Number(req.data?.telegramId||0),delta=money(req.data?.delta);
  if(!targetId||!delta) throw new HttpsError("invalid-argument","User and amount required");
  const uref=db.doc("users/"+targetId);
  await db.runTransaction(async tx=>{
    const us=await tx.get(uref); if(!us.exists) throw new HttpsError("not-found","User not found");
    const before=Number(us.data().balance||0),after=money(before+delta);
    if(after<0) throw new HttpsError("failed-precondition","Balance cannot go below zero");
    tx.update(uref,{balance:after});
    tx.set(db.collection("transactions").doc(),{userTelegramId:targetId,type:delta>0?"admin_credit":"admin_debit",amount:delta,status:"completed",createdAt:now(),note:"Admin "+adminId});
  });
  return {ok:true};
});

exports.adminSetBan = onCall(async req=>{
  await requireAdmin(req);
  const targetId=Number(req.data?.telegramId||0),banned=req.data?.banned===true;
  const security=await getSecurity();
  if(!targetId) throw new HttpsError("invalid-argument","User required");
  if(targetId===security.ownerId) throw new HttpsError("failed-precondition","Owner cannot be banned");
  await db.doc("users/"+targetId).update({isBanned:banned,banUpdatedAt:now()});
  return {ok:true};
});

exports.ownerAddAdmin = onCall(async req=>{
  const {security}=await requireOwner(req);
  const targetId=Number(req.data?.telegramId||0);
  if(!targetId) throw new HttpsError("invalid-argument","Telegram ID required");
  if(targetId===security.ownerId) throw new HttpsError("failed-precondition","User is already owner");
  const ids=Array.from(new Set([...security.adminIds,targetId]));
  await db.doc("system/security").set({ownerId:security.ownerId,adminIds:ids,updatedAt:now()},{merge:true});
  const ref=db.doc("users/"+targetId),snap=await ref.get();
  if(!snap.exists) await ref.set({telegramId:targetId,firstName:"Admin User",username:"",photoUrl:"",balance:0,totalVipProfit:0,referralEarnings:0,totalReferrals:0,referredBy:null,isBanned:false,createdAt:now(),lastSeen:0});
  return {ok:true};
});
exports.ownerRemoveAdmin = onCall(async req=>{
  const {security}=await requireOwner(req);
  const targetId=Number(req.data?.telegramId||0);
  await db.doc("system/security").set({ownerId:security.ownerId,adminIds:security.adminIds.filter(x=>x!==targetId),updatedAt:now()},{merge:true});
  return {ok:true};
});
exports.ownerTransfer = onCall(async req=>{
  const {id:oldOwner,security}=await requireOwner(req);
  const targetId=Number(req.data?.telegramId||0);
  if(!targetId||targetId===oldOwner) throw new HttpsError("invalid-argument","Choose a different valid Telegram ID");
  const targetRef=db.doc("users/"+targetId),target=await targetRef.get();
  if(!target.exists) await targetRef.set({telegramId:targetId,firstName:"New Owner",username:"",photoUrl:"",balance:0,totalVipProfit:0,referralEarnings:0,totalReferrals:0,referredBy:null,isBanned:false,createdAt:now(),lastSeen:0});
  const admins=Array.from(new Set([...security.adminIds.filter(x=>x!==targetId),oldOwner]));
  await db.doc("system/security").set({ownerId:targetId,adminIds:admins,updatedAt:now()});
  return {ok:true};
});
