#!/usr/bin/env python3
"""Builds the 3D-anatomy preview /v2/index.html from /index.html.
Run:  python3 make_v2.py   (after any change to index.html, until the preview becomes the main site)"""
import pathlib, re

ROOT = pathlib.Path(__file__).parent
s = (ROOT / "index.html").read_text(encoding="utf-8")

def rep(old, new, count=1):
    global s
    assert old in s, old[:80]
    s = s.replace(old, new, count)

# ---------- head ----------
rep('<meta charset="utf-8">', '<meta charset="utf-8">\n<meta name="robots" content="noindex">')
rep('<meta name="theme-color" content="#1f6f63">', '<meta name="theme-color" content="#070606">')

# ---------- hero -> 3D story ----------
a = s.index(' <!-- HERO -->'); b = s.index(' <!-- SERVICES -->')
hero_left = s[s.index('    <span class="eyebrow" data-i="heroEyebrow">', a):s.index('   <div class="hero-art reveal">', a)]
hero_left = hero_left.rstrip()
assert hero_left.endswith('</div>')
hero_left = hero_left[:-len('</div>')]   # drop the wrapper's closing tag
story = f''' <!-- 3D ANATOMY STORY -->
 <section class="story" id="anatomy">
  <div class="stage" id="stage3d">
   <canvas id="anatCanvas" aria-label="3D anatomy"></canvas>
   <div class="anat-labels" id="anatLabels"></div>
   <div class="stage-fallback">
    <div class="show" id="heroShow" aria-roledescription="carousel"><div class="ph"><svg><use href="#i-paw"/></svg></div></div>
    <div class="show-dots" id="showDots"></div>
   </div>
   <div class="stage-vignette"></div>
   <div class="anat-bar glass" id="anatBar">
    <div class="sp-toggle" role="group">
     <button type="button" data-sp="dog" class="on">🐶 <span data-i="spDog">İt</span></button>
     <button type="button" data-sp="cat">🐱 <span data-i="spCat">Pişik</span></button>
    </div>
    <label class="lay"><svg><use href="#i-layers"/></svg><span data-i="layers">Qatlar</span>
     <input type="range" id="explodeRange" min="0" max="1" step="0.01" value="0"><b id="explodeVal">0%</b></label>
    <div class="ibs">
     <button type="button" class="ib on" id="rotBtn" aria-label="Rotate"><svg><use href="#i-rot"/></svg></button>
     <button type="button" class="ib" id="resetBtn" aria-label="Reset"><svg><use href="#i-reset"/></svg></button>
    </div>
   </div>
  </div>
  <div class="story-flow">
   <div class="st st-hero" data-story="hero">
    <div class="hero-copy">
{hero_left}
     <div class="hint3d"><svg><use href="#i-hand"/></svg><span data-i="hint3d">Fırladın və aşağı sürüşdürün — anatomiyanı kəşf edin</span></div>
    </div>
   </div>
   <div class="st right" data-story="heart"><div class="glass panel" id="sp-heart"></div></div>
   <div class="st" data-story="kidney"><div class="glass panel" id="sp-kidney"></div></div>
   <div class="st right" data-story="digest"><div class="glass panel" id="sp-digest"></div></div>
   <div class="st" data-story="skeleton"><div class="glass panel" id="sp-skeleton"></div></div>
   <div class="st right" data-story="skin"><div class="glass panel" id="sp-skin"></div></div>
  </div>
 </section>

'''
s = s[:a] + story + s[b:]

# ---------- extra icons ----------
rep(' </defs>', '''  <symbol id="i-layers" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 2 10 5-10 5L2 7z"/><path d="m2 17 10 5 10-5M2 12l10 5 10-5"/></symbol>
  <symbol id="i-rot" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/></symbol>
  <symbol id="i-reset" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 14h6v6M20 10h-6V4M14 10l7-7M3 21l7-7"/></symbol>
  <symbol id="i-hand" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 11V6a2 2 0 0 0-4 0v5M14 10V4a2 2 0 0 0-4 0v6M10 10.5V6a2 2 0 0 0-4 0v8"/><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.9-6-2.4l-3.6-3.6a2 2 0 0 1 2.8-2.8L7 15"/></symbol>
 </defs>''')

# ---------- dark luxury theme + story styles ----------
css = r'''
/* ===================== DARK LUXURY THEME (v2) ===================== */
:root{
  --ink:#f3ece6; --ink-2:#d6cbc3; --muted:#9b908a;
  --teal:#5cc1ad; --teal-d:#3f9c8a; --teal-l:rgba(92,193,173,.13);
  --coral:#e5a495; --coral-d:#cf8a7a; --sun:#f4c4b7;
  --cream:#0c0b0b; --sand:#0f0d0c; --white:#141211;
  --line:rgba(229,164,149,.16); --glass:rgba(17,15,14,.66);
  --shadow:0 24px 60px -24px rgba(0,0,0,.8);
}
html{background:#070606}
body{background:#070606;color:var(--ink)}
::selection{background:#e5a495;color:#000}
::-webkit-scrollbar{width:7px}::-webkit-scrollbar-track{background:#070606}::-webkit-scrollbar-thumb{background:#2a1f1d;border-radius:4px}::-webkit-scrollbar-thumb:hover{background:#e5a495}
em,.rg{font-style:italic;background:linear-gradient(135deg,#fff2ef 0%,#e5a495 50%,#b87163 100%);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;color:transparent}
h1,h2,h3{color:#fff}
.eyebrow{color:var(--coral)} .eyebrow::before{background:var(--coral)}
.lead{color:#c9beb6}
.glass,.card,.prod,.value,.cc,.sched,.note,.bk,.pc,.pm-box,.svc,.day,.slot,.pm-rows li,.pm-filter button,input,select,textarea,.langs,.btn-ghost{
  background:var(--glass)!important;border:1px solid var(--line)!important;color:var(--ink);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px)}
.card:hover,.prod:hover,.cc:hover,.pc:hover{border-color:rgba(229,164,149,.5)!important;box-shadow:0 0 30px rgba(229,164,149,.12),var(--shadow)}
header{background:rgba(7,6,6,.62);border-bottom:1px solid var(--line);backdrop-filter:blur(18px)}
.links a{color:#bdb2ab} .links a:hover{color:var(--coral)}
.links.open{background:#0b0a0a!important;border-color:var(--line)!important}
.logo b{color:#fff} .logo small{color:#9b908a}
.logo-mark{background:linear-gradient(135deg,#f4c4b7,#e5a495 45%,#ab6557)} .logo-mark svg{color:#1a0f0c!important}
.burger{color:var(--coral)}
.langs button,.langs a{color:#9b908a} .langs a.on,.langs button.on{background:linear-gradient(135deg,#f4c4b7,#e5a495 55%,#ab6557);color:#120a08}
.btn-primary{background:linear-gradient(110deg,#f4c4b7,#e5a495 45%,#ab6557);color:#140b09;box-shadow:0 12px 30px -10px rgba(229,164,149,.45)}
.btn-primary:hover{filter:brightness(1.08);background:linear-gradient(110deg,#f4c4b7,#e5a495 45%,#ab6557)}
.btn-teal{background:rgba(229,164,149,.1);color:var(--sun);border:1px solid rgba(229,164,149,.35)}
.btn-teal:hover{background:rgba(229,164,149,.2)}
.btn-ghost{color:var(--ink)!important} .btn-ghost:hover{border-color:var(--coral)!important;color:var(--coral)!important}
section{position:relative}
.services,.gallery,#about,#contact{background:transparent}
.products{background:linear-gradient(180deg,transparent,#0d0b0a 20%,#0d0b0a 80%,transparent)}
.card .ic{background:linear-gradient(135deg,rgba(229,164,149,.22),rgba(171,101,87,.22));color:var(--sun);border:1px solid var(--line)}
.card:hover .ic{background:linear-gradient(135deg,#f4c4b7,#ab6557);color:#140b09}
.card p,.prod-body p,.value span,.cc small{color:#a59a93}
.tags span{background:rgba(229,164,149,.1);color:var(--sun)}
.cnt{background:rgba(0,0,0,.6);color:var(--sun)}
.about-photo{background:linear-gradient(160deg,#2a1f1d,#ab6557)}
.gal .g{background:linear-gradient(135deg,#171312,#241a17)}
.gal .g:nth-child(2n){background:linear-gradient(135deg,#1b1513,#2b1e1a)}
.appt{background:radial-gradient(120% 90% at 85% 10%,rgba(229,164,149,.16),transparent 55%),radial-gradient(90% 70% at 0% 100%,rgba(92,193,173,.1),transparent 60%),#0a0908}
.appt .eyebrow{color:var(--coral)} .appt .lead{color:#c9beb6}
.call-box{background:var(--glass);border-color:var(--line)}
.bk-bar i{background:#2a2321} .bk-bar i.on{background:linear-gradient(90deg,#f4c4b7,#e5a495)}
.svc .si,.day.on{background:linear-gradient(135deg,#f4c4b7,#ab6557)!important;color:#140b09!important}
.day.on small,.day.on span{color:#3a221c}
.pets span{background:var(--glass);border-color:var(--line);color:var(--ink)}
.pets input:checked+span{background:linear-gradient(135deg,#f4c4b7,#ab6557);border-color:transparent;color:#140b09}
.slot:hover{border-color:var(--coral)!important;color:var(--coral)}
.bk-chip{background:rgba(229,164,149,.1);color:var(--sun)}
input:focus,select:focus,textarea:focus{border-color:var(--coral)!important;box-shadow:0 0 0 4px rgba(229,164,149,.15)}
select option{background:#141211}
.sched-addr{color:var(--ink);border-top-color:var(--line)} .sched li span{color:#9b908a} .sched ul{color:#d6cbc3}
.cc i{background:linear-gradient(135deg,#f4c4b7,#ab6557)!important;color:#140b09} .cc i svg{color:#140b09}
.pm{background:rgba(0,0,0,.7)} .pm-foot{border-color:var(--line)} .pm-filter button.on{background:linear-gradient(135deg,#f4c4b7,#ab6557)!important;color:#140b09}
.pc img{background:#fff}
.pm-list .th.none{background:#1c1817}
footer{background:#050404;border-top:1px solid var(--line)}
.mbar .btn-teal{background:#1a1514}
.nav-call{white-space:nowrap}
@media (max-width:1180px){.links{gap:1.1rem}.nav-call span{display:none}.nav-call{padding:.7rem}}
.link-btn{color:var(--coral)}
.prod-top::after{background:rgba(255,255,255,.08)}

/* ===================== 3D STORY ===================== */
.story{position:relative}
.stage{position:sticky;top:0;height:100vh;height:100svh;overflow:hidden;z-index:0;
  background:radial-gradient(60% 55% at 62% 52%,rgba(229,164,149,.12),transparent 70%),radial-gradient(50% 40% at 20% 90%,rgba(92,193,173,.07),transparent 70%),#070606}
.stage canvas{position:absolute;inset:0;width:100%;height:100%;display:block;cursor:grab;touch-action:pan-y}
.stage canvas:active{cursor:grabbing}
.stage-vignette{position:absolute;inset:0;pointer-events:none;background:radial-gradient(120% 90% at 50% 45%,transparent 55%,rgba(0,0,0,.55))}
.stage-fallback{display:none;position:absolute;right:6%;top:14%;width:min(420px,40vw);aspect-ratio:4/5}
.stage.nogl .stage-fallback{display:block}
.stage.nogl canvas,.stage.nogl .anat-bar,.stage.nogl .anat-labels{display:none}
.stage-fallback .show{position:absolute;inset:0}
.story-flow{position:relative;z-index:2;margin-top:-100vh;margin-top:-100svh;pointer-events:none}
.st{min-height:100vh;min-height:100svh;display:flex;align-items:center;padding:110px 6% 130px}
.st.right{justify-content:flex-end}
.st > *{pointer-events:auto}
.st-hero{align-items:center}
.hero-copy{max-width:560px}
.hero-copy h1{font-size:clamp(2.6rem,5.4vw,4.6rem);margin:1rem 0 1.2rem;text-shadow:0 10px 40px rgba(0,0,0,.5)}
.hero-copy .lead{font-size:1.1rem}
.hero-copy .sched{margin-top:.2rem}
.hint3d{display:flex;align-items:center;gap:.55rem;margin-top:1.6rem;color:#9b908a;font-size:.85rem;font-weight:600}
.hint3d svg{width:20px;height:20px;color:var(--coral);animation:nudge 2.4s ease-in-out infinite}
@keyframes nudge{50%{transform:translateX(6px) rotate(-8deg)}}
.panel{max-width:470px;width:100%;max-height:calc(100vh - 200px);max-height:calc(100svh - 200px);overflow:auto;scrollbar-width:thin;border-radius:28px;padding:2.1rem 2.1rem 2rem;opacity:0;transform:translateY(40px);transition:opacity .7s ease,transform .7s ease;box-shadow:var(--shadow)}
.st.in .panel{opacity:1;transform:none}
.st-tag{display:flex;align-items:center;gap:.6rem;font-size:.72rem;font-weight:800;letter-spacing:.18em;text-transform:uppercase;color:var(--coral)}
.st-tag i{width:22px;height:2px;background:var(--coral);border-radius:2px}
.panel h2{font-size:clamp(1.8rem,3vw,2.5rem);margin:.7rem 0 .9rem}
.panel p{color:#c4b9b1;font-size:.98rem;line-height:1.7}
.st-sub{font-size:.7rem;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:#8f847e;margin:1.3rem 0 .55rem}
.st-svcs{display:flex;flex-wrap:wrap;gap:.45rem}
.st-svcs a{font-size:.8rem;font-weight:700;padding:.45rem .8rem;border-radius:999px;border:1px solid var(--line);color:var(--sun);background:rgba(229,164,149,.07);transition:.2s}
.st-svcs a:hover{background:rgba(229,164,149,.18)}
.st-prods{display:grid;grid-template-columns:repeat(auto-fill,minmax(92px,1fr));gap:.55rem}
.st-prod{display:flex;flex-direction:column;gap:.35rem;background:rgba(255,255,255,.03);border:1px solid var(--line);border-radius:14px;padding:.4rem;cursor:zoom-in;text-align:left;font:inherit;color:inherit;transition:.2s}
.st-prod:hover{border-color:rgba(229,164,149,.55);transform:translateY(-2px)}
.st-prod img{width:100%;aspect-ratio:1;object-fit:cover;border-radius:10px;background:#fff}
.st-prod span{font-size:.68rem;font-weight:700;line-height:1.25;color:#d6cbc3;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.st-prod.noimg{cursor:pointer}.st-prod.noimg b{display:grid;place-items:center;aspect-ratio:1;border-radius:10px;background:#1c1817;font-size:1.4rem}
.st-btns{display:flex;flex-wrap:wrap;gap:.6rem;margin-top:1.5rem}
.st-btns .btn{padding:.85rem 1.3rem;font-size:.9rem}
.anat-labels{position:absolute;inset:0;pointer-events:none;z-index:3}
.alabel{position:absolute;left:0;top:0;display:flex;align-items:center;gap:.45rem;pointer-events:auto;background:none;border:0;cursor:pointer;opacity:0;transition:opacity .35s;font:700 .74rem Manrope,sans-serif;color:#fff;white-space:nowrap;margin:-7px 0 0 -7px}
.alabel.on{opacity:1}
.alabel i{width:14px;height:14px;border-radius:50%;background:#e5a495;box-shadow:0 0 0 0 rgba(229,164,149,.7);animation:ring 2s infinite;flex-shrink:0}
.alabel span{background:rgba(10,9,9,.78);border:1px solid var(--line);padding:.3rem .6rem;border-radius:999px;backdrop-filter:blur(8px)}
.alabel.hot span{border-color:#e5a495;color:var(--sun)}
@keyframes ring{0%{box-shadow:0 0 0 0 rgba(229,164,149,.7)}70%{box-shadow:0 0 0 12px rgba(229,164,149,0)}100%{box-shadow:0 0 0 0 rgba(229,164,149,0)}}
.anat-bar{position:absolute;left:50%;bottom:22px;transform:translateX(-50%);z-index:5;display:flex;align-items:center;gap:1rem;padding:.65rem .8rem .65rem .7rem;border-radius:20px;width:max-content;max-width:94vw}
.sp-toggle{display:flex;background:rgba(0,0,0,.35);border-radius:999px;padding:3px}
.sp-toggle button{border:0;background:none;color:#a59a93;font:700 .82rem Manrope,sans-serif;padding:.45rem .85rem;border-radius:999px;cursor:pointer}
.sp-toggle button.on{background:linear-gradient(135deg,#f4c4b7,#ab6557);color:#140b09}
.lay{display:flex;align-items:center;gap:.55rem;margin:0;font-size:.7rem;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:#a59a93}
.lay svg{width:16px;height:16px;color:var(--coral)}
.lay input{width:140px;padding:0;height:4px;accent-color:#e5a495;background:transparent!important;border:0!important;backdrop-filter:none}
.lay b{font:600 .78rem ui-monospace,monospace;color:var(--coral);min-width:34px;text-align:right;letter-spacing:0}
.ibs{display:flex;gap:.35rem;border-left:1px solid var(--line);padding-left:.7rem}
.ib{width:36px;height:36px;border-radius:12px;border:1px solid var(--line);background:rgba(255,255,255,.03);color:#a59a93;display:grid;place-items:center;cursor:pointer}
.ib svg{width:16px;height:16px}.ib.on,.ib:hover{color:var(--coral);border-color:rgba(229,164,149,.45)}
.story ~ section{z-index:1}
@media (max-width:900px){
  .st{align-items:flex-end;padding:90px 4% 96px}
  .st.right{justify-content:center}.st{justify-content:center}
  .st-hero{align-items:flex-end}
  .hero-copy{background:linear-gradient(180deg,transparent,rgba(7,6,6,.92) 22%);padding-top:3rem;border-radius:24px}
  .hero-copy h1{font-size:clamp(2.1rem,9vw,3rem)}
  .panel{padding:1.4rem 1.2rem 1.3rem;max-height:56vh;max-height:56svh;overflow:auto;border-radius:22px}
  .panel p{font-size:.92rem}
  .anat-bar{bottom:12px;gap:.6rem;padding:.5rem}
  .lay span{display:none}.lay input{width:90px}
  .hero-copy .lead,.hint3d,#schedList,.sched-addr{display:none!important}
  .hero-copy .sched{padding:.65rem 1rem}.hero-copy .sched-now{margin:0}
  .hero-copy{padding-top:5rem}
  body.instory .mbar{transform:translateY(140%);opacity:0;pointer-events:none}
  .stage-fallback{right:50%;transform:translateX(50%);top:12%;width:70vw}
}
@media (max-width:420px){.sp-toggle button span{display:none}.lay b{display:none}}
'''
rep('/* contact */', css + '\n/* contact */')

# ---------- translations ----------
tr = {
 'az': 'spDog:"İt",spCat:"Pişik",layers:"Qatlar",hint3d:"Fırladın və aşağı sürüşdürün — anatomiyanı kəşf edin",stSvc:"Xidmətlər",stProd:"Məhsullar",stShow:"Orqanı göstər",',
 'ru': 'spDog:"Собака",spCat:"Кошка",layers:"Слои",hint3d:"Вращайте и листайте вниз — изучите анатомию",stSvc:"Услуги",stProd:"Товары",stShow:"Показать орган",',
 'en': 'spDog:"Dog",spCat:"Cat",layers:"Layers",hint3d:"Drag to rotate, scroll to explore the anatomy",stSvc:"Services",stProd:"Products",stShow:"Show organ",',
}
for k, v in tr.items():
    key = {'az': 'fErr:"Zəhmət', 'ru': 'fErr:"Пожалуйста', 'en': 'fErr:"Please'}[k]
    rep(key, v + key)

# ---------- story logic ----------
js = r'''
// ================= 3D anatomy story =================
const ORG = {
  az:{brain:"Beyin",heart:"Ürək",lungs:"Ağciyərlər",liver:"Qaraciyər",stomach:"Mədə",intestines:"Bağırsaqlar",kidneys:"Böyrəklər",bladder:"Sidik kisəsi",teeth:"Dişlər"},
  ru:{brain:"Мозг",heart:"Сердце",lungs:"Лёгкие",liver:"Печень",stomach:"Желудок",intestines:"Кишечник",kidneys:"Почки",bladder:"Мочевой пузырь",teeth:"Зубы"},
  en:{brain:"Brain",heart:"Heart",lungs:"Lungs",liver:"Liver",stomach:"Stomach",intestines:"Intestines",kidneys:"Kidneys",bladder:"Bladder",teeth:"Teeth"}
};
const ORG_STORY = { heart:"heart", lungs:"heart", kidneys:"kidney", bladder:"kidney", liver:"digest", stomach:"digest", intestines:"digest", brain:"skeleton", teeth:"skin" };
const STORIES = {
  heart: { svcs:["consult","lab","usg"], prods:["Vet Expert CardioOne","GimCat Nutri Taurine Bites","Canina 100% somon yağı"],
    az:["Ürək və tənəffüs","Hər döyüntü","önəmlidir","Ürək xəstəlikləri çox vaxt səssiz başlayır — xüsusən yaşlı pişik və itlərdə. Dinləmə, UZİ və analizlərlə problemi erkən aşkar edir, müalicəni vaxtında başlayırıq."],
    ru:["Сердце и дыхание","Каждый удар","важен","Болезни сердца часто начинаются незаметно — особенно у пожилых кошек и собак. Аускультация, УЗИ и анализы помогают выявить проблему рано и вовремя начать лечение."],
    en:["Heart & lungs","Every heartbeat","matters","Heart disease often starts silently — especially in older cats and dogs. Listening, ultrasound and blood tests let us catch it early and start treatment in time."] },
  kidney: { svcs:["usg","lab","consult"], prods:["Craftia Galena PC Renal Care","Purina Pro Plan VD Urinary","Vet Expert RenalVet","Vet Expert UrinoVet Cat Dilution","Craftia Galena Urinary Care"],
    az:["Böyrəklər və sidik yolları","Pişiklərin","ən həssas nöqtəsi","Böyrək çatışmazlığı və sidik daşları pişiklərdə ən çox rast gəlinən problemlərdəndir. UZİ və analizlə vaxtında diaqnoz, düzgün pəhriz və əlavələrlə uzunmüddətli nəzarət."],
    ru:["Почки и мочевыводящие пути","Самое уязвимое","место кошек","Почечная недостаточность и мочекаменная болезнь — одни из самых частых проблем у кошек. Своевременная диагностика на УЗИ и анализах, контроль правильной диетой и добавками."],
    en:["Kidneys & urinary tract","A cat's most","sensitive spot","Kidney disease and urinary stones are among the most common problems in cats. Early diagnosis with ultrasound and lab tests, then long-term control with the right diet and supplements."] },
  digest: { svcs:["consult","parasite","drip","lab"], prods:["Purina Pro Plan VD EN Gastrointestinal","Purina Pro Plan VD HP Hepatic","Zoovital Gastrovital","Diroheart / Diroheart Plus M","NexGard Combo","Endopet"],
    az:["Həzm sistemi","Mədə, bağırsaq","və qaraciyər","Qusma, ishal, iştahsızlıq və parazitlər — səbəbini müayinə və analizlə tapır, müalicə, sistem və düzgün qidalanma ilə sağlamlığı bərpa edirik."],
    ru:["Пищеварение","Желудок, кишечник","и печень","Рвота, диарея, отказ от еды и паразиты — находим причину с помощью осмотра и анализов, восстанавливаем здоровье лечением, капельницами и правильным питанием."],
    en:["Digestion","Stomach, gut","and liver","Vomiting, diarrhoea, poor appetite and parasites — we find the cause with an exam and tests, then restore health with treatment, IV fluids and the right food."] },
  skeleton: { svcs:["surgery","steril","consult"], prods:["Vet Expert ArthroVet Complex","Vet Expert VetoMune","Vet Expert Neuro Support"],
    az:["Skelet, oynaqlar və sinirlər","Hərəkət —","həyatdır","Axsama, oynaq ağrıları, travmalar və yaşla gələn dəyişikliklər. Sterilizasiya və cərrahi əməliyyatlar təhlükəsiz anesteziya və diqqətli bərpa ilə."],
    ru:["Скелет, суставы и нервы","Движение —","это жизнь","Хромота, боли в суставах, травмы и возрастные изменения. Стерилизация и операции — с безопасной анестезией и внимательным восстановлением."],
    en:["Skeleton, joints & nerves","Movement","is life","Limping, joint pain, injuries and age-related changes. Spaying, neutering and surgery with safe anaesthesia and careful recovery."] },
  skin: { svcs:["skin","micro","dental","groom"], prods:["Vet Expert Anti Seborrhoeic Shampoo","Canina 100% somon yağı","TRIXIE şampun — uzun tüklü itlər","TRIXIE Eye-Care"],
    az:["Dəri, yun və dişlər","Sağlamlığın","görünən tərəfi","Qaşınma, tük tökülməsi, qulaq gənəsi və diş daşı. Mikroskop və Vud lampası ilə diaqnoz, ultrasəs skaleri ilə diş təmizliyi, gigiyenik qulluq."],
    ru:["Кожа, шерсть и зубы","Здоровье, которое","видно","Зуд, выпадение шерсти, ушной клещ и зубной камень. Диагностика под микроскопом и лампой Вуда, ультразвуковая чистка зубов, гигиенический уход."],
    en:["Skin, coat & teeth","The health you","can see","Itching, hair loss, ear mites and tartar. Diagnosis with a microscope and Wood's lamp, ultrasonic dental cleaning and grooming."] }
};
window.anatLabel = k => ORG[lang][k] || k;
window.onAnatomyLabel = k => { const st = document.querySelector(`.st[data-story="${ORG_STORY[k]}"]`); st && st.scrollIntoView({behavior:"smooth", block:"center"}); };
const findProd = name => { for(const c of PRODUCTS) for(const x of c.items) if(x.n === name) return x; return null; };
window.renderStory = function(){
  const t = T[lang];
  Object.entries(STORIES).forEach(([k, S]) => {
    const el = $("#sp-" + k); if(!el) return;
    const [tag, h1, h2, p] = S[lang];
    const svcs = S.svcs.map(id => SERVICES.find(s => s.id === id)).filter(Boolean).map(s => `<a class="setmore" href="${CONFIG.booking}" target="_blank" rel="noopener">${s[lang][0]}</a>`).join("");
    const prods = S.prods.map(findProd).filter(Boolean).map(x => x.img
      ? `<button type="button" class="st-prod" data-img="/images/products/${x.img}.jpg" data-name="${esc(x.n)}"><img src="/images/products/${x.img}-t.jpg" alt="" loading="lazy"><span>${esc(x.n)}</span></button>`
      : `<button type="button" class="st-prod noimg" data-name="${esc(x.n)}"><b>${[...x.p].map(k => ({c:"🐱",d:"🐶",b:"🦜"})[k]).join("")}</b><span>${esc(x.n)}</span></button>`).join("");
    el.innerHTML = `<div class="st-tag"><i></i>${tag}</div><h2>${h1} <em>${h2}</em></h2><p>${p}</p>
      <div class="st-sub">${t.stSvc}</div><div class="st-svcs">${svcs}</div>
      <div class="st-sub">${t.stProd}</div><div class="st-prods">${prods}</div>
      <div class="st-btns"><a class="btn btn-primary setmore" href="${CONFIG.booking}" target="_blank" rel="noopener"><svg><use href="#i-cal"/></svg><span>${t.ctaBook}</span></a></div>`;
  });
  window.Anatomy && Anatomy.refreshLabels();
  if(CONFIG.bookingApi) $$(".story .setmore").forEach(a => { a.href = "#appointment"; a.removeAttribute("target"); });
};
renderStory();
$(".story-flow").addEventListener("click", e => {
  const b = e.target.closest(".st-prod"); if(!b) return;
  if(b.dataset.img) openImg(b.dataset.img, b.dataset.name);
  else { const i = PRODUCTS.findIndex(c => c.items.some(x => x.n === b.dataset.name)); if(i >= 0) openPm(i); }
});
// scroll → story state
const stObs = new IntersectionObserver(es => es.forEach(e => {
  if(e.isIntersecting){ e.target.classList.add("in"); window.Anatomy && Anatomy.setStory(e.target.dataset.story); }
}), { rootMargin: "-48% 0px -48% 0px" });
$$(".st").forEach(el => stObs.observe(el));
$$(".st").forEach(el => new IntersectionObserver(([e]) => { if(e.isIntersecting) el.classList.add("in"); }, { threshold: .2 }).observe(el));
// control bar
const rng = $("#explodeRange"), rv = $("#explodeVal");
rng.addEventListener("input", () => { rv.textContent = Math.round(rng.value * 100) + "%"; window.Anatomy && Anatomy.setExplode(+rng.value); });
window.onAnatomyExplode = v => { rng.value = v; rv.textContent = Math.round(v * 100) + "%"; };
$$("#anatBar [data-sp]").forEach(b => b.addEventListener("click", () => {
  $$("#anatBar [data-sp]").forEach(x => x.classList.toggle("on", x === b)); window.Anatomy && Anatomy.setSpecies(b.dataset.sp);
}));
$("#rotBtn").addEventListener("click", () => { if(window.Anatomy) $("#rotBtn").classList.toggle("on", Anatomy.toggleRotate()); });
$("#resetBtn").addEventListener("click", () => { window.Anatomy && Anatomy.reset(); $("#rotBtn").classList.add("on"); });
window.onAnatomyReady = () => { Anatomy.refreshLabels(); };
// phones: hide the bottom call bar while the 3D story fills the screen (story panels carry their own Book button)
new IntersectionObserver(([e]) => document.body.classList.toggle("instory", e.isIntersecting), { rootMargin: "0px 0px -55% 0px" }).observe($("#anatomy"));
'''
rep('// sticky call bar', js + '\n// sticky call bar')
# call renderStory on every language render
rep('  const addr = CONFIG.address[lang]', '  if(window.renderStory) window.renderStory();\n  const addr = CONFIG.address[lang]')

# libraries + engine (after the main script)
rep('</body>', '''<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/OrbitControls.js"></script>
<script src="/anatomy/anatomy.js?v=7"></script>
</body>''')

# preview: switch language in place (the /ru/ and /en/ addresses still serve the current design)
rep('if(location.protocol.startsWith("http") && l !== (PATH_LANG || "az")){', 'if(false){')
i = s.index('try{ const s = localStorage.getItem("vetLang"); if(!PATH_LANG')
j = s.index('}catch(e){}', i)
s = s[:i] + 'try{ const s = localStorage.getItem("vetLang"); if(T[s]) lang = s; ' + s[j:]

out = ROOT / "v2"; out.mkdir(exist_ok=True)
(out / "index.html").write_text(s, encoding="utf-8")
print("built /v2/index.html", len(s)//1024, "KB")
