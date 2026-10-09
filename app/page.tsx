"use client";

import {useEffect,useState} from "react";
import {AnimatePresence,motion} from "framer-motion";
import {
  ArrowDownToLine,ArrowUpFromLine,BadgePercent,Bell,Check,ChevronRight,Copy,
  Crown,Gift,History,Home,Landmark,LockKeyhole,LogOut,Plus,Radio,RefreshCw,
  Settings,ShieldCheck,Smartphone,Sparkles,Trash2,TrendingUp,UserRound,
  Users,WalletCards,X,Zap
} from "lucide-react";
import {
  ensureRemoteUser,saveRemoteUser,loadGlobal,watchRemoteUser,watchGlobal,watchAllUsers,watchReferrals,
  saveGlobalSettings,saveGlobalPlans,saveSecurity,rewardReferral,
  updateRemoteUserBalance,updateRemoteUserBan,reviewRemoteRequest
} from "@/lib/realtime";

type Tab="home"|"stake"|"referral"|"wallet"|"admin";
type Sheet="deposit"|"withdraw"|"notifications"|"profile"|null;
type AdminSection="overview"|"users"|"plans"|"payments"|"requests"|"channels"|"team"|"settings";

type PaymentMethod={id:string;name:string;number?:string;details:string;active:boolean;kind:"deposit"|"withdraw"|"both"};
type Plan={id:string;name:string;price:number;dailyReward:number;durationDays:number;badge:string;active:boolean};
type Stake={id:string;planId:string;planName:string;price:number;dailyReward:number;durationDays:number;startedAt:number;claimed:number;status:"active"|"completed"};
type Tx={id:string;type:string;amount:number;status:string;createdAt:number;note?:string};
type RequestItem={id:string;type:"deposit"|"withdraw";amount:number;method:string;reference:string;status:"pending"|"approved"|"rejected";createdAt:number;userName?:string;username?:string;telegramId?:number};
type ReferralItem={id:string;name:string;joinedAt:number;status:"joined"|"rewarded";reward:number};
type SettingsDoc={
  currency:string;currencySymbol:string;minDeposit:number;maxDeposit:number;
  minWithdraw:number;maxWithdraw:number;referralPercent:number;announcement:string;supportUsername:string;
  channels:{name:string;url:string}[];paymentMethods:PaymentMethod[];
};
type UserRecord={telegramId:number;name:string;username:string;balance:number;vipEarnings:number;referralEarnings:number;joinedAt:number;lastSeen:number;banned:boolean};
type SecurityDoc={ownerId:number;adminIds:number[]};
type AppState={
  balance:number;vipEarnings:number;referralEarnings:number;
  plans:Plan[];stakes:Stake[];transactions:Tx[];requests:RequestItem[];
  referrals:ReferralItem[];users:UserRecord[];security:SecurityDoc;settings:SettingsDoc;
};

const OWNER_ID=6589090462;

const defaultState:AppState={
  balance:0,
  vipEarnings:0,
  referralEarnings:0,
  plans:[
    {id:"lion-start",name:"Lion Start",price:1000,dailyReward:8,durationDays:30,badge:"START",active:true},
    {id:"lion-pro",name:"Lion Pro",price:3000,dailyReward:27,durationDays:60,badge:"POPULAR",active:true},
    {id:"lion-elite",name:"Lion Elite",price:6000,dailyReward:60,durationDays:90,badge:"ELITE",active:true}
  ],
  stakes:[],
  transactions:[],
  requests:[],
  referrals:[],
  users:[{telegramId:OWNER_ID,name:"AFGlion Owner",username:"",balance:0,vipEarnings:0,referralEarnings:0,joinedAt:Date.now(),lastSeen:Date.now(),banned:false}],
  security:{ownerId:OWNER_ID,adminIds:[]},
  settings:{
    currency:"AFN",currencySymbol:"؋",
    minDeposit:100,maxDeposit:100000,
    minWithdraw:100,maxWithdraw:50000,
    referralPercent:5,
    announcement:"Welcome to AFGlion — your premium finance dashboard.",
    supportUsername:"",
    channels:[],
    paymentMethods:[
      {id:"hesab-pay",name:"HESAB PAY",number:"",details:"Add payment instructions here.",active:true,kind:"both"},
      {id:"momo",name:"MOMO",number:"",details:"Add payment instructions here.",active:true,kind:"both"}
    ]
  }
};

const cloneDefault=():AppState=>JSON.parse(JSON.stringify(defaultState));
const money=(n:number)=>Number(n||0).toLocaleString(undefined,{maximumFractionDigits:2})+" AFN";
const now=()=>Date.now();
const uid=(p:string)=>p+"-"+Date.now()+"-"+Math.random().toString(36).slice(2,7);

export default function App(){
  const [tab,setTab]=useState<Tab>("home");
  const [sheet,setSheet]=useState<Sheet>(null);
  const [adminSection,setAdminSection]=useState<AdminSection>("overview");
  const [state,setState]=useState<AppState>(cloneDefault());
  const [ready,setReady]=useState(false);
  const [toast,setToast]=useState("");
  const [tgId,setTgId]=useState(0);
  const [name,setName]=useState("AFGlion Guest");
  const [username,setUsername]=useState("");
  const [photo,setPhoto]=useState("");
  const [remoteReady,setRemoteReady]=useState(false);
  const [referredBy,setReferredBy]=useState<number|null>(null);
  const [confirmPlan,setConfirmPlan]=useState<Plan|null>(null);

  useEffect(()=>{let cancelled=false;(async()=>{
    const w=(window as any).Telegram?.WebApp;
    const u=w?.initDataUnsafe?.user;
    if(!u?.id){
      if(!cancelled)setReady(true);
      return;
    }

    const id=Number(u.id);
    const firstName=u.first_name||"AFGlion User";
    const uname=u.username||"";
    const avatar=u.photo_url||"";
    setTgId(id);setName(firstName);setUsername(uname);setPhoto(avatar);
    w?.ready?.();w?.expand?.();w?.setHeaderColor?.("#080808");w?.setBackgroundColor?.("#080808");

    const raw=String(w?.initDataUnsafe?.start_param||"");
    const refId=raw.startsWith("ref_")?Number(raw.slice(4)):null;
    const ensured=await ensureRemoteUser({telegramId:id,name:firstName,username:uname,photo:avatar,referredBy:refId});

    let user=ensured.user;
    if(ensured.created&&id===OWNER_ID){
      try{
        const oldRaw=localStorage.getItem("afglion_frontend_v4");
        if(oldRaw){
          const old=JSON.parse(oldRaw);
          const migrated={
            balance:Number(old.balance||0),
            vipEarnings:Number(old.vipEarnings||0),
            referralEarnings:Number(old.referralEarnings||0),
            stakes:Array.isArray(old.stakes)?old.stakes:[],
            transactions:Array.isArray(old.transactions)?old.transactions:[],
            requests:Array.isArray(old.requests)?old.requests:[]
          };
          await saveRemoteUser(id,migrated);
          user={...user,...migrated};
        }
      }catch{}
    }
    try{localStorage.removeItem("afglion_frontend_v4")}catch{}

    const global=await loadGlobal();
    if(cancelled)return;
    setReferredBy(user.referredBy||null);
    setState(s=>({
      ...s,
      balance:user.balance,
      vipEarnings:user.vipEarnings,
      referralEarnings:user.referralEarnings,
      stakes:user.stakes as Stake[],
      transactions:user.transactions as Tx[],
      requests:user.requests as RequestItem[],
      users:[{telegramId:id,name:firstName,username:uname,balance:user.balance,vipEarnings:user.vipEarnings,referralEarnings:user.referralEarnings,joinedAt:user.joinedAt,lastSeen:user.lastSeen,banned:user.banned}],
      settings:global.settings?{...s.settings,...global.settings}:s.settings,
      plans:global.plans?.length?global.plans:s.plans,
      security:global.security?{ownerId:Number(global.security.ownerId||OWNER_ID),adminIds:(global.security.adminIds||[]).map(Number)}:s.security
    }));
    setRemoteReady(true);
    setReady(true);
  })().catch(()=>{if(!cancelled)setReady(true)});return()=>{cancelled=true}},[]);

  useEffect(()=>{
    if(!remoteReady||!tgId)return;
    return watchRemoteUser(tgId,user=>{
      setReferredBy(user.referredBy||null);
      setState(s=>({
        ...s,
        balance:user.balance,
        vipEarnings:user.vipEarnings,
        referralEarnings:user.referralEarnings,
        stakes:user.stakes as Stake[],
        transactions:user.transactions as Tx[],
        requests:user.requests as RequestItem[],
        users:s.users.some(x=>x.telegramId===tgId)
          ?s.users.map(x=>x.telegramId===tgId?{telegramId:tgId,name:user.name,username:user.username,balance:user.balance,vipEarnings:user.vipEarnings,referralEarnings:user.referralEarnings,joinedAt:user.joinedAt,lastSeen:user.lastSeen,banned:user.banned}:x)
          :[{telegramId:tgId,name:user.name,username:user.username,balance:user.balance,vipEarnings:user.vipEarnings,referralEarnings:user.referralEarnings,joinedAt:user.joinedAt,lastSeen:user.lastSeen,banned:user.banned},...s.users]
      }));
    });
  },[remoteReady,tgId]);

  useEffect(()=>{
    if(!remoteReady)return;
    return watchGlobal(global=>setState(s=>({
      ...s,
      settings:global.settings?{...s.settings,...global.settings}:s.settings,
      plans:global.plans?.length?global.plans:s.plans,
      security:global.security?{ownerId:Number(global.security.ownerId||OWNER_ID),adminIds:(global.security.adminIds||[]).map(Number)}:s.security
    })));
  },[remoteReady]);

  useEffect(()=>{
    if(!remoteReady||!tgId)return;
    return watchReferrals(tgId,(items:any[])=>setState(s=>({...s,referrals:items as ReferralItem[]})));
  },[remoteReady,tgId]);

  useEffect(()=>{
    if(!toast)return;
    const t=setTimeout(()=>setToast(""),2600);
    return()=>clearTimeout(t);
  },[toast]);

  const isAdmin=!!tgId&&(tgId===state.security.ownerId||state.security.adminIds.includes(tgId));
  useEffect(()=>{
    if(!remoteReady||!isAdmin)return;
    return watchAllUsers(remoteUsers=>{
      const users:UserRecord[]=remoteUsers.map(u=>({
        telegramId:u.telegramId,name:u.name,username:u.username,balance:u.balance,
        vipEarnings:u.vipEarnings,referralEarnings:u.referralEarnings,
        joinedAt:u.joinedAt,lastSeen:u.lastSeen,banned:u.banned
      }));
      const requests:RequestItem[]=remoteUsers.flatMap(u=>u.requests.map((r:any)=>({
        ...r,userName:u.name,username:u.username,telegramId:u.telegramId
      }))).sort((a,b)=>Number(b.createdAt||0)-Number(a.createdAt||0));
      setState(s=>({...s,users,requests}));
    });
  },[remoteReady,isAdmin]);

  useEffect(()=>{
    if(!remoteReady||!tgId)return;
    const timer=setTimeout(()=>{
      const payload:any={
        name,username,photo,balance:state.balance,vipEarnings:state.vipEarnings,
        referralEarnings:state.referralEarnings,stakes:state.stakes,transactions:state.transactions
      };
      if(!isAdmin)payload.requests=state.requests;
      saveRemoteUser(tgId,payload).catch(()=>{});
    },180);
    return()=>clearTimeout(timer);
  },[remoteReady,tgId,name,username,photo,state.balance,state.vipEarnings,state.referralEarnings,state.stakes,state.transactions,state.requests,isAdmin]);

  useEffect(()=>{
    if(!remoteReady||!isAdmin)return;
    const timer=setTimeout(()=>{
      Promise.all([
        saveGlobalSettings(state.settings),
        saveGlobalPlans(state.plans),
        saveSecurity(state.security)
      ]).catch(()=>{});
    },180);
    return()=>clearTimeout(timer);
  },[remoteReady,isAdmin,state.settings,state.plans,state.security]);

  const currentUser=state.users.find(u=>u.telegramId===tgId);
  const isBanned=!!tgId&&currentUser?.banned===true&&tgId!==state.security.ownerId;
  const activeStake=state.stakes.find(x=>x.status==="active");
  const totalEarned=state.vipEarnings+state.referralEarnings;
  const portfolio=state.balance+totalEarned;
  const activePlans=state.plans.filter(x=>x.active);
  const depositMethods=state.settings.paymentMethods.filter(x=>x.active&&(x.kind==="deposit"||x.kind==="both"));
  const withdrawMethods=state.settings.paymentMethods.filter(x=>x.active&&(x.kind==="withdraw"||x.kind==="both"));

  function notify(message:string){setToast(message)}
  function openTab(t:Tab){setTab(t);window.scrollTo({top:0,behavior:"smooth"})}
  function updateState(fn:(s:AppState)=>AppState){setState(prev=>fn(prev))}
  function addTx(type:string,amount:number,status:string,note?:string){
    updateState(s=>({...s,transactions:[{id:uid("tx"),type,amount,status,createdAt:now(),note},...s.transactions]}));
  }
  function copy(text:string){
    navigator.clipboard?.writeText(text).then(()=>notify("Copied to clipboard")).catch(()=>notify("Copy failed"));
  }
  function normalizeTelegramUrl(url:string){
    let u=String(url||"").trim();
    if(!u)return "";
    if(u.startsWith("@"))u="https://t.me/"+u.slice(1);
    else if(u.startsWith("t.me/")||u.startsWith("telegram.me/"))u="https://"+u;
    return u;
  }
  function openTelegram(url:string){
    const u=normalizeTelegramUrl(url);
    if(!u){notify("Channel link is missing");return}
    const w=(window as any).Telegram?.WebApp;
    try{
      if(w?.openTelegramLink&&u.includes("t.me/")){w.openTelegramLink(u);return}
      const opened=window.open(u,"_blank","noopener,noreferrer");
      if(!opened)window.location.assign(u);
    }catch{window.location.assign(u)}
  }
  function referralLink(){
    const id=tgId||6589090462;
    return "https://t.me/Afglionbot?startapp=ref_"+id;
  }
  async function activatePlan(plan:Plan){
    if(state.balance<plan.price){
      setConfirmPlan(null);
      notify("Balance is too low — deposit first.");
      setSheet("deposit");
      return;
    }
    updateState(s=>({
      ...s,
      balance:s.balance-plan.price,
      users:s.users.map(u=>u.telegramId===tgId?{...u,balance:s.balance-plan.price}:u),
      stakes:[{id:uid("stake"),planId:plan.id,planName:plan.name,price:plan.price,dailyReward:plan.dailyReward,durationDays:plan.durationDays,startedAt:now(),claimed:0,status:"active"},...s.stakes],
      transactions:[{id:uid("tx"),type:"stake_activation",amount:-plan.price,status:"completed",createdAt:now(),note:plan.name},...s.transactions]
    }));
    if(referredBy&&referredBy!==tgId){
      const reward=Math.round((plan.price*Number(state.settings.referralPercent||0)/100)*100)/100;
      if(reward>0)await rewardReferral(referredBy,tgId,reward).catch(()=>{});
    }
    setConfirmPlan(null);
    notify(plan.name+" activated");
  }
  function claimDemo(stake:Stake){
    const elapsed=Math.floor((now()-stake.startedAt)/86400000);
    const available=Math.max(0,elapsed*stake.dailyReward-stake.claimed);
    if(available<=0){notify("No reward available yet");return}
    updateState(s=>({
      ...s,
      balance:s.balance+available,
      vipEarnings:s.vipEarnings+available,
      users:s.users.map(u=>u.telegramId===tgId?{...u,balance:s.balance+available,vipEarnings:s.vipEarnings+available}:u),
      stakes:s.stakes.map(x=>x.id===stake.id?{...x,claimed:x.claimed+available}:x),
      transactions:[{id:uid("tx"),type:"vip_reward",amount:available,status:"completed",createdAt:now(),note:stake.planName},...s.transactions]
    }));
    notify(money(available)+" claimed");
  }

  const common={state,setState,notify,openTab,setSheet,name,username,photo,tgId,isAdmin,activeStake,activePlans,depositMethods,withdrawMethods,portfolio,totalEarned,referralLink,copy,openTelegram,activatePlan,claimDemo,setConfirmPlan};

  if(!ready)return <main className="loading"><motion.div animate={{scale:[1,1.1,1],rotate:[0,4,-4,0]}} transition={{repeat:Infinity,duration:2}} className="loader-lion">🦁</motion.div><span>Opening AFGlion...</span></main>;
  if(isBanned)return <main className="loading"><div className="restricted-card"><LockKeyhole/><h2>Account Restricted</h2><p>Your AFGlion account has been banned by an administrator.</p><small>Telegram ID: {tgId}</small></div></main>;

  return <main className="app-shell">
    <header className="topbar">
      <button className="brand" onClick={()=>openTab("home")} type="button">
        <motion.span className="brand-icon" animate={{rotate:[0,3,-3,0]}} transition={{repeat:Infinity,duration:4}}>🦁</motion.span>
        <span><b>AFG<em>lion</em></b><small>Premium Finance</small></span>
      </button>
      <div className="top-actions">
        {isAdmin&&<button className="admin-chip" type="button" onClick={()=>openTab("admin")}><Settings/> Admin</button>}
        <button className="icon-button" type="button" onClick={()=>setSheet("notifications")}><Bell/></button>
        <button className="avatar-button" type="button" onClick={()=>setSheet("profile")}>{photo?<img src={photo} alt="profile"/>:<UserRound/>}</button>
      </div>
    </header>

    <AnimatePresence mode="wait">
      <motion.section className="page" key={tab} initial={{opacity:0,y:12}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-8}} transition={{duration:.2}}>
        {tab==="home"&&<HomeView {...common}/>}
        {tab==="stake"&&<StakeView {...common}/>}
        {tab==="referral"&&<ReferralView {...common}/>}
        {tab==="wallet"&&<WalletView {...common}/>}
        {tab==="admin"&&isAdmin&&<AdminView state={state} setState={setState} section={adminSection} setSection={setAdminSection} notify={notify} onBack={()=>openTab("home")} viewerId={tgId||state.security.ownerId}/>}
        {tab==="admin"&&!isAdmin&&<EmptyState icon={<LockKeyhole/>} title="Admin access only" text="Open AFGlion with the owner Telegram account."/>}
      </motion.section>
    </AnimatePresence>

    {tab!=="admin"&&<nav className="bottom-nav">
      <Nav active={tab==="home"} label="Home" icon={<Home/>} onClick={()=>openTab("home")}/>
      <Nav active={tab==="stake"} label="Stake" icon={<Crown/>} onClick={()=>openTab("stake")}/>
      <Nav active={tab==="referral"} label="Referral" icon={<Users/>} onClick={()=>openTab("referral")}/>
      <Nav active={tab==="wallet"} label="Wallet" icon={<WalletCards/>} onClick={()=>openTab("wallet")}/>
    </nav>}

    <AnimatePresence>
      {sheet&&<SheetLayer type={sheet} close={()=>setSheet(null)} state={state} setState={setState} notify={notify} depositMethods={depositMethods} withdrawMethods={withdrawMethods} name={name} username={username} tgId={tgId}/>}
      {confirmPlan&&<ConfirmPlan plan={confirmPlan} balance={state.balance} close={()=>setConfirmPlan(null)} confirm={()=>activatePlan(confirmPlan)}/>}
      {toast&&<motion.div className="toast" initial={{opacity:0,y:20,scale:.96}} animate={{opacity:1,y:0,scale:1}} exit={{opacity:0,y:12}}><Check/> {toast}</motion.div>}
    </AnimatePresence>
  </main>
}

function HomeView(p:any){
  const s:AppState=p.state;
  const stake:Stake|undefined=p.activeStake;
  const progress=stake?Math.min(100,Math.max(0,((now()-stake.startedAt)/(stake.durationDays*86400000))*100)):0;
  return <>
    <section className="welcome-row">
      <div><small>Welcome back</small><h1>{p.name} 👋</h1><span><ShieldCheck/> Verified AFGlion member</span></div>
      <motion.div className="lion-orbit" animate={{y:[0,-4,0]}} transition={{repeat:Infinity,duration:2.8}}>🦁</motion.div>
    </section>

    <section className="hero-card">
      <div className="hero-glow"/>
      <div className="hero-head"><span>MY PORTFOLIO</span><b><i/> LIVE</b></div>
      <h2>{money(p.portfolio)}</h2>
      <p>Total account value</p>
      <div className="hero-grid">
        <div><span>Available</span><b>{money(s.balance)}</b></div>
        <div><span>Total earned</span><b>{money(p.totalEarned)}</b></div>
      </div>
    </section>

    <section className="quick-actions">
      <Quick icon={<ArrowDownToLine/>} title="Deposit" sub="Add funds" onClick={()=>p.setSheet("deposit")}/>
      <Quick icon={<ArrowUpFromLine/>} title="Withdraw" sub="Cash out" onClick={()=>p.setSheet("withdraw")}/>
      <Quick icon={<Crown/>} title="Stake" sub="View plans" onClick={()=>p.openTab("stake")}/>
      <Quick icon={<Users/>} title="Invite" sub="Earn rewards" onClick={()=>p.openTab("referral")}/>
    </section>

    {s.settings.announcement&&<section className="notice-card"><Bell/><div><b>AFGlion Announcement</b><span>{s.settings.announcement}</span></div><ChevronRight/></section>}

    <SectionTitle title="Stake Center" action="View plans" onClick={()=>p.openTab("stake")}/>
    {stake?<section className="active-stake">
      <div className="stake-top"><span className="round-icon"><Crown/></span><div><small>ACTIVE PLAN</small><b>{stake.planName}</b></div><strong>{money(stake.dailyReward)}<small>/day</small></strong></div>
      <div className="bar"><i style={{width:progress+"%"}}/></div>
      <div className="bar-meta"><span>{Math.max(0,stake.durationDays-Math.floor((now()-stake.startedAt)/86400000))} days left</span><span>{money(stake.claimed)} claimed</span></div>
      <button className="soft-button" type="button" onClick={()=>p.claimDemo(stake)}><Zap/> Claim available</button>
    </section>:<section className="upgrade-card">
      <div><small>START YOUR JOURNEY</small><h3>Choose an AFGlion plan</h3><p>Browse admin-configured packages and activate one from your wallet balance.</p><button type="button" onClick={()=>p.openTab("stake")}>Explore plans <ChevronRight/></button></div><motion.span animate={{rotate:[-6,6,-6]}} transition={{repeat:Infinity,duration:3}}><Crown/></motion.span>
    </section>}

    <section className="metric-grid">
      <Metric title="VIP Rewards" value={money(s.vipEarnings)} sub="Lifetime claimed"/>
      <Metric title="Referral Rewards" value={money(s.referralEarnings)} sub={s.referrals.length+" referrals"}/>
    </section>

    <button className="referral-banner" type="button" onClick={()=>p.openTab("referral")}><span className="round-icon green"><Users/></span><div><small>GROW TOGETHER</small><b>Invite friends. Earn rewards.</b><span>{s.settings.referralPercent}% commission is currently configured.</span></div><ChevronRight/></button>

    <SectionTitle title="AFGlion Community"/>
    {s.settings.channels.length?<section className="channel-join-list">{s.settings.channels.map((ch:any,i:number)=><article className="channel-join-card" key={ch.url||i}><span className="channel-logo"><Radio/></span><div><small>OFFICIAL CHANNEL</small><b>{ch.name}</b><span>News, updates and AFGlion announcements.</span></div><button type="button" onClick={()=>p.openTelegram(ch.url)}>Join <ChevronRight/></button></article>)}</section>:<section className="empty-inline"><Radio/><div><b>Official channels</b><span>Admin can add up to two channels from the control panel.</span></div></section>}

    <SectionTitle title="Account Center"/>
    <section className="account-grid">
      <button type="button" onClick={()=>p.setSheet("profile")}><span><UserRound/></span><b>Profile</b><small>Account details</small></button>
      <button type="button" onClick={()=>p.openTab("wallet")}><span><History/></span><b>Activity</b><small>{s.transactions.length} records</small></button>
      <button type="button" onClick={()=>p.notify("Security center is active.")}><span><LockKeyhole/></span><b>Security</b><small>Protected mode</small></button>
    </section>

    <SectionTitle title="Recent Activity" action="Wallet" onClick={()=>p.openTab("wallet")}/>
    {s.transactions.slice(0,4).map((x:Tx)=><TransactionRow key={x.id} item={x}/>)}
    {!s.transactions.length&&<EmptyState icon={<History/>} title="Your journey starts here" text="Deposits, withdrawals, stake activations and rewards will appear here."/>}
  </>
}

function StakeView(p:any){
  const s:AppState=p.state;
  return <>
    <PageHead eyebrow="AFGLION MEMBERSHIP" title="Stake Center" icon={<Crown/>}/>
    <section className="stake-hero">
      <div><small>PREMIUM PLANS</small><h2>Choose your Lion level.</h2><p>Every plan below is editable from the Admin Panel. Rewards shown are admin-configured.</p></div>
      <motion.span animate={{y:[0,-5,0],rotate:[0,4,0]}} transition={{repeat:Infinity,duration:3}}><Crown/></motion.span>
    </section>

    <section className="metric-grid three">
      <Metric title="Available" value={money(s.balance)} sub="Wallet balance"/>
      <Metric title="Active" value={String(s.stakes.filter(x=>x.status==="active").length)} sub="Plans running"/>
      <Metric title="Claimed" value={money(s.vipEarnings)} sub="VIP rewards"/>
    </section>

    {s.stakes.filter(x=>x.status==="active").map(st=><section className="active-stake" key={st.id}>
      <div className="stake-top"><span className="round-icon"><Crown/></span><div><small>ACTIVE MEMBERSHIP</small><b>{st.planName}</b></div><strong>{money(st.dailyReward)}<small>/day</small></strong></div>
      <div className="stake-stats"><div><span>Capital</span><b>{money(st.price)}</b></div><div><span>Duration</span><b>{st.durationDays} days</b></div><div><span>Claimed</span><b>{money(st.claimed)}</b></div></div>
      <button className="gold-button" type="button" onClick={()=>p.claimDemo(st)}><Zap/> Claim available reward</button>
    </section>)}

    <SectionTitle title="Available Plans"/>
    <section className="plans-grid">
      {p.activePlans.map((plan:Plan)=><motion.article whileTap={{scale:.985}} className="plan-card" key={plan.id}>
        <div className="plan-top"><div><span className="badge">{plan.badge}</span><h3>{plan.name}</h3><small>{plan.durationDays}-day cycle</small></div><span className="plan-crown"><Crown/></span></div>
        <div className="plan-price"><b>{money(plan.price)}</b><span>activation amount</span></div>
        <div className="plan-data"><div><span>Daily reward</span><b>{money(plan.dailyReward)}</b></div><div><span>Cycle reward</span><b>{money(plan.dailyReward*plan.durationDays)}</b></div></div>
        <button className="gold-button" type="button" onClick={()=>p.setConfirmPlan(plan)}>Stake / Activate <ChevronRight/></button>
      </motion.article>)}
    </section>
    {!p.activePlans.length&&<EmptyState icon={<Crown/>} title="No active plans" text="Admin can publish packages from the Admin Panel."/>}

    <section className="info-card"><ShieldCheck/><div><b>Membership protection</b><span>Review the package amount, duration and reward details before activation.</span></div></section>
  </>
}

function ReferralView(p:any){
  const s:AppState=p.state;
  const link=p.referralLink();
  return <>
    <PageHead eyebrow="AFGLION NETWORK" title="Referral Hub" icon={<Users/>}/>
    <section className="ref-hero">
      <div className="hero-glow"/>
      <small>YOUR REFERRAL REWARDS</small><h2>{money(s.referralEarnings)}</h2><p>Grow your network and track your rewards in one place.</p>
      <div className="ref-stats"><div><b>{s.referrals.length}</b><span>Total invites</span></div><div><b>{s.referrals.filter(x=>x.status==="rewarded").length}</b><span>Rewarded</span></div><div><b>{s.settings.referralPercent}%</b><span>Commission</span></div></div>
    </section>

    <section className="commission-card"><BadgePercent/><div><small>ADMIN-CONTROLLED RATE</small><b>{s.settings.referralPercent}% referral commission</b><span>Applied according to the configured referral rules.</span></div></section>

    <SectionTitle title="Invite Friends"/>
    <section className="share-card">
      <b>Your personal referral link</b><p>Copy or share it directly through Telegram.</p>
      <div className="link-box"><span>{link}</span><button type="button" onClick={()=>p.copy(link)}><Copy/></button></div>
      <div className="share-actions"><button type="button" onClick={()=>p.copy(link)}><Copy/> Copy Link</button><button type="button" onClick={()=>p.openTelegram("https://t.me/share/url?url="+encodeURIComponent(link))}><Users/> Share</button></div>
    </section>

    <SectionTitle title="How It Works"/>
    <section className="steps">
      <div><span>1</span><b>Share</b><small>Send your link</small></div><i/>
      <div><span>2</span><b>Join</b><small>Friend opens app</small></div><i/>
      <div><span>3</span><b>Reward</b><small>Track commission</small></div>
    </section>

    <SectionTitle title="My Referrals"/>
    {s.referrals.map((r:ReferralItem,i:number)=><section className="ref-row" key={r.id}><span>{String(i+1).padStart(2,"0")}</span><div><b>{r.name}</b><small>{new Date(r.joinedAt).toLocaleDateString()} • {r.status}</small></div><strong>{money(r.reward)}</strong></section>)}
    {!s.referrals.length&&<EmptyState icon={<Users/>} title="Your network is waiting" text="Share your referral link to start building your network."/>}
  </>
}

function WalletView(p:any){
  const s:AppState=p.state;
  const moneyIn=s.transactions.filter(x=>x.amount>0).reduce((a,b)=>a+b.amount,0);
  const moneyOut=Math.abs(s.transactions.filter(x=>x.amount<0).reduce((a,b)=>a+b.amount,0));
  return <>
    <PageHead eyebrow="AFGLION MONEY CENTER" title="Wallet" icon={<WalletCards/>}/>
    <section className="wallet-card">
      <div className="wallet-head"><span>AVAILABLE BALANCE</span><ShieldCheck/></div>
      <h2>{money(s.balance)}</h2><small>{s.settings.currency} • AFGlion Wallet</small>
      <div className="wallet-mini"><div><span>Total in</span><b>{money(moneyIn)}</b></div><div><span>Total out</span><b>{money(moneyOut)}</b></div></div>
    </section>

    <section className="wallet-actions">
      <button type="button" onClick={()=>p.setSheet("deposit")}><span><ArrowDownToLine/></span><b>Deposit</b><small>Add funds</small></button>
      <button type="button" onClick={()=>p.setSheet("withdraw")}><span><ArrowUpFromLine/></span><b>Withdraw</b><small>Request payout</small></button>
    </section>

    <section className="limit-card"><TrendingUp/><div><b>Deposit {money(s.settings.minDeposit)} – {money(s.settings.maxDeposit)}</b><span>Withdraw {money(s.settings.minWithdraw)} – {money(s.settings.maxWithdraw)}</span></div></section>

    <SectionTitle title="Payment Methods"/>
    <section className="method-grid">
      {s.settings.paymentMethods.filter(x=>x.active).map((m:PaymentMethod)=><article key={m.id}><span>{m.name.toLowerCase().includes("momo")?<Smartphone/>:<Landmark/>}</span><div><b>{m.name}</b><small>{m.kind==="both"?"Deposit & Withdraw":m.kind}</small></div><i/></article>)}
    </section>

    <SectionTitle title="Requests"/>
    {s.requests.slice(0,4).map((r:RequestItem)=><section className="request-row" key={r.id}><span className={"status-dot "+r.status}/><div><b>{r.type==="deposit"?"Deposit":"Withdrawal"} • {r.method}</b><small>{new Date(r.createdAt).toLocaleDateString()} • {r.status}</small></div><strong>{money(r.amount)}</strong></section>)}
    {!s.requests.length&&<EmptyState icon={<WalletCards/>} title="No requests yet" text="Deposit and withdrawal requests will appear here."/>}

    <SectionTitle title="Transactions"/>
    {s.transactions.slice(0,12).map((x:Tx)=><TransactionRow key={x.id} item={x}/>)}
    {!s.transactions.length&&<EmptyState icon={<History/>} title="No transactions yet" text="Your account activity will appear here."/>}
  </>
}

function AdminView({state,setState,section,setSection,notify,onBack,viewerId}:{state:AppState;setState:React.Dispatch<React.SetStateAction<AppState>>;section:AdminSection;setSection:(s:AdminSection)=>void;notify:(s:string)=>void;onBack:()=>void;viewerId:number}){
  const [draft,setDraft]=useState<AppState>(state);
  const [plan,setPlan]=useState({name:"",price:"",dailyReward:"",durationDays:"",badge:"VIP"});
  const [userSearch,setUserSearch]=useState("");
  const [balanceEdits,setBalanceEdits]=useState<Record<number,string>>({});
  const [newAdminId,setNewAdminId]=useState("");
  const [transferId,setTransferId]=useState("");
  const isOwner=viewerId===state.security.ownerId;
  useEffect(()=>setDraft(state),[state]);

  function saveSettings(){
    setState({...draft});
    notify("Settings saved");
  }
  function addPlan(e:React.FormEvent){
    e.preventDefault();
    const price=Number(plan.price),daily=Number(plan.dailyReward),days=Number(plan.durationDays);
    if(!plan.name||price<=0||daily<0||days<=0){notify("Complete all package fields");return}
    const item:Plan={id:uid("plan"),name:plan.name,price,dailyReward:daily,durationDays:days,badge:plan.badge||"VIP",active:true};
    setDraft(s=>({...s,plans:[item,...s.plans]}));
    setState(s=>({...s,plans:[item,...s.plans]}));
    setPlan({name:"",price:"",dailyReward:"",durationDays:"",badge:"VIP"});
    notify("Package created");
  }
  function togglePlan(id:string){
    setDraft(s=>({...s,plans:s.plans.map(x=>x.id===id?{...x,active:!x.active}:x)}));
    setState(s=>({...s,plans:s.plans.map(x=>x.id===id?{...x,active:!x.active}:x)}));
  }
  function deletePlan(id:string){
    setDraft(s=>({...s,plans:s.plans.filter(x=>x.id!==id)}));
    setState(s=>({...s,plans:s.plans.filter(x=>x.id!==id)}));
    notify("Package deleted");
  }
  function changeMethod(id:string,key:keyof PaymentMethod,value:any){
    setDraft(s=>({...s,settings:{...s.settings,paymentMethods:s.settings.paymentMethods.map(x=>x.id===id?{...x,[key]:value}:x)}}));
  }
  function addMethod(){
    setDraft(s=>({...s,settings:{...s.settings,paymentMethods:[...s.settings.paymentMethods,{id:uid("method"),name:"New Method",number:"",details:"",active:true,kind:"both"}]}}));
  }
  function removeMethod(id:string){
    setDraft(s=>({...s,settings:{...s.settings,paymentMethods:s.settings.paymentMethods.filter(x=>x.id!==id)}}));
  }
  async function reviewRequest(id:string,approve:boolean){
    const req=state.requests.find(x=>x.id===id);
    if(!req||req.status!=="pending"||!req.telegramId)return;
    try{
      await reviewRemoteRequest(Number(req.telegramId),id,approve);
      notify(approve?"Request approved":"Request rejected");
    }catch{notify("Request update failed")}
  }
  async function adjustUserBalance(id:number,mode:"add"|"remove"){
    const amount=Number(balanceEdits[id]||0);
    if(!amount||amount<=0){notify("Enter a valid amount");return}
    const target=state.users.find(u=>u.telegramId===id);
    if(!target){notify("User not found");return}
    const next=mode==="add"?target.balance+amount:Math.max(0,target.balance-amount);
    try{
      await updateRemoteUserBalance(id,next);
      setBalanceEdits(v=>({...v,[id]:""}));
      notify(mode==="add"?"Balance added":"Balance removed");
    }catch{notify("Balance update failed")}
  }
  async function toggleBan(id:number){
    if(id===state.security.ownerId){notify("Owner cannot be banned");return}
    const target=state.users.find(u=>u.telegramId===id);
    if(!target)return;
    try{
      await updateRemoteUserBan(id,!target.banned);
      notify(target.banned?"User unbanned":"User banned");
    }catch{notify("User update failed")}
  }
  function addAdmin(){
    if(!isOwner){notify("Only the owner can manage admins");return}
    const id=Number(newAdminId); if(!id){notify("Enter a valid Telegram ID");return}
    if(id===state.security.ownerId){notify("This user is already the owner");return}
    setState(s=>({...s,security:{...s.security,adminIds:Array.from(new Set([...s.security.adminIds,id]))},users:s.users.some(u=>u.telegramId===id)?s.users:[{telegramId:id,name:"Admin User",username:"",balance:0,vipEarnings:0,referralEarnings:0,joinedAt:now(),lastSeen:now(),banned:false},...s.users]}));
    setNewAdminId("");notify("Admin added");
  }
  function removeAdmin(id:number){
    if(!isOwner){notify("Only the owner can manage admins");return}
    setState(s=>({...s,security:{...s.security,adminIds:s.security.adminIds.filter(x=>x!==id)}}));notify("Admin removed");
  }
  function transferOwnership(){
    if(!isOwner){notify("Only the owner can transfer ownership");return}
    const id=Number(transferId); if(!id||id===state.security.ownerId){notify("Enter a different valid Telegram ID");return}
    const oldOwner=state.security.ownerId;
    setState(s=>({...s,security:{ownerId:id,adminIds:Array.from(new Set([...s.security.adminIds.filter(x=>x!==id),oldOwner]))},users:s.users.some(u=>u.telegramId===id)?s.users:[{telegramId:id,name:"New Owner",username:"",balance:0,vipEarnings:0,referralEarnings:0,joinedAt:now(),lastSeen:now(),banned:false},...s.users]}));
    setTransferId("");notify("Ownership transferred");
  }
  function reset(){
    window.location.reload();
  }

  return <>
    <section className="admin-head"><div><small>AFGlion Control Center</small><h1>Admin Panel</h1></div><button type="button" onClick={onBack}><LogOut/> Back</button></section>
    <section className="admin-tabs">
      {(["overview","users","plans","payments","requests","channels","team","settings"] as AdminSection[]).map(x=><button type="button" className={section===x?"active":""} key={x} onClick={()=>setSection(x)}>{x}</button>)}
    </section>

    {section==="overview"&&<>
      <section className="admin-kpis"><Metric title="Users" value={String(state.users.length)} sub="Registered"/><Metric title="Plans" value={String(state.plans.length)} sub="Configured"/><Metric title="Requests" value={String(state.requests.filter(x=>x.status==="pending").length)} sub="Pending"/><Metric title="Referral" value={state.settings.referralPercent+"%"} sub="Commission"/></section>
      <section className="admin-hero"><Settings/><div><b>AFGlion Control Center</b><span>Manage packages, payment methods, requests, channels and app settings from one place.</span></div></section>
      <SectionTitle title="Quick Actions"/>
      <section className="admin-quick"><button type="button" onClick={()=>setSection("users")}><Users/><b>Users</b></button><button type="button" onClick={()=>setSection("plans")}><Crown/><b>Plans</b></button><button type="button" onClick={()=>setSection("requests")}><History/><b>Requests</b></button><button type="button" onClick={()=>setSection("team")}><ShieldCheck/><b>Admin Team</b></button></section>
    </>}

    {section==="users"&&<>
      <section className="user-toolbar"><div><Users/><span><b>User Management</b><small>{state.users.length} registered users</small></span></div><input value={userSearch} onChange={e=>setUserSearch(e.target.value)} placeholder="Search name, username or Telegram ID"/></section>
      <section className="user-list">
        {state.users.filter(u=>{const q=userSearch.trim().toLowerCase();return !q||u.name.toLowerCase().includes(q)||u.username.toLowerCase().includes(q)||String(u.telegramId).includes(q)}).map(u=><article className="user-card" key={u.telegramId}>
          <div className="user-card-head"><span className="user-avatar"><UserRound/></span><div><b>{u.name}</b><small>{u.username?"@"+u.username:"No username"} • ID {u.telegramId}</small></div><span className={"user-state "+(u.banned?"banned":"active")}>{u.banned?"Banned":"Active"}</span></div>
          <div className="user-facts"><div><span>Balance</span><b>{money(u.balance)}</b></div><div><span>VIP Earned</span><b>{money(u.vipEarnings)}</b></div><div><span>Referral</span><b>{money(u.referralEarnings)}</b></div><div><span>Role</span><b>{u.telegramId===state.security.ownerId?"Owner":state.security.adminIds.includes(u.telegramId)?"Admin":"User"}</b></div><div><span>Joined</span><b>{new Date(u.joinedAt).toLocaleDateString()}</b></div><div><span>Last Seen</span><b>{new Date(u.lastSeen).toLocaleString()}</b></div></div>
          <div className="balance-control"><input inputMode="decimal" value={balanceEdits[u.telegramId]||""} onChange={e=>setBalanceEdits(v=>({...v,[u.telegramId]:e.target.value}))} placeholder="Amount AFN"/><button type="button" className="add-balance" onClick={()=>adjustUserBalance(u.telegramId,"add")}><Plus/> Add</button><button type="button" className="remove-balance" onClick={()=>adjustUserBalance(u.telegramId,"remove")}><Trash2/> Remove</button></div>
          <button type="button" className={u.banned?"unban-button":"ban-button"} disabled={u.telegramId===state.security.ownerId} onClick={()=>toggleBan(u.telegramId)}>{u.banned?<><ShieldCheck/> Unban User</>:<><LockKeyhole/> Ban User</>}</button>
        </article>)}
      </section>
    </>}

    {section==="plans"&&<>
      <form className="admin-card form-grid" onSubmit={addPlan}>
        <div className="card-title"><Crown/><div><b>Create Stake Package</b><span>Add a new frontend package.</span></div></div>
        <input value={plan.name} onChange={e=>setPlan({...plan,name:e.target.value})} placeholder="Package name"/>
        <div className="two"><input inputMode="decimal" value={plan.price} onChange={e=>setPlan({...plan,price:e.target.value})} placeholder="Price AFN"/><input inputMode="decimal" value={plan.dailyReward} onChange={e=>setPlan({...plan,dailyReward:e.target.value})} placeholder="Daily reward AFN"/></div>
        <div className="two"><input inputMode="numeric" value={plan.durationDays} onChange={e=>setPlan({...plan,durationDays:e.target.value})} placeholder="Duration days"/><input value={plan.badge} onChange={e=>setPlan({...plan,badge:e.target.value})} placeholder="Badge"/></div>
        <button className="gold-button" type="submit"><Plus/> Create Package</button>
      </form>
      <SectionTitle title="All Packages"/>
      {draft.plans.map(x=><section className="admin-row" key={x.id}><span className="round-icon"><Crown/></span><div><b>{x.name}</b><small>{money(x.price)} • {money(x.dailyReward)}/day • {x.durationDays}d</small></div><button type="button" className={x.active?"toggle on":"toggle"} onClick={()=>togglePlan(x.id)}>{x.active?"On":"Off"}</button><button className="delete" type="button" onClick={()=>deletePlan(x.id)}><Trash2/></button></section>)}
    </>}

    {section==="payments"&&<>
      <section className="admin-card">
        <div className="card-title"><WalletCards/><div><b>Payment Methods</b><span>Add, edit, enable or disable methods.</span></div><button className="small-add" type="button" onClick={addMethod}><Plus/> Add</button></div>
        <div className="method-editor">
          {draft.settings.paymentMethods.map(m=><article key={m.id}>
            <div className="method-line"><input value={m.name} onChange={e=>changeMethod(m.id,"name",e.target.value)} placeholder="Method name"/><select value={m.kind} onChange={e=>changeMethod(m.id,"kind",e.target.value)}><option value="both">Both</option><option value="deposit">Deposit</option><option value="withdraw">Withdraw</option></select><button className={m.active?"toggle on":"toggle"} type="button" onClick={()=>changeMethod(m.id,"active",!m.active)}>{m.active?"On":"Off"}</button></div>
            <div className="method-number-edit"><label>Account / Phone Number</label><input value={m.number||""} onChange={e=>changeMethod(m.id,"number",e.target.value)} placeholder="e.g. 07XXXXXXXX"/></div>
            <div className="method-line"><input value={m.details} onChange={e=>changeMethod(m.id,"details",e.target.value)} placeholder="Payment instructions / note"/><button className="delete" type="button" onClick={()=>removeMethod(m.id)}><Trash2/></button></div>
          </article>)}
        </div>
        <button className="gold-button" type="button" onClick={saveSettings}><Check/> Save Payment Methods</button>
      </section>
    </>}

    {section==="requests"&&<>
      <SectionTitle title="Pending & Recent Requests"/>
      <section className="request-summary"><div><span>Pending</span><b>{state.requests.filter(x=>x.status==="pending").length}</b></div><div><span>Approved</span><b>{state.requests.filter(x=>x.status==="approved").length}</b></div><div><span>Rejected</span><b>{state.requests.filter(x=>x.status==="rejected").length}</b></div></section>
      {state.requests.map(r=><article className="request-card" key={r.id}>
        <div className="request-card-head"><span className={"request-icon "+r.type}>{r.type==="deposit"?<ArrowDownToLine/>:<ArrowUpFromLine/>}</span><div><small>{r.type==="deposit"?"DEPOSIT REQUEST":"WITHDRAWAL REQUEST"}</small><b>{money(r.amount)}</b></div><span className={"request-status "+r.status}>{r.status}</span></div>
        <div className="request-user"><span className="request-user-avatar"><UserRound/></span><div><b>{r.userName||"AFGlion User"}</b><small>{r.username?"@"+r.username:"No username"} • ID: {r.telegramId||"Browser"}</small></div></div>
        <div className="request-details">
          <div><span>Payment Method</span><b>{r.method}</b></div>
          <div><span>{r.type==="deposit"?"Reference / TXID":"Account / Wallet"}</span><b>{r.reference||"—"}</b></div>
          <div><span>Request ID</span><b className="mono">{r.id}</b></div>
          <div><span>Date & Time</span><b>{new Date(r.createdAt).toLocaleString()}</b></div>
        </div>
        {r.type==="deposit"&&<div className="telegram-proof-note"><Radio/><div><b>Screenshot verification</b><span>Check the admin Telegram chat for this user’s payment screenshot. Match it with the Request ID and TXID above.</span></div></div>}
        {r.status==="pending"?<div className="request-actions"><button type="button" className="approve" onClick={()=>reviewRequest(r.id,true)}><Check/> Approve</button><button type="button" className="reject" onClick={()=>reviewRequest(r.id,false)}><X/> Reject</button></div>:<div className="processed-note"><ShieldCheck/> Request processed: {r.status}</div>}
      </article>)}
      {!state.requests.length&&<EmptyState icon={<History/>} title="No requests" text="User deposit and withdrawal requests will appear here with full details."/>}
    </>}

    {section==="channels"&&<section className="admin-card form-grid">
      <div className="card-title"><Radio/><div><b>Official Channels</b><span>Maximum two channels.</span></div></div>
      {[0,1].map(i=><div className="channel-edit" key={i}><input value={draft.settings.channels[i]?.name||""} onChange={e=>setDraft(s=>{const arr=[...s.settings.channels];arr[i]={name:e.target.value,url:arr[i]?.url||""};return {...s,settings:{...s.settings,channels:arr.filter((x,j)=>j<=1)}}})} placeholder={"Channel "+(i+1)+" name"}/><input value={draft.settings.channels[i]?.url||""} onChange={e=>setDraft(s=>{const arr=[...s.settings.channels];arr[i]={name:arr[i]?.name||"",url:e.target.value};return {...s,settings:{...s.settings,channels:arr.filter((x,j)=>j<=1)}}})} placeholder="https://t.me/channel"/></div>)}
      <button className="gold-button" type="button" onClick={()=>{setState({...draft,settings:{...draft.settings,channels:draft.settings.channels.filter(x=>x.name&&x.url).slice(0,2)}});notify("Channels saved")}}><Check/> Save Channels</button>
    </section>}

    {section==="team"&&<>
      <section className="owner-card"><span className="owner-crown"><Crown/></span><div><small>CURRENT OWNER</small><b>Telegram ID: {state.security.ownerId}</b><span>Full access to ownership, admins and all AFGlion controls.</span></div></section>
      <section className="admin-card form-grid">
        <div className="card-title"><ShieldCheck/><div><b>Admin Team</b><span>Add or remove admins. Only the owner can make changes.</span></div></div>
        <div className="team-add"><input inputMode="numeric" value={newAdminId} onChange={e=>setNewAdminId(e.target.value)} placeholder="Telegram ID"/><button type="button" onClick={addAdmin}><Plus/> Add Admin</button></div>
        <div className="team-list">{state.security.adminIds.map(id=><div className="team-row" key={id}><span><UserRound/></span><div><b>{state.users.find(u=>u.telegramId===id)?.name||"Admin User"}</b><small>Telegram ID: {id}</small></div><button type="button" disabled={!isOwner} onClick={()=>removeAdmin(id)}><Trash2/> Remove</button></div>)}{!state.security.adminIds.length&&<div className="team-empty">No additional admins yet.</div>}</div>
      </section>
      <section className="transfer-card"><div className="card-title"><Crown/><div><b>Transfer Ownership</b><span>The new owner receives full control. Your current owner account becomes an admin.</span></div></div><input inputMode="numeric" value={transferId} onChange={e=>setTransferId(e.target.value)} placeholder="New owner Telegram ID"/><button type="button" disabled={!isOwner} onClick={transferOwnership}><ShieldCheck/> Transfer Ownership</button></section>
    </>}

    {section==="settings"&&<section className="admin-card form-grid">
      <div className="card-title"><Settings/><div><b>App Settings</b><span>Currency, limits, commission and announcement.</span></div></div>
      <label>Currency</label><div className="two"><input value={draft.settings.currency} onChange={e=>setDraft(s=>({...s,settings:{...s.settings,currency:e.target.value}}))}/><input value={draft.settings.currencySymbol} onChange={e=>setDraft(s=>({...s,settings:{...s.settings,currencySymbol:e.target.value}}))}/></div>
      <label>Deposit limits</label><div className="two"><input inputMode="numeric" value={draft.settings.minDeposit} onChange={e=>setDraft(s=>({...s,settings:{...s.settings,minDeposit:Number(e.target.value)}}))}/><input inputMode="numeric" value={draft.settings.maxDeposit} onChange={e=>setDraft(s=>({...s,settings:{...s.settings,maxDeposit:Number(e.target.value)}}))}/></div>
      <label>Withdrawal limits</label><div className="two"><input inputMode="numeric" value={draft.settings.minWithdraw} onChange={e=>setDraft(s=>({...s,settings:{...s.settings,minWithdraw:Number(e.target.value)}}))}/><input inputMode="numeric" value={draft.settings.maxWithdraw} onChange={e=>setDraft(s=>({...s,settings:{...s.settings,maxWithdraw:Number(e.target.value)}}))}/></div>
      <label>Referral commission %</label><div className="icon-input"><BadgePercent/><input inputMode="decimal" value={draft.settings.referralPercent} onChange={e=>setDraft(s=>({...s,settings:{...s.settings,referralPercent:Math.max(0,Math.min(100,Number(e.target.value)))}}))}/></div>
      <label>Admin Telegram Username</label><input value={draft.settings.supportUsername||""} onChange={e=>setDraft(s=>({...s,settings:{...s.settings,supportUsername:e.target.value.replace(/^@/,"")}}))} placeholder="e.g. malakzai"/>
      <label>Announcement</label><textarea value={draft.settings.announcement} onChange={e=>setDraft(s=>({...s,settings:{...s.settings,announcement:e.target.value}}))}/>
      <button className="gold-button" type="button" onClick={saveSettings}><Check/> Save All Settings</button>
      <button className="danger-button" type="button" onClick={reset}><RefreshCw/> Reload from Database</button>
    </section>}
  </>
}

function SheetLayer({type,close,state,setState,notify,depositMethods,withdrawMethods,name,username,tgId}:any){
  if(type==="notifications")return <Modal close={close}><div className="sheet-head"><div><small>AFGLION</small><h3>Notifications</h3></div><button onClick={close}><X/></button></div><section className="notice-list"><div><Bell/><span><b>Welcome to AFGlion</b><small>Your AFGlion dashboard is ready.</small></span></div><div><ShieldCheck/><span><b>Security</b><small>Your account activity and controls are available from the dashboard.</small></span></div></section></Modal>;
  if(type==="profile")return <Modal close={close}><div className="sheet-head"><div><small>ACCOUNT</small><h3>My Profile</h3></div><button onClick={close}><X/></button></div><section className="profile-card"><span className="profile-avatar"><UserRound/></span><h3>{name}</h3><p>{username?"@"+username:"No username"}</p><div><span>Telegram ID</span><b>{tgId||"Browser preview"}</b></div><div><span>Currency</span><b>{state.settings.currency}</b></div></section></Modal>;
  return <MoneyForm type={type} close={close} state={state} setState={setState} notify={notify} methods={type==="deposit"?depositMethods:withdrawMethods} name={name} username={username} tgId={tgId}/>;
}

function MoneyForm({type,close,state,setState,notify,methods,name,username,tgId}:any){
  const [amount,setAmount]=useState("");
  const [method,setMethod]=useState(methods[0]?.id||"");
  const [reference,setReference]=useState("");
  const [submitted,setSubmitted]=useState<RequestItem|null>(null);
  const selected=methods.find((x:PaymentMethod)=>x.id===method);
  const deposit=type==="deposit";

  function openAdminChat(req:RequestItem){
    const support=String(state.settings.supportUsername||"").trim().replace(/^@/,"");
    const details=`AFGlion Deposit Request\nRequest ID: ${req.id}\nAmount: ${money(req.amount)}\nMethod: ${req.method}\nTXID: ${req.reference}`;
    navigator.clipboard?.writeText(details).catch(()=>{});
    const w=(window as any).Telegram?.WebApp;
    if(support){
      const url="https://t.me/"+support;
      if(w?.openTelegramLink)w.openTelegramLink(url); else window.open(url,"_blank");
      return;
    }
    const share="https://t.me/share/url?url="+encodeURIComponent("https://t.me/Afglionbot")+"&text="+encodeURIComponent(details+"\n\nPlease send your payment screenshot to the admin.");
    if(w?.openTelegramLink)w.openTelegramLink(share); else window.open(share,"_blank");
  }

  async function submit(e:React.FormEvent){
    e.preventDefault();
    const value=Number(amount);
    const min=deposit?state.settings.minDeposit:state.settings.minWithdraw;
    const max=deposit?state.settings.maxDeposit:state.settings.maxWithdraw;
    if(!value||value<min||value>max){notify("Amount must be between "+money(min)+" and "+money(max));return}
    if(!selected){notify("Choose a payment method");return}
    if(!reference.trim()){notify(deposit?"Enter payment reference / TXID":"Enter account / wallet details");return}
    if(!deposit&&state.balance<value){notify("Insufficient balance");return}
    const req:RequestItem={id:uid("req"),type:deposit?"deposit":"withdraw",amount:value,method:selected.name,reference:reference.trim(),status:"pending",createdAt:now(),userName:name||"AFGlion User",username:username||"",telegramId:Number(tgId||0)};
    const nextBalance=deposit?state.balance:state.balance-value;
    const nextRequests=[req,...state.requests];
    setState((s:AppState)=>({...s,balance:nextBalance,users:s.users.map(u=>u.telegramId===Number(tgId||0)?{...u,balance:nextBalance}:u),requests:nextRequests}));
    if(Number(tgId||0)>0){
      await saveRemoteUser(Number(tgId),{balance:nextBalance,requests:nextRequests}).catch(()=>{});
    }
    if(deposit){setSubmitted(req);notify("Deposit request created")}else{notify("Withdrawal request created");close()}
  }

  if(submitted)return <Modal close={close}>
    <section className="deposit-success">
      <span className="success-icon"><Check/></span>
      <small>REQUEST CREATED</small>
      <h3>Send your payment screenshot to the admin</h3>
      <p>Your deposit stays pending until the admin checks your screenshot and TXID.</p>
      <div className="request-id-box"><span>Request ID</span><b>{submitted.id}</b><button type="button" onClick={()=>{navigator.clipboard?.writeText(submitted.id);notify("Request ID copied")}}><Copy/> Copy</button></div>
      <div className="deposit-summary"><div><span>Amount</span><b>{money(submitted.amount)}</b></div><div><span>Method</span><b>{submitted.method}</b></div><div><span>TXID</span><b>{submitted.reference}</b></div></div>
      <button className="gold-button" type="button" onClick={()=>openAdminChat(submitted)}><Radio/> Send Screenshot to Admin</button>
      <button className="soft-button" type="button" onClick={close}>Done</button>
    </section>
  </Modal>;

  return <Modal close={close}><form className="money-form" onSubmit={submit}>
    <div className="sheet-head"><div><small>{deposit?"FUND WALLET":"REQUEST PAYOUT"}</small><h3>{deposit?"New Deposit":"New Withdrawal"}</h3></div><button type="button" onClick={close}><X/></button></div>
    <section className="amount-box"><span>Amount ({state.settings.currency})</span><div><b>{state.settings.currencySymbol}</b><input autoFocus inputMode="decimal" value={amount} onChange={e=>setAmount(e.target.value)} placeholder="0"/></div><small>Min {money(deposit?state.settings.minDeposit:state.settings.minWithdraw)} • Max {money(deposit?state.settings.maxDeposit:state.settings.maxWithdraw)}</small></section>
    <label>Payment Method</label><div className="method-picks">{methods.map((m:PaymentMethod)=><button type="button" className={method===m.id?"active":""} key={m.id} onClick={()=>setMethod(m.id)}>{m.name.toLowerCase().includes("momo")?<Smartphone/>:<Landmark/>}<span><b>{m.name}</b><small>{m.kind}</small></span><i/></button>)}</div>
    {selected&&<><section className="payment-number-card"><small>{selected.name} ACCOUNT / NUMBER</small><div><b>{selected.number||"Not configured"}</b><button type="button" disabled={!selected.number} onClick={()=>{if(selected.number){navigator.clipboard?.writeText(selected.number);notify("Payment number copied")}}}><Copy/> Copy</button></div></section><section className="method-info"><ShieldCheck/><span>{selected.details||"Follow the payment instructions shown above."}</span></section></>}
    <label>{deposit?"Payment reference / TXID":"Account / wallet details"}</label><input value={reference} onChange={e=>setReference(e.target.value)} placeholder={deposit?"Enter reference / TXID":"Enter payout details"}/>
    {deposit&&<section className="screenshot-instruction"><Radio/><div><b>Screenshot verification</b><span>After submitting this request, send your payment screenshot to the admin in Telegram.</span></div></section>}
    <button className="gold-button" type="submit">{deposit?<ArrowDownToLine/>:<ArrowUpFromLine/>} Submit {deposit?"Deposit":"Withdrawal"}</button>
  </form></Modal>
}

function ConfirmPlan({plan,balance,close,confirm}:{plan:Plan;balance:number;close:()=>void;confirm:()=>void}){
  return <Modal close={close}><div className="sheet-head"><div><small>CONFIRM</small><h3>Activate {plan.name}</h3></div><button onClick={close}><X/></button></div><section className="confirm-plan"><span className="big-crown"><Crown/></span><h2>{money(plan.price)}</h2><p>{plan.durationDays} days • {money(plan.dailyReward)} admin-configured daily reward</p><div><span>Your balance</span><b>{money(balance)}</b></div></section><button className="gold-button" type="button" onClick={confirm}><Zap/> Confirm Activation</button></Modal>
}

function Modal({children,close}:{children:React.ReactNode;close:()=>void}){
  return <motion.div className="modal-backdrop" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} onMouseDown={close}><motion.div className="modal-sheet" initial={{y:60,opacity:0}} animate={{y:0,opacity:1}} exit={{y:60,opacity:0}} transition={{type:"spring",damping:24,stiffness:260}} onMouseDown={e=>e.stopPropagation()}>{children}</motion.div></motion.div>
}

function Nav({active,label,icon,onClick}:{active:boolean;label:string;icon:React.ReactNode;onClick:()=>void}){
  return <button type="button" className={"nav-item "+(active?"active":"")} onClick={onClick}>{icon}<span>{label}</span>{active&&<motion.i layoutId="nav-dot"/>}</button>
}
function Quick({icon,title,sub,onClick}:{icon:React.ReactNode;title:string;sub:string;onClick:()=>void}){
  return <motion.button whileTap={{scale:.96}} type="button" onClick={onClick}><span>{icon}</span><b>{title}</b><small>{sub}</small></motion.button>
}
function Metric({title,value,sub}:{title:string;value:string;sub:string}){
  return <article className="metric"><span>{title}</span><b>{value}</b><small>{sub}</small></article>
}
function SectionTitle({title,action,onClick}:{title:string;action?:string;onClick?:()=>void}){
  return <div className="section-title"><h3>{title}</h3>{action&&<button type="button" onClick={onClick}>{action}<ChevronRight/></button>}</div>
}
function PageHead({eyebrow,title,icon}:{eyebrow:string;title:string;icon:React.ReactNode}){
  return <section className="page-head"><div><small>{eyebrow}</small><h1>{title}</h1></div><motion.span animate={{rotate:[0,5,-5,0]}} transition={{repeat:Infinity,duration:4}}>{icon}</motion.span></section>
}
function TransactionRow({item}:{item:Tx}){
  return <section className="tx-row"><span className={item.amount>=0?"tx-icon plus":"tx-icon minus"}>{item.amount>=0?<ArrowDownToLine/>:<ArrowUpFromLine/>}</span><div><b>{item.type.replaceAll("_"," ")}</b><small>{new Date(item.createdAt).toLocaleDateString()} • {item.status}{item.note?" • "+item.note:""}</small></div><strong className={item.amount>=0?"positive":"negative"}>{item.amount>=0?"+":""}{money(item.amount)}</strong></section>
}
function EmptyState({icon,title,text}:{icon:React.ReactNode;title:string;text:string}){
  return <section className="empty-state">{icon}<b>{title}</b><span>{text}</span></section>
}
