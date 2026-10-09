# Football Data Sync (সম্পূর্ণ ফ্রি)

এই ফোল্ডারটা আলাদা একটা **public** GitHub রিপোতে রাখতে হবে। GitHub Actions প্রতি ১৫ মিনিটে
football-data.org থেকে ডেটা এনে GitHub Pages-এ JSON আকারে রাখবে। অ্যাপ শুধু সেই JSON পড়ে।

- API key থাকে GitHub Secret-এ, অ্যাপের ভেতরে থাকে না।
- ইউজার যত বেশিই হোক, football-data.org-এ রিকোয়েস্ট একই থাকে, তাই রেট লিমিটে আটকায় না।
- Public রিপোতে GitHub Actions আর Pages দুটোই ফ্রি।

অ্যাপ এই ঠিকানা থেকে ডেটা পড়ে (`app/src/main/res/values/strings.xml` → `football_data_base_url`):

```
https://jarif25.github.io/football-data/
```

## একবারের সেটআপ (৫ মিনিট)

1. GitHub-এ **`football-data`** নামে একটা **Public** রিপো খুলুন (অ্যাকাউন্ট `jarif25`)।
   অন্য নাম দিলে অ্যাপের `football_data_base_url`-ও সেই নাম অনুযায়ী বদলাতে হবে।
2. এই ফোল্ডারের সব ফাইল সেই রিপোর **রুটে** রাখুন। ফোল্ডার কাঠামো এমন হবে:
   ```
   sync.mjs
   README.md
   .github/workflows/sync.yml
   ```
3. রিপোর **Settings → Secrets and variables → Actions → New repository secret**:
   - Name: `FOOTBALL_DATA_TOKEN`
   - Value: আপনার football-data.org API key
4. **Actions** ট্যাবে গিয়ে workflow চালু করুন। তারপর **Sync football data → Run workflow** চাপুন
   ("Refresh every competition" টিক দেওয়া থাকবে)। প্রথমবার ৩-৪ মিনিট লাগবে।
5. রান শেষ হলে **Settings → Pages**:
   - Source: **Deploy from a branch**
   - Branch: **`gh-pages`**, ফোল্ডার **`/ (root)`** → Save
6. ১-২ মিনিট পর ব্রাউজারে খুলে দেখুন:
   `https://jarif25.github.io/football-data/matches.json`
   JSON দেখালে সেটআপ শেষ, অ্যাপ এখন ডেটা পাবে।

## কীভাবে চলে

| ফাইল | কখন আপডেট হয় |
|---|---|
| `matches.json` (৩ দিন আগে থেকে ৬ দিন পর পর্যন্ত, সব লিগ) | প্রতি রানে (১৫ মিনিট) |
| `competitions/<CODE>/matches.json`, `standings.json` | প্রতি রানে ৪টা লিগ পালা করে, আর যে লিগে খেলা চলছে বা সদ্য শেষ হয়েছে সেটা সবসময় |
| `competitions.json` | প্রতি ~২ ঘণ্টায় |

`gh-pages` ব্রাঞ্চে সবসময় একটাই কমিট থাকে, তাই রিপো কখনো বড় হয় না।

## জেনে রাখুন

- **স্কোর পুরোপুরি লাইভ না।** ফ্রি প্ল্যানে football-data.org-এর স্কোর দেরিতে আসে।
  তার সাথে ১৫ মিনিটের সিঙ্ক আর GitHub Pages-এর ~১০ মিনিটের ক্যাশ যোগ হয়।
  তাই স্কোর ১৫-৩০ মিনিট পিছিয়ে থাকতে পারে।
- GitHub-এর নিয়মে ৬০ দিন রিপোতে কোনো কাজ না হলে scheduled workflow বন্ধ হয়ে যেতে পারে।
  বন্ধ হলে GitHub ইমেইল পাঠায়। তখন Actions ট্যাব থেকে আবার **Enable** করে দিলেই চলবে।
- লোকালি টেস্ট করতে:
  ```
  FOOTBALL_DATA_TOKEN=xxxx SYNC_ALL=1 node sync.mjs out
  ```
