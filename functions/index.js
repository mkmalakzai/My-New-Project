const {onCall, HttpsError} = require("firebase-functions/v2/https");
const {defineSecret} = require("firebase-functions/params");
const admin = require("firebase-admin");
const crypto = require("crypto");

admin.initializeApp();
const db = admin.firestore();
const BOT_TOKEN = defineSecret("TELEGRAM_BOT_TOKEN");
const ADMIN_TELEGRAM_ID = 6589090462;
const money = n => Math.round((Number(n)||0)*100)/100;

function verifyTelegram(initData, botToken){
  if(!initData) throw new HttpsError("unauthenticated","Telegram login required");
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if(!hash) throw new HttpsError("unauthenticated","Invalid Telegram data");
  params.delete("hash");
  const check = [...params.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>k+"="+v).join("\n");
  const secret = crypto.createHmac("sha256","WebAppData").update(botToken).digest();
  const calc = crypto.createHmac("sha256",secret).update(check).digest("hex");
  if(calc.length!==hash.length || !crypto.timingSafeEqual(Buffer.from(calc),Buffer.from(hash))) throw new HttpsError("unauthenticated","Telegram verification failed");
  const authDate = Number(params.get("auth_date")||0);
  if(!authDate || Math.abs(Date.now()/1000-authDate)>86400) throw new HttpsError("unauthenticated","Telegram session expired");
  let user;
  try{user=JSON.parse(params.get("user")||"{}")}catch{}
  if(!user?.id) throw new HttpsError("unauthenticated","Telegram user missing");
  return {user,params};
}
function requireAuth(req){
  const id = Number(req.auth?.token?.telegram_id||0);
  if(!req.auth || !id) throw new HttpsError("unauthenticated","Sign in through Telegram first");
  return id;
}
function requireAdmin(req){
  const id=requireAuth(req);
  if(req.auth?.token?.admin!==true && id!==ADMIN_TELEGRAM_ID) throw new HttpsError("permission-denied","Admin access required");
  return id;
}
async function settings(){
  const s=await db.doc("publicConfig/app").get();
  return s.exists?s.data():{};
}

exports.authenticateTelegram = onCall({secrets:[BOT_TOKEN]}, async req=>{
  const {user,params}=verifyTelegram(req.data?.initData,BOT_TOKEN.value());
  const uid=String(user.id), userRef=db.doc("users/"+uid);
  const refRaw=String(req.data?.ref||params.get("start_param")||"");
  const referredBy=refRaw.startsWith("ref_")?Number(refRaw.slice(4)):Number(refRaw)||null;
  await db.runTransaction(async tx=>{
    const us=await tx.get(userRef);
    let rr=null,rs=null,inviter=null,inv=null;
    if(!us.exists && referredBy && referredBy!==user.id){
      rr=db.doc("referrals/"+referredBy+"_"+user.id);
      inviter=db.doc("users/"+referredBy);
      [rs,inv]=await Promise.all([tx.get(rr),tx.get(inviter)]);
    }
    if(!us.exists){
      tx.set(userRef,{telegramId:user.id,firstName:user.first_name||"User",username:user.username||"",photoUrl:user.photo_url||"",balance:0,totalVipProfit:0,referralEarnings:0,totalReferrals:0,referredBy:referredBy&&referredBy!==user.id?referredBy:null,isBanned:false,isAdmin:user.id===ADMIN_TELEGRAM_ID,createdAt:Date.now()});
      if(rr && rs && !rs.exists){
        tx.set(rr,{inviterTelegramId:referredBy,invitedTelegramId:user.id,status:"joined",reward:0,createdAt:Date.now()});
        if(inviter && inv?.exists) tx.update(inviter,{totalReferrals:Number(inv.data().totalReferrals||0)+1});
      }
    }else{
      tx.update(userRef,{firstName:user.first_name||"User",username:user.username||"",photoUrl:user.photo_url||"",isAdmin:user.id===ADMIN_TELEGRAM_ID});
    }
  });
  const token=await admin.auth().createCustomToken(uid,{telegram_id:user.id,admin:user.id===ADMIN_TELEGRAM_ID});
  return {token,user:{id:user.id,first_name:user.first_name||"User",username:user.username||"",photo_url:user.photo_url||""}};
});

exports.createDeposit = onCall(async req=>{
  const userId=requireAuth(req), amount=money(req.data?.amount), method=String(req.data?.method||""), proofUrl=String(req.data?.proofUrl||""), txid=String(req.data?.txid||"");
  const cfg=await settings(), min=Number(cfg.minDeposit||100), max=Number(cfg.maxDeposit||1000000);
  if(amount<min||amount>max) throw new HttpsError("invalid-argument",`Deposit must be between ${min} and ${max} ${cfg.currency||"AFN"}`);
  if(!proofUrl) throw new HttpsError("invalid-argument","Payment proof is required");
  const allowed=(cfg.depositMethods||[]).filter(x=>x.active!==false).map(x=>x.name);
  if(allowed.length && !allowed.includes(method)) throw new HttpsError("invalid-argument","Payment method unavailable");
  const r=await db.collection("deposits").add({userTelegramId:userId,amount,method,proofUrl,txid,status:"pending",createdAt:Date.now()});
  return {id:r.id};
});

exports.createWithdrawal = onCall(async req=>{
  const userId=requireAuth(req), amount=money(req.data?.amount), method=String(req.data?.method||""), destination=String(req.data?.destination||"");
  const cfg=await settings(), min=Number(cfg.minWithdraw||100), max=Number(cfg.maxWithdraw||50000);
  if(amount<min||amount>max) throw new HttpsError("invalid-argument",`Withdrawal must be between ${min} and ${max} ${cfg.currency||"AFN"}`);
  if(!destination) throw new HttpsError("invalid-argument","Account / wallet details required");
  const allowed=(cfg.withdrawMethods||[]).filter(x=>x.active!==false).map(x=>x.name);
  if(allowed.length && !allowed.includes(method)) throw new HttpsError("invalid-argument","Withdrawal method unavailable");
  const uref=db.doc("users/"+userId), wref=db.collection("withdrawals").doc();
  await db.runTransaction(async tx=>{
    const us=await tx.get(uref); if(!us.exists) throw new HttpsError("not-found","User not found");
    const bal=Number(us.data().balance||0); if(bal<amount) throw new HttpsError("failed-precondition","Insufficient balance");
    tx.update(uref,{balance:money(bal-amount)});
    tx.set(wref,{userTelegramId:userId,amount,method,destination,status:"pending",createdAt:Date.now(),reserved:true});
  });
  return {id:wref.id};
});

exports.buyVip = onCall(async req=>{
  const userId=requireAuth(req), planId=String(req.data?.planId||"");
  if(!planId) throw new HttpsError("invalid-argument","Plan missing");
  const uref=db.doc("users/"+userId), pref=db.doc("vipPlans/"+planId), purchase=db.collection("vipPurchases").doc(), tr=db.collection("transactions").doc();
  await db.runTransaction(async tx=>{
    const [u,p,cfgSnap]=await Promise.all([tx.get(uref),tx.get(pref),tx.get(db.doc("publicConfig/app"))]);
    if(!u.exists||!p.exists||p.data().active!==true) throw new HttpsError("not-found","Package unavailable");
    const price=money(p.data().price), balance=Number(u.data().balance||0); if(balance<price) throw new HttpsError("failed-precondition","Insufficient balance");
    const now=Date.now(),days=Number(p.data().durationDays||0),daily=money(p.data().dailyReward||0);
    const refId=Number(u.data().referredBy||0), percent=Math.max(0,Math.min(100,Number(cfgSnap.exists?cfgSnap.data().referralPercent||0:0)));
    let inviter=null,inv=null,rr=null,rs=null;
    if(refId && percent>0){
      inviter=db.doc("users/"+refId);
      rr=db.doc("referrals/"+refId+"_"+userId);
      [inv,rs]=await Promise.all([tx.get(inviter),tx.get(rr)]);
    }
    tx.update(uref,{balance:money(balance-price)});
    tx.set(purchase,{userTelegramId:userId,planId,planName:p.data().name,price,dailyReward:daily,durationDays:days,startAt:now,endAt:now+days*86400000,status:"active",claimedReward:0,lastClaimAt:now});
    tx.set(tr,{userTelegramId:userId,type:"vip_purchase",amount:-price,status:"completed",referenceId:purchase.id,createdAt:now});
    if(inviter && inv?.exists){
      const reward=money(price*percent/100);
      if(reward>0){
        tx.update(inviter,{balance:money(Number(inv.data().balance||0)+reward),referralEarnings:money(Number(inv.data().referralEarnings||0)+reward)});
        if(rr && rs?.exists) tx.update(rr,{status:"rewarded",reward:money(Number(rs.data().reward||0)+reward),lastRewardAt:now});
        tx.set(db.collection("transactions").doc(),{userTelegramId:refId,type:"referral_commission",amount:reward,status:"completed",referenceId:purchase.id,createdAt:now});
      }
    }
  });
  return {id:purchase.id};
});

exports.claimVip = onCall(async req=>{
  const userId=requireAuth(req), purchaseId=String(req.data?.purchaseId||"");
  const uref=db.doc("users/"+userId), vref=db.doc("vipPurchases/"+purchaseId), tr=db.collection("transactions").doc();
  const reward=await db.runTransaction(async tx=>{
    const [u,v]=await Promise.all([tx.get(uref),tx.get(vref)]); if(!u.exists||!v.exists) throw new HttpsError("not-found","Membership not found");
    const d=v.data(); if(Number(d.userTelegramId)!==userId||d.status!=="active") throw new HttpsError("failed-precondition","Membership is not active");
    const now=Date.now(),effective=Math.min(now,Number(d.endAt)),last=Number(d.lastClaimAt||d.startAt),days=Math.floor((effective-last)/86400000);
    if(days<1) throw new HttpsError("failed-precondition","No reward available yet");
    const r=money(days*Number(d.dailyReward||0)),balance=Number(u.data().balance||0);
    tx.update(uref,{balance:money(balance+r),totalVipProfit:money(Number(u.data().totalVipProfit||0)+r)});
    tx.update(vref,{claimedReward:money(Number(d.claimedReward||0)+r),lastClaimAt:last+days*86400000,status:now>=Number(d.endAt)?"completed":"active"});
    tx.set(tr,{userTelegramId:userId,type:"vip_profit",amount:r,status:"completed",referenceId:purchaseId,createdAt:now});
    return r;
  });
  return {reward};
});


exports.adminSaveSettings = onCall(async req=>{
  requireAdmin(req);
  const d=req.data||{};
  const methods=x=>Array.isArray(x)?x.slice(0,20).map((m,i)=>({id:String(m.id||("method-"+i)),name:String(m.name||"").slice(0,60),details:String(m.details||"").slice(0,500),active:m.active!==false})).filter(m=>m.name):[];
  const channels=Array.isArray(d.channels)?d.channels.slice(0,2).map(x=>({name:String(x.name||"").slice(0,80),url:String(x.url||"").slice(0,300)})).filter(x=>x.name&&x.url):[];
  const payload={
    currency:String(d.currency||"AFN").slice(0,10),
    currencySymbol:String(d.currencySymbol||"؋").slice(0,5),
    minDeposit:Math.max(0,Number(d.minDeposit||0)),
    maxDeposit:Math.max(0,Number(d.maxDeposit||0)),
    minWithdraw:Math.max(0,Number(d.minWithdraw||0)),
    maxWithdraw:Math.max(0,Number(d.maxWithdraw||0)),
    referralPercent:Math.max(0,Math.min(100,Number(d.referralPercent||0))),
    announcement:String(d.announcement||"").slice(0,500),
    depositMethods:methods(d.depositMethods),
    withdrawMethods:methods(d.withdrawMethods),
    channels,
    botUsername:"Afglionbot",
    updatedAt:Date.now()
  };
  if(payload.maxDeposit && payload.minDeposit>payload.maxDeposit) throw new HttpsError("invalid-argument","Deposit minimum cannot exceed maximum");
  if(payload.maxWithdraw && payload.minWithdraw>payload.maxWithdraw) throw new HttpsError("invalid-argument","Withdrawal minimum cannot exceed maximum");
  await db.doc("publicConfig/app").set(payload,{merge:true});
  return {ok:true};
});

exports.adminCreatePlan = onCall(async req=>{
  const adminId=requireAdmin(req),d=req.data||{};
  const name=String(d.name||"").trim(),price=money(d.price),dailyReward=money(d.dailyReward),durationDays=Math.floor(Number(d.durationDays||0));
  if(!name||price<=0||dailyReward<0||durationDays<=0) throw new HttpsError("invalid-argument","Complete all package fields");
  const r=await db.collection("vipPlans").add({name,price,dailyReward,durationDays,badge:String(d.badge||"VIP").slice(0,30),active:true,createdBy:adminId,createdAt:Date.now()});
  return {id:r.id};
});

exports.adminTogglePlan = onCall(async req=>{
  requireAdmin(req);
  const id=String(req.data?.id||""); if(!id) throw new HttpsError("invalid-argument","Plan missing");
  await db.doc("vipPlans/"+id).update({active:req.data?.active===true});
  return {ok:true};
});

exports.adminReviewDeposit = onCall(async req=>{
  const adminId=requireAdmin(req),id=String(req.data?.id||""),approve=req.data?.approve===true;
  const r=db.doc("deposits/"+id);
  await db.runTransaction(async tx=>{
    const s=await tx.get(r); if(!s.exists||s.data().status!=="pending") throw new HttpsError("failed-precondition","Request already processed");
    const d=s.data(),u=db.doc("users/"+d.userTelegramId),us=await tx.get(u); if(!us.exists) throw new HttpsError("not-found","User missing");
    if(approve){
      tx.update(u,{balance:money(Number(us.data().balance||0)+Number(d.amount||0))});
      tx.set(db.collection("transactions").doc(),{userTelegramId:d.userTelegramId,type:"deposit",amount:Number(d.amount),status:"completed",referenceId:id,createdAt:Date.now()});
    }
    tx.update(r,{status:approve?"approved":"rejected",reviewedBy:adminId,reviewedAt:Date.now()});
  });
  return {ok:true};
});

exports.adminReviewWithdrawal = onCall(async req=>{
  const adminId=requireAdmin(req),id=String(req.data?.id||""),approve=req.data?.approve===true;
  const r=db.doc("withdrawals/"+id);
  await db.runTransaction(async tx=>{
    const s=await tx.get(r); if(!s.exists||s.data().status!=="pending") throw new HttpsError("failed-precondition","Request already processed");
    const d=s.data(),u=db.doc("users/"+d.userTelegramId),us=await tx.get(u); if(!us.exists) throw new HttpsError("not-found","User missing");
    if(!approve) tx.update(u,{balance:money(Number(us.data().balance||0)+Number(d.amount||0))});
    tx.update(r,{status:approve?"approved":"rejected",reviewedBy:adminId,reviewedAt:Date.now()});
    tx.set(db.collection("transactions").doc(),{userTelegramId:d.userTelegramId,type:"withdrawal",amount:approve?-Number(d.amount):Number(d.amount),status:approve?"completed":"refunded",referenceId:id,createdAt:Date.now()});
  });
  return {ok:true};
});
