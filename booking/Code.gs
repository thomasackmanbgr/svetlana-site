/**
 * Svetlana-T — online booking backend (Google Apps Script)
 * ---------------------------------------------------------
 * Lives inside the clinic's Google account and books straight into its Google Calendar.
 * The website asks it for free times and sends bookings to it.
 *
 * SETUP (one time):
 *  1. Sign in to the clinic's Google account → script.google.com → New project.
 *  2. Delete the sample code, paste this whole file, click Save.
 *  3. Deploy → New deployment → type "Web app".
 *       Execute as: Me      Who has access: Anyone
 *  4. Click Deploy, allow the permissions (Calendar + send email), copy the Web app URL.
 *  5. Put that URL into the website (CONFIG.bookingApi in index.html).
 *
 * After changing anything below: Deploy → Manage deployments → ✏️ → Version: New version → Deploy
 * (the URL stays the same).
 *
 * DAILY USE for the clinic:
 *  - Every booking appears in Google Calendar as "🐾 …" with the client's phone in the description.
 *  - To block time (personal errand, operation): just add any event to the calendar — that time
 *    disappears from the website.
 *  - To close a whole day (vacation, holiday): add an ALL-DAY event on that day.
 */

const CFG = {
  CALENDAR_ID: 'primary',          // the account's main calendar
  TZ: 'Asia/Baku',
  WORK_DAYS: [3, 4, 5, 6],         // 0=Sun 1=Mon 2=Tue 3=Wed 4=Thu 5=Fri 6=Sat
  OPEN: '11:00',
  CLOSE: '16:00',
  BREAKS: [['14:00', '15:00']],    // lunch
  STEP_MIN: 15,                    // a new start time every 15 minutes
  MIN_NOTICE_MIN: 120,             // can't book less than 2 hours ahead
  MAX_DAYS_AHEAD: 30,
  NOTIFY_EMAIL: '',                // '' = email the account owner; or put another address
  MAX_BOOKINGS_PER_PHONE_PER_DAY: 3,
  // id: [minutes, name shown in the calendar]  — ids must match the website
  SERVICES: {
    consult:  [30, 'Müayinə / konsultasiya'],
    vaccine:  [20, 'Peyvənd'],
    usg:      [30, 'UZİ'],
    lab:      [20, 'Analizlər'],
    micro:    [20, 'Mikroskopik müayinə'],
    skin:     [30, 'Dəri problemi'],
    parasite: [20, 'Parazit müalicəsi'],
    drip:     [30, 'İynə / sistem'],
    groom:    [30, 'Gigiyenik qulluq']
  }
};

function doGet(e) {
  const p = (e && e.parameter) || {};
  try {
    if (p.action === 'slots') return json_({ ok: true, date: p.date, slots: freeSlots_(p.date, p.service) });
    return json_({ ok: true, service: 'svetlana-booking' });
  } catch (err) { return json_({ ok: false, error: String(err.message || err) }); }
}

function doPost(e) {
  let b;
  try { b = JSON.parse(e.postData.contents); } catch (err) { return json_({ ok: false, error: 'bad_request' }); }
  if (b.website) return json_({ ok: true });                           // honeypot: bots fill hidden field
  const name = clean_(b.name, 60), phone = clean_(b.phone, 30), petName = clean_(b.petName, 40),
        pet = clean_(b.pet, 30), note = clean_(b.note, 500), lang = clean_(b.lang, 2);
  const svc = CFG.SERVICES[b.service];
  if (!svc || !name || phone.replace(/\D/g, '').length < 7 || !/^\d{4}-\d{2}-\d{2}$/.test(b.date) || !/^\d{2}:\d{2}$/.test(b.time))
    return json_({ ok: false, error: 'invalid' });

  const digits = phone.replace(/\D/g, ''), cache = CacheService.getScriptCache();
  const key = 'p' + digits + Utilities.formatDate(new Date(), CFG.TZ, 'yyyyMMdd');
  const count = Number(cache.get(key) || 0);
  if (count >= CFG.MAX_BOOKINGS_PER_PHONE_PER_DAY) return json_({ ok: false, error: 'limit' });

  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    if (freeSlots_(b.date, b.service).indexOf(b.time) < 0) return json_({ ok: false, error: 'taken' });
    const start = at_(b.date, b.time), end = new Date(start.getTime() + svc[0] * 60000);
    const title = '🐾 ' + (petName || pet || 'Pasiyent') + ' — ' + svc[1] + ' (' + name + ')';
    const desc = [
      'Sahibi / Владелец: ' + name,
      'Telefon: ' + phone,
      'WhatsApp: https://wa.me/' + waNumber_(digits),
      'Heyvan / Животное: ' + pet + (petName ? ' — ' + petName : ''),
      'Xidmət / Услуга: ' + svc[1] + ' (' + svc[0] + ' dəq)',
      note ? 'Qeyd / Комментарий: ' + note : '',
      '',
      'Saytdan rezerv — svetlanatbaytarliq.com (' + (lang || 'az') + ')'
    ].filter(String).join('\n');
    const ev = cal_().createEvent(title, start, end, { description: desc });
    ev.addPopupReminder(30);
    cache.put(key, String(count + 1), 21600);

    try {
      const to = CFG.NOTIFY_EMAIL || Session.getEffectiveUser().getEmail();
      MailApp.sendEmail(to, 'Yeni rezerv: ' + b.date + ' ' + b.time + ' — ' + svc[1], desc);
    } catch (mailErr) { /* booking still saved */ }

    return json_({ ok: true, id: ev.getId(), date: b.date, time: b.time, minutes: svc[0] });
  } finally { lock.releaseLock(); }
}

/* ---------- helpers ---------- */

function freeSlots_(date, serviceId) {
  const svc = CFG.SERVICES[serviceId];
  if (!svc || !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('invalid');
  const dayStart = at_(date, '00:00'), dayEnd = new Date(dayStart.getTime() + 86400000);
  const wd = Number(Utilities.formatDate(dayStart, CFG.TZ, 'u')) % 7;          // 1=Mon … 7=Sun → 0=Sun
  if (CFG.WORK_DAYS.indexOf(wd) < 0) return [];
  const now = new Date();
  if (dayStart.getTime() > now.getTime() + CFG.MAX_DAYS_AHEAD * 86400000) return [];

  const events = cal_().getEvents(dayStart, dayEnd);
  if (events.some(function (ev) { return ev.isAllDayEvent(); })) return [];     // whole day closed
  const busy = events.map(function (ev) { return [ev.getStartTime().getTime(), ev.getEndTime().getTime()]; });
  CFG.BREAKS.forEach(function (br) { busy.push([at_(date, br[0]).getTime(), at_(date, br[1]).getTime()]); });

  const dur = svc[0] * 60000, open = at_(date, CFG.OPEN).getTime(), close = at_(date, CFG.CLOSE).getTime();
  const earliest = now.getTime() + CFG.MIN_NOTICE_MIN * 60000, out = [];
  for (let t = open; t + dur <= close; t += CFG.STEP_MIN * 60000) {
    if (t < earliest) continue;
    const clash = busy.some(function (b) { return t < b[1] && t + dur > b[0]; });
    if (!clash) out.push(Utilities.formatDate(new Date(t), CFG.TZ, 'HH:mm'));
  }
  return out;
}

function at_(date, hhmm) { return Utilities.parseDate(date + ' ' + hhmm, CFG.TZ, 'yyyy-MM-dd HH:mm'); }
function cal_() { return CalendarApp.getCalendarById(CFG.CALENDAR_ID) || CalendarApp.getDefaultCalendar(); }
function clean_(v, max) { return String(v == null ? '' : v).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max); }
function waNumber_(d) { return d.indexOf('994') === 0 ? d : '994' + d.replace(/^0/, ''); }
function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }

/** Run this once from the editor (select "testSetup" → Run) to check calendar access. */
function testSetup() {
  const d = new Date(Date.now() + 2 * 86400000);
  Logger.log(cal_().getName());
  Logger.log(freeSlots_(Utilities.formatDate(d, CFG.TZ, 'yyyy-MM-dd'), 'consult'));
}
