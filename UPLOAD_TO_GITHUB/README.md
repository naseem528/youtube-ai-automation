# YouTube AI Automation to Facebook (n8n)

YouTube Public Channels (၅၀) ခုမှ အသစ်တင်သော ဗီဒီယိုများကို စောင့်ကြည့်ပြီး AI ဖြင့် မြန်မာဘာသာ Facebook Post ပြင်ဆင်ကာ Telegram မှတစ်ဆင့် Admin အတည်ပြုချက် (Approval) ရယူပြီး Facebook Page သို့ အလိုအလျောက် တင်ပေးမည့် စနစ်ဖြစ်ပါသည်။

---

## ၁။ Project Architecture (စနစ်၏ အလုပ်လုပ်ပုံ အဆင့်ဆင့်)

```
[YouTube Channels 50 ခု]
         │ (စစ်ဆေးခြင်း - YouTube RSS Feed နည်းလမ်း - Free & Unlimited)
         ▼
[n8n Automation Trigger]
         │
         ▼
[Deduplication Check (ဗီဒီယို အဟောင်း/အသစ် စစ်ဆေးခြင်း)]
         ├── ရှိပြီးသားဗီဒီယို (Duplicate) ───► ကျော်သွားမည် (Skip)
         └── ဗီဒီယိုအသစ်ဖြစ်ပါက (New)
                     │
                     ▼
       [AI Content Generation (Gemini AI)]
       (မြန်မာဘာသာဖြင့် ဆွဲဆောင်မှုရှိသော Facebook Post ရေးသားခြင်း)
                     │
                     ▼
       [Telegram Bot Approval Request]
       (ဖုန်းထဲရှိ Telegram Bot သို့ Post အကြမ်းနှင့် ခလုတ် ၂ ခု ရောက်လာခြင်း)
                     │
       ┌─────────────┴─────────────┐
       ▼                           ▼
[❌ Reject ခလုတ်]           [✅ Approve ခလုတ်]
       │                           │
       ▼                           ▼
(ဖျက်သိမ်းပြီး သတိပေးမည်)      [Facebook Graph API]
                                   │
                                   ▼
                       (Facebook Page ပေါ်သို့ တင်ခြင်း)
                                   │
                                   ▼
                       [အောင်မြင်ကြောင်း Telegram သို့ အကြောင်းကြားမည်]
```

---

## ၂။ Project Folder Structure (ဖိုင်တွဲများ ဖွဲ့စည်းပုံ)

```
YouTube_AI_Automation/
├── docker-compose.yml                 # Docker Desktop ဖြင့် n8n run ရန် configuration
├── start_docker.bat                   # Docker ဖြင့် n8n စတင်/ရပ်တန့်ရန် 1-Click Launcher
├── start_n8n.bat                      # Node.js ဖြင့် n8n ဖွင့်ရန် 1-Click Launcher
├── .env.example                       # လိုအပ်မည့် API Keys နမူနာပုံစံ
├── .gitignore                         # လျှို့ဝှက်ချက်များနှင့် Cache များ မပေါက်ကြားစေရန် စာရင်း
├── README.md                          # စနစ်တစ်ခုလုံး၏ လမ်းညွှန်ချက် (မြန်မာဘာသာ)
├── config/
│   └── channels.json                  # စောင့်ကြည့်မည့် YouTube Channel ၅၀ စာရင်း
├── prompts/
│   ├── editorial_style_guide.md       # ပညာရှင်ဆန်သော တသမတ်တည်း မြန်မာစာ အရေးအသား စံသတ်မှတ်ချက်
│   └── fb_post_template.txt           # AI အား မြန်မာဘာသာ Post ရေးခိုင်းမည့် Prompt
├── workflows/
│   └── youtube_ai_automation_v1.json  # n8n သို့ တိုက်ရိုက် Import လုပ်ရမည့် Workflow JSON
└── data/
    └── .gitkeep                       # ဗီဒီယိုမှတ်တမ်း Data သိမ်းမည့် နေရာ
```

---

## ၃။ လိုအပ်သော API Keys များ ပြင်ဆင်နည်း (Step-by-Step)

### (က) Telegram Bot ပြင်ဆင်ခြင်း (၂ မိနစ်ခန့်)
1. Telegram အက်ပ်တွင် `@BotFather` ကို ရှာပြီး `/newbot` ဟု ရိုက်ပို့ပါ။
2. Bot အမည်နှင့် Username သတ်မှတ်ပေးပြီးပါက ရရှိလာသော **HTTP API Token** ကို ကူးယူထားပါ။
3. မိမိ၏ Telegram **Chat ID** ကို သိရှိရန် Telegram တွင် `@userinfobot` ကို စကားပြောပြီး မိမိ၏ ID နံပါတ်ကို ကူးယူပါ။

### (ခ) Google Gemini AI Key ရယူခြင်း (အခမဲ့)
1. [Google AI Studio](https://aistudio.google.com/) သို့ သွားရောက်ပြီး Google Account ဖြင့် Sign in ဝင်ပါ။
2. **Get API Key** ကို နှိပ်ပြီး API Key တစ်ခု ထုတ်ယူပါ။

### (ဂ) Facebook Page Graph API Token ရယူခြင်း
1. [Facebook Developers Portal](https://developers.facebook.com/) တွင် App တစ်ခု ပြုလုပ်ပါ။
2. **Graph API Explorer** တွင် မိမိ Page ကို ရွေးချယ်ပြီး `pages_manage_posts`, `pages_read_engagement` Permissions ပေးကာ **Page Access Token** ထုတ်ယူပါ။
3. မိမိ Facebook Page ၏ **Page ID** ကို ကူးယူထားပါ။

---

## ၄။ မြန်မာနိုင်ငံ Facebook Peak Hours (တစ်ရက်လျှင် Post ၅ ခု တင်မည့် အချိန်ဇယား)

မြန်မာနိုင်ငံတွင် Facebook အသုံးပြုသူ လူဦးရေ အများဆုံး လှုပ်ရှားတက်ကြွသည့် အချိန် (Peak Hours) များကို အခြေခံ၍ n8n တွင် မြန်မာစံတော်ချိန် (`Asia/Yangon`) ဖြင့် တစ်နေ့လျှင် (၅) ကြိမ် အလိုအလျောက် အလုပ်လုပ်ရန် သတ်မှတ်ထားပါသည်-

1. **နံနက် ၀၈:၀၀ နာရီ (08:00 AM) - Morning Start & Commute:**  
   အိပ်ရာထချိန်၊ နံနက်စာစားချိန်နှင့် အလုပ်မစမီ လူအများ သတင်းနှင့် အကြောင်းအရာများ ဖွင့်ဖတ်ချိန်။
2. **နေ့လယ် ၁၂:၀၀ နာရီ (12:00 PM) - Lunch Break:**  
   နေ့လယ်စာစားချိန်နှင့် အလုပ်နားချိန်အတွင်း ဖုန်းအသုံးများဆုံးအချိန်။
3. **ညနေ ၀၅:၀၀ နာရီ (05:00 PM) - Evening Tea & Off-Work:**  
   အလုပ်ဆင်းချိန်၊ အိမ်အပြန်လမ်းနှင့် လက်ဖက်ရည်ဆိုင်ထိုင်ချိန်။
4. **ည ၀၈:၀၀ နာရီ (08:00 PM) - Prime Time (အဓိက အချိန်):**  
   ညစာစားပြီး မိသားစု အပန်းဖြေချိန်၊ Facebook ပေါ်တွင် လူအများဆုံးနှင့် Engagement အမြင့်ဆုံးအချိန်။
5. **ည ၁၀:၀၀ နာရီ (10:00 PM) - Bedtime Scrolling:**  
   အိပ်ရာမဝင်မီ သာသနာ့တရားတော်များနှင့် စိတ်အေးချမ်းဖွယ်ရာ အကြောင်းအရာများ ဖတ်ရှုချိန်။

---

## ၅။ n8n Workflow သို့ ထည့်သွင်း အသုံးပြုပုံ (Import Guide)

1. မိမိ၏ n8n Dashboard သို့ ဝင်ရောက်ပါ။
2. ညာဘက်အပေါ်ထောင့်ရှိ **Add workflow** (သို့မဟုတ် **...** icon) ကို နှိပ်ပြီး **Import from File** ကို ရွေးချယ်ပါ။
3. ဤ Project ထဲရှိ `workflows/youtube_ai_automation_v1.json` ဖိုင်ကို ရွေးချယ်ပေးလိုက်ပါက Workflow တစ်ခုလုံး အသင့်ရောက်ရှိလာမည် ဖြစ်ပါသည်။
4. n8n Environment Variables သို့မဟုတ် Node များထဲတွင် သက်ဆိုင်ရာ Keys များ ထည့်သွင်းပေးနိုင်ပါသည်။
