"use client";

import { useEffect, useMemo, useState } from "react";
import { Crown, Home, Users, WalletCards, ArrowDownToLine, ArrowUpFromLine, Bell, ChevronRight, ShieldCheck } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

type Tab = "home" | "vip" | "referral" | "wallet";

declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
        initData?: string;
        initDataUnsafe?: { user?: { id?: number; first_name?: string; username?: string; photo_url?: string } };
        ready?: () => void;
        expand?: () => void;
        setHeaderColor?: (color: string) => void;
        setBackgroundColor?: (color: string) => void;
      };
    };
  }
}

const vipPlans = [
  { name: "Lion Starter", price: 25, daily: 0.35, days: 30, badge: "START" },
  { name: "Lion Pro", price: 100, daily: 1.7, days: 45, badge: "POPULAR" },
  { name: "Lion Elite", price: 300, daily: 6.2, days: 60, badge: "ELITE" },
];

export default function AFGlionApp() {
  const [tab, setTab] = useState<Tab>("home");
  const [telegramOnly, setTelegramOnly] = useState<boolean | null>(null);
  const [name, setName] = useState("Lion Member");

  useEffect(() => {
    const tg = window.Telegram?.WebApp;
    const insideTelegram = Boolean(tg?.initData);
    setTelegramOnly(insideTelegram);

    if (insideTelegram && tg) {
      tg.ready?.();
      tg.expand?.();
      tg.setHeaderColor?.("#090909");
      tg.setBackgroundColor?.("#090909");
      const user = tg.initDataUnsafe?.user;
      if (user?.first_name) setName(user.first_name);
    }
  }, []);

  const page = useMemo(() => {
    if (tab === "vip") return <VipPage />;
    if (tab === "referral") return <ReferralPage />;
    if (tab === "wallet") return <WalletPage />;
    return <Dashboard name={name} onNavigate={setTab} />;
  }, [tab, name]);

  if (telegramOnly === null) {
    return <main className="gate"><div className="lion-loader">🦁</div><p>Opening AFGlion...</p></main>;
  }

  if (!telegramOnly) {
    return (
      <main className="gate">
        <div className="gate-card">
          <div className="lion-mark">🦁</div>
          <h1>AFGlion</h1>
          <p>This app is available only inside Telegram.</p>
          <span>Open AFGlion from the official Telegram bot.</span>
        </div>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand"><div className="brand-icon">🦁</div><div><b>AFG<span>lion</span></b><small>Premium Finance</small></div></div>
        <button className="icon-button"><Bell size={20} /></button>
      </header>

      <AnimatePresence mode="wait">
        <motion.section key={tab} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: .22 }} className="page">
          {page}
        </motion.section>
      </AnimatePresence>

      <nav className="bottom-nav">
        <NavButton active={tab === "home"} label="Home" icon={<Home size={21}/>} onClick={() => setTab("home")} />
        <NavButton active={tab === "vip"} label="VIP" icon={<Crown size={21}/>} onClick={() => setTab("vip")} />
        <NavButton active={tab === "referral"} label="Referral" icon={<Users size={21}/>} onClick={() => setTab("referral")} />
        <NavButton active={tab === "wallet"} label="Wallet" icon={<WalletCards size={21}/>} onClick={() => setTab("wallet")} />
      </nav>
    </main>
  );
}

function NavButton({active,label,icon,onClick}:{active:boolean;label:string;icon:React.ReactNode;onClick:()=>void}) {
  return <button onClick={onClick} className={active ? "nav-item active" : "nav-item"}>{icon}<span>{label}</span></button>
}

function Dashboard({name,onNavigate}:{name:string;onNavigate:(tab:Tab)=>void}) {
  return <>
    <div className="hello"><div><small>Welcome back</small><h1>{name} 👋</h1></div><div className="avatar">🦁</div></div>
    <div className="balance-card">
      <div className="glow"/>
      <div className="balance-head"><span>Total Balance</span><ShieldCheck size={18}/></div>
      <h2>$0.00</h2>
      <p>Available balance</p>
      <div className="balance-actions">
        <button onClick={() => onNavigate("wallet")}><ArrowDownToLine size={17}/> Deposit</button>
        <button onClick={() => onNavigate("wallet")}><ArrowUpFromLine size={17}/> Withdraw</button>
      </div>
    </div>

    <div className="stats-grid">
      <Stat title="VIP Profit" value="$0.00" hint="Total earned" />
      <Stat title="Referral" value="$0.00" hint="Total rewards" />
    </div>

    <SectionTitle title="Active VIP" action="View plans" onClick={() => onNavigate("vip")} />
    <div className="empty-card"><Crown size={28}/><b>No active package</b><span>Choose a VIP plan to get started.</span><button onClick={() => onNavigate("vip")}>Explore VIP</button></div>

    <SectionTitle title="Recent Activity" />
    <div className="activity-card">
      <div className="activity-icon"><WalletCards size={18}/></div>
      <div><b>Wallet ready</b><span>Your AFGlion wallet is active</span></div>
      <small>Now</small>
    </div>
  </>
}

function VipPage() {
  return <>
    <div className="page-title"><div><small>Grow with AFGlion</small><h1>VIP Packages 👑</h1></div></div>
    <div className="vip-hero"><span>PREMIUM ACCESS</span><h2>Choose your Lion level</h2><p>Package terms are configured by the AFGlion admin.</p></div>
    <div className="plans">
      {vipPlans.map((p) => <div className="plan-card" key={p.name}>
        <div className="plan-top"><div><span className="pill">{p.badge}</span><h3>{p.name}</h3></div><Crown size={25}/></div>
        <div className="plan-price"><b>${p.price}</b><span>package price</span></div>
        <div className="plan-details"><div><span>Daily reward</span><b>${p.daily}</b></div><div><span>Duration</span><b>{p.days} days</b></div></div>
        <button>Activate Package <ChevronRight size={18}/></button>
      </div>)}
    </div>
  </>
}

function ReferralPage() {
  return <>
    <div className="page-title"><div><small>Invite & grow</small><h1>Referral Network 👥</h1></div></div>
    <div className="referral-card"><div className="glow"/><span>Total Referral Rewards</span><h2>$0.00</h2><p>Build your network and earn configured rewards.</p></div>
    <div className="stats-grid"><Stat title="Total Referrals" value="0" hint="All invited users"/><Stat title="Active" value="0" hint="Qualified users"/></div>
    <div className="share-card"><b>Your referral link</b><div className="link-box"><span>Available after bot setup</span><button>Copy</button></div><button className="gold-button">Invite Friends</button></div>
  </>
}

function WalletPage() {
  return <>
    <div className="page-title"><div><small>Secure money center</small><h1>My Wallet 💳</h1></div></div>
    <div className="wallet-balance"><span>Available Balance</span><h2>$0.00</h2><small>USD</small></div>
    <div className="wallet-actions-grid"><button><ArrowDownToLine size={22}/><b>Deposit</b><span>Manual funding</span></button><button><ArrowUpFromLine size={22}/><b>Withdraw</b><span>Manual request</span></button></div>
    <SectionTitle title="Transactions" />
    <div className="empty-list"><WalletCards size={28}/><b>No transactions yet</b><span>Your deposit, withdrawal and VIP activity will appear here.</span></div>
  </>
}

function Stat({title,value,hint}:{title:string;value:string;hint:string}) {
  return <div className="stat-card"><span>{title}</span><b>{value}</b><small>{hint}</small></div>
}

function SectionTitle({title,action,onClick}:{title:string;action?:string;onClick?:()=>void}) {
  return <div className="section-title"><h3>{title}</h3>{action && <button onClick={onClick}>{action}<ChevronRight size={15}/></button>}</div>
}
