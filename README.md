# AFGlion — Telegram Mini App

AFGlion is a Telegram-only Firebase Mini App with a premium black/gold interface.

## Completed modules
- Dashboard with live wallet, VIP profit and referral stats
- VIP packages loaded from Firestore
- VIP purchase with transactional wallet deduction
- Daily VIP reward claim based on completed 24-hour periods
- Referral start parameter and personal Telegram Mini App link
- Manual deposit requests
- Manual withdrawal requests with balance reservation
- Transaction history
- Admin control center
- Admin VIP create / enable / disable
- Admin deposit approve / reject
- Admin withdrawal approve / reject + automatic refund on rejection
- Users list
- Telegram-only client gate
- Firestore rules template
- Firebase Storage initialization

## Environment
Copy `.env.example` to `.env.local` or add the same variables in Vercel.

Required final values:
- `NEXT_PUBLIC_ADMIN_TELEGRAM_ID` — Telegram numeric ID of the admin
- `NEXT_PUBLIC_BOT_USERNAME` — bot username without @

## Firebase Console setup
1. Create Firestore Database.
2. Create Storage if proof uploads are later enabled.
3. Deploy `firestore.rules`.
4. Add the web app environment variables to Vercel.
5. Add the deployed HTTPS URL as the Telegram Mini App URL.

## Authentication / security
The included Firestore rules are designed for a future trusted Firebase Auth token carrying `telegram_id` and `admin` claims. A browser cannot securely verify Telegram initData by itself because Telegram verification requires a trusted secret. Therefore, do not open Firestore rules to public writes in production. If the project must remain strictly backend-free, Firebase client-only writes cannot simultaneously provide strong identity/security for real-money balances.

## Financial note
VIP rewards and money-like balances should be reviewed for applicable financial, consumer-protection, and local regulatory requirements before production launch.
