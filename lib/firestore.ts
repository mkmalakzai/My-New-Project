import { collection, doc, getDoc, getDocs, query, where } from "firebase/firestore";
import { db } from "./firebase";
import type { VipPlanDoc } from "./models";

export async function getActiveVipPlans(): Promise<VipPlanDoc[]> {
  const snap = await getDocs(query(collection(db, "vipPlans"), where("active", "==", true)));
  return snap.docs.map((item) => ({ id: item.id, ...(item.data() as Omit<VipPlanDoc, "id">) }));
}

export async function getPublicSettings() {
  const snap = await getDoc(doc(db, "publicConfig", "app"));
  return snap.exists() ? snap.data() : null;
}
