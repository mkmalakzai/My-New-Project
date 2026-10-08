import {httpsCallable} from "firebase/functions";
import {getDownloadURL, ref as storageRef, uploadBytes} from "firebase/storage";
import {functions,storage} from "./firebase";

async function call(name:string,data:any={}){
  const fn=httpsCallable(functions,name);
  const res:any=await fn(data);
  return res.data;
}

export const getPublicState=()=>call("getPublicState");
export const getBootstrap=()=>call("getBootstrap");

export async function uploadProof(userId:number,file:File){
  const safe=file.name.replace(/[^a-zA-Z0-9._-]/g,"_");
  const r=storageRef(storage,`deposit-proofs/${userId}/${Date.now()}-${safe}`);
  await uploadBytes(r,file,{contentType:file.type});
  return getDownloadURL(r);
}

export const createDepositBackend=(data:{amount:number;method:string;proofUrl:string;txid:string})=>call("createDeposit",data);
export const createWithdrawalBackend=(data:{amount:number;method:string;destination:string})=>call("createWithdrawal",data);
export const buyPlanBackend=(planId:string)=>call("buyVip",{planId});
export const claimPlanBackend=(purchaseId:string)=>call("claimVip",{purchaseId});

export const adminSaveSettingsBackend=(data:any)=>call("adminSaveSettings",data);
export const adminCreatePlanBackend=(data:any)=>call("adminCreatePlan",data);
export const adminTogglePlanBackend=(id:string,active:boolean)=>call("adminTogglePlan",{id,active});
export const adminDeletePlanBackend=(id:string)=>call("adminDeletePlan",{id});
export const adminReviewRequestBackend=(id:string,type:"deposit"|"withdraw",approve:boolean)=>call("adminReviewRequest",{id,type,approve});
export const adminAdjustBalanceBackend=(telegramId:number,delta:number)=>call("adminAdjustBalance",{telegramId,delta});
export const adminSetBanBackend=(telegramId:number,banned:boolean)=>call("adminSetBan",{telegramId,banned});
export const ownerAddAdminBackend=(telegramId:number)=>call("ownerAddAdmin",{telegramId});
export const ownerRemoveAdminBackend=(telegramId:number)=>call("ownerRemoveAdmin",{telegramId});
export const ownerTransferBackend=(telegramId:number)=>call("ownerTransfer",{telegramId});
