# AFGlion Firebase activation

The web build deploys on Vercel, but secure money actions run on Firebase Functions.

1. In Firebase Console for `afglion-47b07`, open **Authentication** and click **Get started**.
2. Set the Telegram bot token as a Firebase secret (never commit it):

```bash
firebase functions:secrets:set TELEGRAM_BOT_TOKEN --project afglion-47b07
```

3. Deploy the trusted backend and rules:

```bash
firebase deploy --only functions,firestore:rules,storage --project afglion-47b07
```

After deployment, reopen the Mini App from @Afglionbot. Telegram login is verified server-side and Deposit, Withdraw, VIP/Stake, Claim, Admin settings, and referral commission actions become active.

Default app configuration:
- Currency: AFN
- Deposit/withdraw methods: HESAB PAY, MOMO
- Referral commission: 5% of referred user's VIP activation (admin editable)
- Deposit limits: 100–100,000 AFN
- Withdrawal limits: 100–50,000 AFN

All values can be changed from Admin Panel → Settings.
