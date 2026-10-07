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
    if(!us.exists){
      tx.set(userRef,{telegramId:user.id,firstName:user.first_name||"User",username:user.username||"",photoUrl:user.photo_url||"",balance:0,totalVipProfit:0,referralEarnings:0,totalReferrals:0,referredBy:referredBy&&referredBy!==user.id?referredBy:null,isBanned:false,isAdmin:user.id===ADMIN_TELEGRAM_ID,createdAt:Date.now()});
      if(referredBy && referredBy!==user.id){
        const rr=db.doc("referrals/"+referredBy+"_"+user.id);
        const rs=await tx.get(rr);
        if(!rs.exists){
          tx.set(rr,{inviterTelegramId:referredBy,invitedTelegramId:user.id,status:"joined",reward:0,createdAt:Date.now()});
          const inviter=db.doc("users/"+referredBy), inv=await tx.get(inviter);
          if(inv.exists) tx.update(inviter,{totalReferrals:Number(inv.data().totalReferrals||0)+1});
        }
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
    tx.update(uref,{balance:money(balance-price)});
    tx.set(purchase,{userTelegramId:userId,planId,planName:p.data().name,price,dailyReward:daily,durationDays:days,startAt:now,endAt:now+days*86400000,status:"active",claimedReward:0,lastClaimAt:now});
    tx.set(tr,{userTelegramId:userId,type:"vip_purchase",amount:-price,status:"completed",referenceId:purchase.id,createdAt:now});
    const refId=Number(u.data().referredBy||0), percent=Math.max(0,Number(cfgSnap.exists?cfgSnap.data().referralPercent||0:0));
    if(refId && percent>0){
      const inviter=db.doc("users/"+refId), inv=await tx.get(inviter);
      if(inv.exists){
        const reward=money(price*percent/100);
        if(reward>0){
          tx.update(inviter,{balance:money(Number(inv.data().balance||0)+reward),referralEarnings:money(Number(inv.data().referralEarnings||0)+reward)});
          const rr=db.doc("referrals/"+refId+"_"+userId), rs=await tx.get(rr);
          if(rs.exists) tx.update(rr,{status:"rewarded",reward:money(Number(rs.data().reward||0)+reward),lastRewardAt:now});
          tx.set(db.collection("transactions").doc(),{userTelegramId:refId,type:"referral_commission",amount:reward,status:"completed",referenceId:purchase.id,createdAt:now});
        }
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
