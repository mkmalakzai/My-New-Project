# AFGlion Firestore Schema

## users/{telegramId}
- telegramId
- firstName
- username
- photoUrl
- balance
- totalVipProfit
- referralEarnings
- referredBy
- isBanned
- isAdmin
- createdAt

## vipPlans/{planId}
- name
- price
- dailyReward
- durationDays
- badge
- active
- createdAt

## vipPurchases/{purchaseId}
- userTelegramId
- planId
- planName
- price
- dailyReward
- durationDays
- startAt
- endAt
- status
- claimedReward

## deposits/{requestId}
- userTelegramId
- amount
- method
- txid
- proofUrl
- status
- createdAt

## withdrawals/{requestId}
- userTelegramId
- amount
- method
- destination
- status
- createdAt

## referrals/{referralId}
- inviterTelegramId
- invitedTelegramId
- reward
- status
- createdAt

## transactions/{transactionId}
- userTelegramId
- type
- amount
- status
- referenceId
- createdAt

## settings/app
- referralReward
- depositInstructions
- paymentMethods

## Security note
Telegram WebApp init data must be verified by trusted server-side or callable-function logic before sensitive balance, VIP, deposit, withdrawal, or admin mutations are enabled.
