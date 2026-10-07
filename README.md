# AFGlion Telegram Mini App

Premium Telegram-only Mini App foundation for AFGlion.

## Stack
- Next.js
- React
- Firebase Firestore + Storage
- Framer Motion
- Telegram WebApp SDK

## Main sections
- Dashboard
- VIP
- Referral
- Wallet
- Admin foundation (next phase)

## Telegram-only access
The client checks for Telegram WebApp init data and blocks ordinary browser access.

## Setup
1. Copy `.env.example` to `.env.local`.
2. Add Firebase web app values.
3. Run `npm install`.
4. Run `npm run dev`.

## Important production note
Client-side Telegram checks improve UX but are not sufficient for high-security authorization by themselves. Sensitive Firebase writes must also be protected with Firebase Security Rules and verified Telegram identity logic before production.
