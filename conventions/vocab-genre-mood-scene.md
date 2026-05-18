# Controlled Vocabulary — Genre / Mood / Scene

> Source: NetEase Cloud Music Beat-upload form, captured 2026-05-16. Seed vocabulary for BeatOS's enumerated fields; bilingual labels (中/English) enable either-language search and cross-platform mapping.
>
> **Selection model in BeatOS** diverges from NetEase (user decision 2026-05-16):
> - Genre & Mood: **multi-select chip picker, no manual add** (NetEase is single-select for genre, caps mood at 3; we go multi/uncapped).
> - Scene: future field — reserved as forward-looking reference; do NOT implement until explicitly scheduled.

---

## Genres (74)

| # | 中文 | English |
|---|---|---|
| 1 | 流行 | Pop |
| 2 | R&B | Rhythm and Blues |
| 3 | 陷阱说唱 | Trap Rap |
| 4 | 钻头说唱 | Drill |
| 5 | 流行说唱 | Pop Rap |
| 6 | — | Boom Bap |
| 7 | 爵士嘻哈 | Jazz Hip Hop |
| 8 | 国风 | Chinese Style |
| 9 | — | Sexy Drill |
| 10 | — | Regalia |
| 11 | — | Rage |
| 12 | — | Plugg |
| 13 | — | Jersey Club |
| 14 | — | Jerk |
| 15 | 中西部说唱 | Midwest Hip Hop |
| 16 | 中文说唱 | Chinese Hip Hop |
| 17 | 云雾说唱 | Cloud Rap |
| 18 | 硬核说唱 | Hardcore Hip Hop |
| 19 | 英国说唱 | British Rap |
| 20 | 意识说唱 | Conscious Hip Hop |
| 21 | 亚特兰大说唱 | Atlanta Hip Hop |
| 22 | 旋律说唱 | Melodic Rap |
| 23 | 新派嘻哈 | New School Hip Hop |
| 24 | 乡村说唱 | Country Rap |
| 25 | 喜剧说唱 | Comedy Rap |
| 26 | 西岸说唱 | West Coast Hip Hop |
| 27 | 说唱伴奏 | Hip Hop Beat |
| 28 | 实验说唱 | Experimental Hip Hop |
| 29 | 日本说唱 | J-Rap |
| 30 | 情绪说唱 | Emo Rap |
| 31 | 器乐说唱 | Instrumental Hip Hop |
| 32 | 南方说唱 | Southern Hip Hop |
| 33 | 模糊说唱 | Mumble Rap |
| 34 | 孟菲斯说唱 | Memphis Rap |
| 35 | 另类嘻哈 | Alternative Hip Hop |
| 36 | 雷击顿 | Reggaeton |
| 37 | 狂克说唱 | Crunk |
| 38 | 快嘴说唱 | Chopper |
| 39 | 旧学派说唱 | Old School Hip Hop |
| 40 | 黄金时代嘻哈 | Golden Age Hip Hop |
| 41 | 韩语说唱 | K-Rap |
| 42 | 工业说唱 | Industrial Hip Hop |
| 43 | 匪帮说唱 | Gangsta Rap |
| 44 | 匪帮放克 | G-Funk |
| 45 | 东岸说唱 | East Coast Hip Hop |
| 46 | 底特律说唱 | Detroit Trap |
| 47 | 低保真嘻哈 | Lofi Hip Hop |
| 48 | 地下说唱 | Underground Hip Hop |
| 49 | 弛放嘻哈 | ChillHop |
| 50 | 车库嘻哈 | Grime |
| 51 | — | Hyperpop |
| 52 | 摇滚 | Rock |
| 53 | 新灵魂乐 | Neo Soul |
| 54 | 乡村 | Country |
| 55 | 舞场雷鬼 | Dancehall |
| 56 | 碎拍 | Breakbeat |
| 57 | 民谣 | Folk |
| 58 | 灵魂乐 | Soul |
| 59 | 雷鬼 | Reggae |
| 60 | 拉丁音乐 | Latin |
| 61 | 科技舞曲 | Techno |
| 62 | 爵士 | Jazz |
| 63 | 回响贝斯 | Dubstep |
| 64 | 缓拍 | Downtempo |
| 65 | 合成器浪潮 | Synthwave |
| 66 | 浩室舞曲 | House |
| 67 | 鼓打贝斯 | Drum & Bass |
| 68 | 氛围电子 | Ambient |
| 69 | 电子舞曲 | EDM |
| 70 | 电子 | Electronic |
| 71 | — | 2-Step Garage |
| 72 | — | Afrobeats |
| 73 | 世界音乐 | World Music |
| 74 | 福音音乐 | Gospel Music |

**Notes:**
- ~40 of 74 entries are hip-hop/rap subgenres (reflects the Chinese beatmaker market, acceptable for v0.0.12 since BeatOS's primary user is a Chinese beat producer); 10 entries are English-only (Boom Bap, Sexy Drill, Regalia, Rage, Plugg, Jersey Club, Jerk, Hyperpop, 2-Step Garage, Afrobeats).
- BeatOS picker should display whichever language has a value; if both, show `中文 (English)` in chips.
- The list is non-grouped on NetEase. For BeatOS we may add a subtle hip-hop / non-hip-hop visual divider since the Chinese list is heavily skewed.

---

## Mood vocabulary (~50)

Grouped by emotional valence (group is shown to the user in the picker; user can still pick across groups).

### Positive (正向)
幸福 / Happiness · 可爱 / Cute · 甜蜜 / Sweet · 浪漫 / Romantic · 温情 / Warm · 兴奋 / Excited · 热血 / Fired Up · 动感 / Energetic · 性感 / Sexy · 正直 / Righteous · 神圣 / Sacred · 优雅 / Elegant

### Neutral (中性)
抒情 / Lyrical · 思念 / Yearning · 憧憬 / Longing · 内省 / Introspective · 舒缓 / Soothing · 放松 / Relaxed · 平静 / Calm · 慵懒 / Lazy · 清新 / Fresh · 治愈 / Healing · 紧张 / Tense · 急促 / Rushed · 不安 / Uneasy · 搞笑 / Funny · 奇特 / Quirky · 怪诞 / Bizarre · 神秘 / Mysterious · 梦幻 / Dreamy · 未来感 / Futuristic · 科技感 / Tech · 迷幻 / Psychedelic · 史诗 / Epic · 宏大 / Grand · 萦绕感 / Lingering · 律动 / Groovy · 丝滑 / Silky · 柔顺 / Smooth · 醇厚 / Mellow

### Negative (负面)
悲伤 / Sad · 孤独 / Lonely · 愤怒 / Angry · 破坏 / Destructive · 黑暗 / Dark · 诡异 / Eerie · 残酷 / Cruel · 混乱 / Chaotic · 狂躁 / Manic · 嘈杂 / Noisy

---

## Scene vocabulary (~40) — reserved for future

Grouped by functional context. NOT YET WIRED into a BeatOS field. Listed here so the future `scene_tags` field can adopt this controlled vocabulary without re-research.

### 功能向 (Functional)
学习 / Study · 冥想 / Meditation · 助眠 / Sleep · freestyle · battle · 歌唱练习 / Vocal Practice

### 室内 (Indoor)
健身房 / Gym · 舞蹈房 / Dance Studio · 酒吧夜店 / Bar/Club · 咖啡厅 / Cafe · 潮流展会 / Trade Show · 大型商超 / Mall · 时尚门店 / Boutique · livehouse

### 室外 (Outdoor)
球类运动 / Ball Sports · 旅游 / Travel · 极限运动 / Extreme Sports · 跑步 / Running · 驾驶 / Driving · 骑行 / Cycling · 露营 / Camping

### 线上 (Online)
鬼畜 / Meme Remix · 科普 / Science · 种草 / Product Recommendation · 电影 / Film · 记录片 / Documentary · 美食 / Food · VLOG · 卡点歌曲 / Sync Cut · 带货直播 / Shopping Live · 秀场直播 / Performance Live · 游戏直播 / Gaming Live

---

## Audio file specifications (informational)

NetEase's published requirements, useful for our future "ready-to-publish" validator:

| Asset | Format | Bitrate | Sample rate | Size cap |
|---|---|---|---|---|
| Preview Beat (试听) | MP3 / WAV | ≥ 320 kbps | ≥ 44.1 kHz | ≤ 200 MB |
| High-quality WAV master | WAV | ≥ 1411 kbps | ≥ 44.1 kHz | < 200 MB |
| Stems (分轨) | ZIP / RAR | n/a | n/a | < 3 GB |

These match BeatOS's existing role slots: `audio_tagged_mp3` / `audio_untagged_mp3` (≈ preview), `audio_tagged_wav` / `audio_untagged_wav` (≈ master), `stems`.

BPM range: 1–1000 on NetEase. BeatOS currently has no range constraint — fine as-is; a future validator can warn outside common ranges (60–200).
