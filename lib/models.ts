export type UserDoc={telegramId:number;firstName:string;username?:string;photoUrl?:string;balance:number;totalVipProfit:number;referralEarnings:number;totalReferrals:number;referredBy?:number|null;isBanned:boolean;isAdmin:boolean;createdAt:number};
export type VipPlanDoc={id?:string;name:string;price:number;dailyReward:number;durationDays:number;badge?:string;active:boolean;createdAt:number};
export type VipPurchaseDoc={id?:string;userTelegramId:number;planId:string;planName:string;price:number;dailyReward:number;durationDays:number;startAt:number;endAt:number;status:"active"|"completed"|"cancelled";claimedReward:number;lastClaimAt?:number};
export type DepositRequestDoc={id?:string;userTelegramId:number;amount:number;method:string;txid?:string;proofUrl?:string;status:"pending"|"approved"|"rejected";createdAt:number};
export type WithdrawRequestDoc={id?:string;userTelegramId:number;amount:number;method:string;destination:string;status:"pending"|"approved"|"rejected";createdAt:number;reserved?:boolean};
export type TransactionDoc={id?:string;userTelegramId:number;type:string;amount:number;status:string;referenceId?:string;createdAt:number};
export type PaymentMethod={id:string;name:string;details:string;active:boolean};
export type AppSettingsDoc={currency:string;currencySymbol:string;minDeposit:number;maxDeposit:number;minWithdraw:number;maxWithdraw:number;referralPercent:number;depositInstructions?:string;depositMethods:PaymentMethod[];withdrawMethods:PaymentMethod[];channels:{name:string;url:string}[];supportUsername?:string;botUsername?:string;announcement?:string};
