import {
  addDoc, collection, doc, getDoc, getDocs, limit, orderBy, query,
  runTransaction, setDoc, updateDoc, where
} from "firebase/firestore";
import { db, storage, functions } from "./firebase";
import { getDownloadURL, ref as storageRef, uploadBytes } from "firebase/storage";
import { httpsCallable } from "firebase/functions";
import type { DepositRequestDoc, TransactionDoc, UserDoc, VipPlanDoc, VipPurchaseDoc, WithdrawRequestDoc } from "./models";

export const money = (n:number) => Math.round((Number(n) || 0) * 100) / 100;

export async function ensureUser(tg:{id:number;first_name:string;username?:string;photo_url?:string}, ref?:number|null) {
  const userRef=doc(db,"users",String(tg.id));
  const snap=await getDoc(userRef);
  if(!snap.exists()){
    const data:UserDoc={
      telegramId:tg.id,firstName:tg.first_name,username:tg.username||"",photoUrl:tg.photo_url||"",
      balance:0,totalVipProfit:0,referralEarnings:0,totalReferrals:0,referredBy:ref||null,
      isBanned:false,isAdmin:false,createdAt:Date.now()
    };
    await setDoc(userRef,data);
    if(ref && ref!==tg.id){
      await setDoc(doc(db,"referrals",`${ref}_${tg.id}`),{
        inviterTelegramId:ref,invitedTelegramId:tg.id,status:"joined",reward:0,createdAt:Date.now()
      });
    }
    return data;
  }
  const data=snap.data() as UserDoc;
  if(data.firstName!==tg.first_name || data.username!==(tg.username||"")){
    await updateDoc(userRef,{firstName:tg.first_name,username:tg.username||"",photoUrl:tg.photo_url||""});
  }
  return {...data,firstName:tg.first_name,username:tg.username||""};
}

export async function getUser(id:number){const s=await getDoc(doc(db,"users",String(id)));return s.exists()?s.data() as UserDoc:null;}
export async function getActiveVipPlans(){const s=await getDocs(query(collection(db,"vipPlans"),where("active","==",true)));return s.docs.map(d=>({id:d.id,...d.data()} as VipPlanDoc));}
export async function getAllVipPlans(){const s=await getDocs(collection(db,"vipPlans"));return s.docs.map(d=>({id:d.id,...d.data()} as VipPlanDoc));}
export async function getPublicSettings(){const s=await getDoc(doc(db,"publicConfig","app"));return s.exists()?s.data():null;}
export async function savePublicSettings(settings:any){return setDoc(doc(db,"publicConfig","app"),settings,{merge:true});}
export async function uploadDepositProof(userId:number,file:File){const safe=file.name.replace(/[^a-zA-Z0-9._-]/g,"_");const r=storageRef(storage,`deposit-proofs/${userId}/${Date.now()}-${safe}`);await uploadBytes(r,file,{contentType:file.type});return getDownloadURL(r);}
export async function getTransactions(id:number){const s=await getDocs(query(collection(db,"transactions"),where("userTelegramId","==",id),limit(50)));return s.docs.map(d=>({id:d.id,...d.data()} as TransactionDoc)).sort((a,b)=>b.createdAt-a.createdAt);}
export async function getMyVip(id:number){const s=await getDocs(query(collection(db,"vipPurchases"),where("userTelegramId","==",id)));return s.docs.map(d=>({id:d.id,...d.data()} as VipPurchaseDoc)).sort((a,b)=>b.startAt-a.startAt);}
export async function getReferrals(id:number){const s=await getDocs(query(collection(db,"referrals"),where("inviterTelegramId","==",id)));return s.docs.map(d=>({id:d.id,...d.data()}));}

export async function createDeposit(data:Omit<DepositRequestDoc,"id"|"status"|"createdAt">){
  const call=httpsCallable(functions,"createDeposit");
  const res:any=await call(data);
  return res.data;
}
export async function createWithdrawal(data:Omit<WithdrawRequestDoc,"id"|"status"|"createdAt">){
  const call=httpsCallable(functions,"createWithdrawal");
  const res:any=await call(data);
  return res.data;
}
export async function buyVip(userId:number,plan:VipPlanDoc){
  if(!plan.id) throw new Error("Plan missing");
  const call=httpsCallable(functions,"buyVip");
  const res:any=await call({planId:plan.id});
  return res.data;
}
export async function claimVip(userId:number,purchaseId:string){
  const call=httpsCallable(functions,"claimVip");
  const res:any=await call({purchaseId});
  return Number(res.data?.reward||0);
}

export async function adminCreatePlan(adminId:number,p:Omit<VipPlanDoc,"id"|"createdAt">){return addDoc(collection(db,"vipPlans"),{...p,createdBy:adminId,createdAt:Date.now()});}
export async function adminTogglePlan(id:string,active:boolean){return updateDoc(doc(db,"vipPlans",id),{active});}
export async function adminList(collectionName:string){const s=await getDocs(query(collection(db,collectionName),orderBy("createdAt","desc"),limit(100)));return s.docs.map(d=>({id:d.id,...d.data()}));}

export async function adminApproveDeposit(adminId:number,id:string,approve:boolean){
  const r=doc(db,"deposits",id), tr=doc(collection(db,"transactions"));
  await runTransaction(db,async tx=>{
    const s=await tx.get(r); if(!s.exists()||s.data().status!=="pending") throw new Error("Already processed");
    const d=s.data(); const u=doc(db,"users",String(d.userTelegramId)); const us=await tx.get(u); if(!us.exists()) throw new Error("User missing");
    if(approve){tx.update(u,{balance:money(Number(us.data().balance||0)+Number(d.amount||0))});tx.set(tr,{userTelegramId:d.userTelegramId,type:"deposit",amount:Number(d.amount),status:"completed",referenceId:id,createdAt:Date.now()});}
    tx.update(r,{status:approve?"approved":"rejected",reviewedBy:adminId,reviewedAt:Date.now()});
  });
}
export async function adminApproveWithdrawal(adminId:number,id:string,approve:boolean){
  const r=doc(db,"withdrawals",id), tr=doc(collection(db,"transactions"));
  await runTransaction(db,async tx=>{
    const s=await tx.get(r); if(!s.exists()||s.data().status!=="pending") throw new Error("Already processed");
    const d=s.data(); const u=doc(db,"users",String(d.userTelegramId)); const us=await tx.get(u); if(!us.exists()) throw new Error("User missing");
    if(!approve) tx.update(u,{balance:money(Number(us.data().balance||0)+Number(d.amount||0))});
    tx.update(r,{status:approve?"approved":"rejected",reviewedBy:adminId,reviewedAt:Date.now()});
    tx.set(tr,{userTelegramId:d.userTelegramId,type:"withdrawal",amount:approve?-Number(d.amount):Number(d.amount),status:approve?"completed":"refunded",referenceId:id,createdAt:Date.now()});
  });
}
