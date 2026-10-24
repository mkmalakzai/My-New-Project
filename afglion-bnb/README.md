# AFGlion BNB

Separate BNB-denominated AFGlion app scaffold, built with Next.js and Firebase Realtime Database.

## Run
1. `cd afglion-bnb && npm install`
2. Copy `.env.example` to `.env.local` and configure a **dedicated Firebase project**.
3. `npm run dev`

Deposit/withdraw requests are manual-review only. This app uses an internal BNB ledger and does not send blockchain transactions. Secure Firebase Auth/Rules and trusted server-side admin verification are required before real funds or public deployment.