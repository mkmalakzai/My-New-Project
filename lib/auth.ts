import {signInWithCustomToken} from "firebase/auth";
import {httpsCallable} from "firebase/functions";
import {auth,functions} from "./firebase";

export async function authenticateTelegram(initData:string,ref?:number|null){
  const call=httpsCallable(functions,"authenticateTelegram");
  const res:any=await call({initData,ref:ref?String(ref):""});
  const token=String(res.data?.token||"");
  if(!token) throw new Error("Authentication failed");
  await signInWithCustomToken(auth,token);
  return res.data;
}
