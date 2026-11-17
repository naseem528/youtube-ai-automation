const http = require('http');
const https = require('https');
const fs = require('fs');
const querystring = require('querystring');
const { YoutubeTranscript } = require('youtube-transcript');
const { createTailoredThumbnail } = require('./make_thumbnail');

// Configuration & Environment Variables
const PORT = process.env.PORT || 3000;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'AQ.Ab8RN6K1b8mDknhOA00LChCAOk-AdbVr1kNqfEx3UHxyEtmJ3A';
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-flash-lite-latest';
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '9091301017:AAGHX8oYlRbCqU1wduPM4-KbleOyA_pQHQE';
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || '1134569247';
const FACEBOOK_PAGE_ID = process.env.FACEBOOK_PAGE_ID || '111095951401584';
const FACEBOOK_PAGE_ACCESS_TOKEN = process.env.FACEBOOK_PAGE_ACCESS_TOKEN || 'EAAYI68H9Hs8BTEiv1QeUL1WN1VhTzdhaJ8w65QdSU0kE9DNZAIU4WHXFqba4ZCa1Dha3icafOY1y3k4o2ncpPTCXTW2JngcURJClPHeTZBpTribKgTNBYywm6s56YtXSRw39zUrpiaV0ra590arbDWUXplnGidTZAZB7wPyNzgf4JZBZAMlGNZAl01XWEhNDT4CANlEuW9cZD';

// State
let channels = [];
try {
  channels = JSON.parse(fs.readFileSync('config/channels.json', 'utf8')).filter(c => c.active);
} catch (e) {
  console.log('Channels config loaded from fallback');
}

let processedVideoIds = new Set();
let pendingPost = {
  text: '',
  title: '',
  thumbnailPath: 'test_thumbnail_final.jpg',
  isWaitingForEdit: false
};

// Helper: HTTP GET
function httpsGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => {
        try { resolve(JSON.parse(body)); } catch (e) { resolve(body); }
      });
    }).on('error', reject);
  });
}

// Helper: HTTP POST JSON
function httpsPost(url, data) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const postData = typeof data === 'string' ? data : JSON.stringify(data);
    const req = https.request({
      protocol: u.protocol,
      hostname: u.hostname,
      port: u.port,
      path: u.pathname + u.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    }, (res) => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => {
        try { resolve(JSON.parse(body)); } catch (e) { resolve(body); }
      });
    });
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

// Send Telegram Message
function sendTelegramMessage(chatId, text, replyMarkup = null) {
  const payload = { chat_id: chatId, text: text };
  if (replyMarkup) payload.reply_markup = replyMarkup;
  return httpsPost(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, payload);
}

// Send Telegram Local Photo
async function sendTelegramLocalPhoto(chatId, filePath, caption = '') {
  const fileBytes = fs.readFileSync(filePath);
  const blob = new Blob([fileBytes], { type: 'image/jpeg' });
  const form = new FormData();
  form.append('chat_id', chatId);
  form.append('photo', blob, 'thumbnail.jpg');
  if (caption) form.append('caption', caption);

  const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendPhoto`, {
    method: 'POST',
    body: form
  });
  return res.json();
}

// Post to Facebook with Local Photo
async function postToFacebookWithLocalPhoto(message, filePath) {
  const fileBytes = fs.readFileSync(filePath);
  const blob = new Blob([fileBytes], { type: 'image/jpeg' });
  const form = new FormData();
  form.append('source', blob, 'thumbnail.jpg');
  form.append('caption', message);
  form.append('access_token', FACEBOOK_PAGE_ACCESS_TOKEN);

  const res = await fetch(`https://graph.facebook.com/v21.0/${FACEBOOK_PAGE_ID}/photos`, {
    method: 'POST',
    body: form
  });
  return res.json();
}

// Core Pipeline: Check for new video and generate post
async function runAutomationPipeline() {
  console.log('--- RUNNING AUTOMATION PIPELINE ---');
  if (!channels || channels.length === 0) return;

  for (const channel of channels) {
    try {
      console.log(`Checking channel: ${channel.name}...`);
      const rss = await httpsGet(channel.rss_url);
      const xml = typeof rss === 'string' ? rss : JSON.stringify(rss);
      const entryMatch = xml.match(/<entry>[\s\S]*?<\/entry>/);
      if (!entryMatch) continue;

      const videoId = entryMatch[0].match(/<yt:videoId>(.*?)<\/yt:videoId>/)[1];
      const videoTitle = entryMatch[0].match(/<title>(.*?)<\/title>/)[1];

      if (processedVideoIds.has(videoId)) continue;
      processedVideoIds.add(videoId);

      console.log(`Found new video: "${videoTitle}" (${videoId})`);

      // Fetch Transcript
      let transcriptText = '';
      try {
        const transcriptItems = await YoutubeTranscript.fetchTranscript(videoId);
        transcriptText = transcriptItems.map(t => t.text).join(' ');
      } catch (err) {
        transcriptText = videoTitle;
      }
      if (transcriptText.length > 5000) transcriptText = transcriptText.substring(0, 5000);

      // Gemini AI Prompt
      const systemPrompt = `You are an elite Islamic intellectual writer creating high-quality, long-form Facebook posts for Myanmar readers.
Follow these editorial rules strictly:
1. Write a complete, full-length, in-depth post (around 1,800 to 2,500 Myanmar characters). Never leave it unfinished!
2. Strict 5-part structure:
   - Part 1: ခေါင်းစဉ် (Captivating Headline)
   - Part 2: နိဒါန်းအဖွင့် (Thought-provoking opening on modern society)
   - Part 3: ဉာဏပိုင်းဆိုင်ရာ အငြင်းပွားမှုများနှင့် သာသနာ့အထောက်အထားများ (Include Quran/Hadith in original Arabic with Tashkeel, followed by Burmese translation and reference)
   - Part 4: လက်တွေ့ဘဝတွင် အသုံးချနိုင်မည့် အစ္စလာမ့်လမ်းညွှန်ချက်များ (Practical takeaways for daily interactions)
   - Part 5: နိဂုံးချုပ်နှင့် ဒုအာ (Inspiring conclusion and concluding Dua)
3. Do NOT mention the scholar's name or YouTube channel name.
4. Do NOT include YouTube links or URLs.
5. High quality, natural Myanmar Unicode prose.
6. At the very end, on a new line, output:
[IMAGE_PROMPT: Detailed visual description of a serene, aesthetic Islamic art scene in 16:9, warm ambient light, no human faces]
[POST_TITLE: Short Myanmar Headline under 45 characters]`;

      const userPrompt = `ဗီဒီယိုခေါင်းစဉ်: ${videoTitle}\nဗီဒီယိုအကြောင်းအရာ:\n${transcriptText}\n\nဆောင်းပါးအပြည့်အစုံကို ရေးသားပေးပါ။`;

      const geminiRes = await httpsPost(
        `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
        {
          contents: [{ parts: [{ text: systemPrompt + '\n\n' + userPrompt }] }],
          generationConfig: { maxOutputTokens: 3000, temperature: 0.7 }
        }
      );

      const candidate = geminiRes.candidates[0];
      let rawText = candidate.content.parts.map(p => p.text).filter(Boolean).join('').trim();

      // Extract image prompt and title
      let imagePrompt = 'A serene and aesthetic Islamic library, warm morning sunlight, Quranic manuscripts on wooden desks, peaceful scholarly ambiance, digital painting, 16:9 widescreen';
      let cleanTitle = videoTitle;

      const imgMatch = rawText.match(/\[IMAGE_PROMPT:\s*([\s\S]*?)\]/);
      if (imgMatch) {
        imagePrompt = imgMatch[1].trim();
        rawText = rawText.replace(imgMatch[0], '').trim();
      }

      const titleMatch = rawText.match(/\[POST_TITLE:\s*([\s\S]*?)\]/);
      if (titleMatch) {
        cleanTitle = titleMatch[1].trim();
        rawText = rawText.replace(titleMatch[0], '').trim();
      } else {
        // extract from headline
        const firstLine = rawText.split('\n')[0].replace(/[#*]/g, '').trim();
        if (firstLine.length > 5) cleanTitle = firstLine;
      }

      // Generate Tailored AI Image with Pollinations.ai
      const rawImageUrl = 'https://image.pollinations.ai/prompt/' + encodeURIComponent(imagePrompt) + '?width=1280&height=720&nologo=true';
      const thumbnailPath = `thumb_${Date.now()}.jpg`;

      console.log('Generating tailored thumbnail with title overlay...');
      await createTailoredThumbnail(cleanTitle, rawImageUrl, thumbnailPath);

      pendingPost = {
        text: rawText,
        title: cleanTitle,
        thumbnailPath: thumbnailPath,
        isWaitingForEdit: false
      };

      // Send to Telegram Admin
      await sendTelegramLocalPhoto(
        TELEGRAM_CHAT_ID,
        thumbnailPath,
        `🎨 [ခေါင်းစဉ်ပါသော သီးသန့် AI တာမနေးလ်]\n📌 ${cleanTitle}`
      );

      const telegramText = `📢 [ခွင့်ပြုချက်တောင်းခံခြင်း - YouTube AI Automation]\n\n` +
        `📌 ခေါင်းစဉ်: ${cleanTitle}\n\n` +
        `📝 ရေးသားထားသော Post အပြည့်အစုံ:\n` +
        `────────────────────\n` +
        `${rawText}\n` +
        `────────────────────\n\n` +
        `အထက်ပါ တာမနေးလ်နှင့် စာမူအား Facebook Page ပေါ်သို့ တင်ရန် အတည်ပြုပါသလားခင်ဗျာ?`;

      const keyboard = {
        inline_keyboard: [
          [
            { text: '✅ တိုက်ရိုက်တင်မည် (Approve)', callback_data: 'approve_live_post' },
            { text: '✏️ စာသားပြင်မည် (Edit)', callback_data: 'edit_live_post' },
            { text: '❌ ပယ်ဖျက်မည် (Reject)', callback_data: 'reject_live_post' }
          ]
        ]
      };

      await sendTelegramMessage(TELEGRAM_CHAT_ID, telegramText, keyboard);
      console.log('Successfully sent approval request to Telegram!');
      break; // Process one video per scheduled run
    } catch (err) {
      console.error(`Error processing channel ${channel.name}:`, err.message);
    }
  }
}

// Scheduled check: Runs every minute and checks if matches Myanmar Peak Hours
let lastRunHour = -1;
function checkSchedule() {
  const myanmarDate = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Yangon' }));
  const hour = myanmarDate.getHours();
  const minute = myanmarDate.getMinutes();

  // Peak Hours: 08:00, 12:00, 17:00, 20:00, 22:00
  const targetHours = [8, 12, 17, 20, 22];

  if (targetHours.includes(hour) && minute === 0 && lastRunHour !== hour) {
    lastRunHour = hour;
    console.log(`⏰ Triggering scheduled run for ${hour}:00 Myanmar Time!`);
    runAutomationPipeline().catch(console.error);
  }
}

// Telegram Bot Polling Loop
async function pollTelegram() {
  let offset = 0;
  while (true) {
    try {
      const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getUpdates?offset=${offset}&timeout=10`);
      const json = await res.json();
      if (json && json.ok && json.result && json.result.length > 0) {
        for (const update of json.result) {
          offset = update.update_id + 1;

          // Callback button
          if (update.callback_query) {
            const cb = update.callback_query;
            const data = cb.data;
            const chatId = cb.message.chat.id;

            if (data === 'approve_live_post') {
              await httpsPost(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/answerCallbackQuery`, {
                callback_query_id: cb.id,
                text: 'အတည်ပြုပြီးပါပြီ! Facebook သို့ တင်နေပါသည်...'
              });

              const fbRes = await postToFacebookWithLocalPhoto(pendingPost.text, pendingPost.thumbnailPath);
              if (fbRes.id || fbRes.post_id) {
                await sendTelegramMessage(
                  chatId,
                  `🎉 အောင်မြင်ပါသည်!\n\nခေါင်းစဉ်ပါသော AI တာမနေးလ်နှင့် စာမူအား Facebook Page (NS Puzzle Lighthouse - ပဟေဠိမီးပြတိုက်) ပေါ်သို့ အောင်မြင်စွာ တင်လိုက်ပါပြီခင်ဗျာ!\n\nPost ID: ${fbRes.post_id || fbRes.id}\nLink: https://www.facebook.com/111095951401584`
                );
              } else {
                await sendTelegramMessage(chatId, `⚠️ Facebook ပေါ်သို့ တင်ရာတွင် အမှားဖြစ်ပေါ်ခဲ့ပါသည်:\n${JSON.stringify(fbRes)}`);
              }
              pendingPost.isWaitingForEdit = false;

            } else if (data === 'edit_live_post') {
              pendingPost.isWaitingForEdit = true;
              await httpsPost(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/answerCallbackQuery`, {
                callback_query_id: cb.id,
                text: 'စာသားပြင်ဆင်ခြင်း စနစ် ဖွင့်လှစ်လိုက်ပါပြီ'
              });

              await sendTelegramMessage(
                chatId,
                `✏️ **စာသားပြင်ဆင်ရန် ညွှန်ကြားချက်**:\n\n` +
                `အောက်ပါ စာမူကြမ်းကို Copy ယူ၍ မိမိစိတ်ကြိုက် ပြင်ဆင်ပြီး ဤ Bot ထံသို့ စာတိုက်ရိုက် Reply ပြန်ပို့ပေးပါခင်ဗျာ။ ပြန်ပို့လိုက်သော စာသားကို စနစ်က ခေါင်းစဉ်ပါသော AI တာမနေးလ်ပုံနှင့်အတူ Facebook Page ပေါ်သို့ ချက်ချင်း တင်ပေးပါမည်!`
              );
              await sendTelegramMessage(chatId, pendingPost.text);

            } else if (data === 'reject_live_post') {
              await httpsPost(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/answerCallbackQuery`, {
                callback_query_id: cb.id,
                text: 'ပယ်ဖျက်လိုက်ပါပြီ'
              });
              await sendTelegramMessage(chatId, '🚫 အသိပေးချက်:\n\nသင်သည် ဤ Post အား ပယ်ဖျက်လိုက်သဖြင့် Facebook ပေါ်သို့ တင်မည် မဟုတ်ပါခင်ဗျာ။');
              pendingPost.isWaitingForEdit = false;
            }
          }

          // Text reply in edit mode
          if (update.message && update.message.text && pendingPost.isWaitingForEdit) {
            const editedText = update.message.text;
            const chatId = update.message.chat.id;

            await sendTelegramMessage(chatId, '⏳ သင် ပြင်ဆင်ထားသော စာသားအား Facebook Page ပေါ်သို့ တင်နေပါသည်...');
            const fbRes = await postToFacebookWithLocalPhoto(editedText, pendingPost.thumbnailPath);

            if (fbRes.id || fbRes.post_id) {
              await sendTelegramMessage(
                chatId,
                `🎉 အောင်မြင်ပါသည်!\n\nသင် ပြင်ဆင်ထားသော စာသားနှင့် ခေါင်းစဉ်ပါ AI တာမနေးလ်ပုံအား Facebook Page (NS Puzzle Lighthouse - ပဟေဠိမီးပြတိုက်) ပေါ်သို့ အောင်မြင်စွာ တင်လိုက်ပါပြီခင်ဗျာ!\n\nPost ID: ${fbRes.post_id || fbRes.id}\nLink: https://www.facebook.com/111095951401584`
              );
            } else {
              await sendTelegramMessage(chatId, `⚠️ Facebook ပေါ်သို့ တင်ရာတွင် အမှားဖြစ်ပေါ်ခဲ့ပါသည်:\n${JSON.stringify(fbRes)}`);
            }
            pendingPost.isWaitingForEdit = false;
          }
        }
      }
    } catch (e) {
      // ignore network blips
    }
    await new Promise(r => setTimeout(r, 1000));
  }
}

// HTTP Health Check Server
const server = http.createServer((req, res) => {
  if (req.url === '/health' || req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'online',
      message: 'YouTube AI Automation 24/7 Cloud Service is Active',
      targetPage: 'NS Puzzle Lighthouse (111095951401584)',
      time: new Date().toISOString()
    }));
  } else if (req.url === '/trigger-now') {
    runAutomationPipeline();
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Triggered pipeline manually!');
  } else {
    res.writeHead(404);
    res.end();
  }
});

server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
  // Start schedule interval
  setInterval(checkSchedule, 30000);
  // Start telegram bot poller
  pollTelegram().catch(console.error);
});
