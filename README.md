# Telegram Reward Mini App

এই starter project-এ আছে:
- Telegram Mini App login/identity validation
- 1 ad = 1 point
- 3.2 points = ৳1
- 7-second server-side minimum completion time
- একই ad পরপর সম্পূর্ণ করা blocked
- active ads cycle করে দেখানোর logic
- Dashboard
- bKash withdrawal UI, কিন্তু default-এ OFF
- Admin settings API

## 1. Install
Node.js 20+ ব্যবহার করুন:
npm install

## 2. Environment
BOT_TOKEN=আপনার_Telegram_Bot_Token
ADMIN_KEY=একটি_শক্তিশালী_admin_key
ADOPERATOR_LINK=আপনার_অনুমোদিত_AdOperator_link

## 3. Run
npm start

## 4. Telegram
BotFather-এ Mini App-এর HTTPS URL সেট করুন। Production-এ অবশ্যই HTTPS ব্যবহার করুন।

## 5. Withdraw
Default:
withdrawEnabled = false
minimumWithdrawTaka = null

পরে admin API দিয়ে ON করা যাবে।

## গুরুত্বপূর্ণ
AdOperator-এর publisher terms/traffic rules অনুযায়ী reward model ও incentivized traffic অনুমোদিত কি না নিশ্চিত করুন। এই project কোনো ad-network tracking/validation bypass করে না। বাহ্যিক ad completion নিজে থেকে verify করা সম্ভব নয় যদি provider callback/postback না দেয়; তাই production-এ provider-supported callback/postback থাকলে সেটি ব্যবহার করা উচিত।


## Configured AdOperator links
- https://wwpb.giriuvan.com/redirect-zone/b390f67e
- https://wwpb.giriuvan.com/redirect-zone/9bda9b70
- https://wwpb.giriuvan.com/redirect-zone/c837d897
- https://wwpb.giriuvan.com/redirect-zone/55a30fbe
- https://wwpb.giriuvan.com/redirect-zone/135ac394
