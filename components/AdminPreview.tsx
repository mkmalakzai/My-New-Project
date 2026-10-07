"use client";

import { Crown, Users, WalletCards, ArrowDownToLine, ArrowUpFromLine, Settings } from "lucide-react";

export default function AdminPreview() {
  return <div className="admin-page">
    <div className="page-title"><div><small>AFGlion Control Center</small><h1>Admin Panel 🦁</h1></div></div>
    <div className="admin-stats">
      <AdminStat label="Users" value="0" icon={<Users size={18}/>}/>
      <AdminStat label="Active VIP" value="0" icon={<Crown size={18}/>}/>
      <AdminStat label="Deposits" value="0" icon={<ArrowDownToLine size={18}/>}/>
      <AdminStat label="Withdrawals" value="0" icon={<ArrowUpFromLine size={18}/>}/>
    </div>
    <div className="admin-menu">
      <AdminRow icon={<Users/>} title="Users" text="Balances, status, ban and account details"/>
      <AdminRow icon={<Crown/>} title="VIP Packages" text="Create, edit and disable packages"/>
      <AdminRow icon={<WalletCards/>} title="Transactions" text="Review wallet activity"/>
      <AdminRow icon={<Settings/>} title="App Settings" text="Payment methods and referral settings"/>
    </div>
    <div className="admin-lock">Admin actions activate only after verified Telegram admin identity is connected.</div>
  </div>
}

function AdminStat({label,value,icon}:{label:string;value:string;icon:React.ReactNode}) {
 return <div><span>{icon}{label}</span><b>{value}</b></div>
}
function AdminRow({icon,title,text}:{icon:React.ReactNode;title:string;text:string}) {
 return <button><span>{icon}</span><div><b>{title}</b><small>{text}</small></div><i>›</i></button>
}
