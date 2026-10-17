import { dateKey, parseDate, shiftDay, monthStart, monthDays, shiftMonth, weekStart, periodBounds, numberValue, durationMinutes, sumMinutes, entriesBetween, ruleAt, goalHours, initialData, changeGoals, validateEntry, validateData, backupDue, exportCSV, sessionLabel } from './model.js';
import { messages } from './i18n.js?v=3';

// Safari exposes gesture events even when viewport zoom is disabled.
for (const eventName of ['gesturestart','gesturechange','gestureend']) {
  document.addEventListener(eventName,event=>event.preventDefault(),{passive:false});
}
const KEY = 'stunden:v1';
const app = document.querySelector('#app');
const entryDialog = document.querySelector('#entry-dialog');
const confirmDialog = document.querySelector('#confirm-dialog');
const importFile = document.querySelector('#import-file');
let data, rawData = null, corrupt = false, lastStored = null;
let tab = 'overview', period = 'week', today = dateKey(), selectedDate = today, calendarMonth = monthStart(today);
let calendarMode = 'calendar', heatYear = parseDate(today).getFullYear();
let entryUnit = 'hours', editingId = null, formSnapshot = null, pendingImport = null;
let offlineStatus = 'localPreview', toastTimer;
let settingsDraft = null, settingsSnapshot = null;
let renderedView = null;
let onboardingStep = 'welcome', onboardingGoalType = 'week';
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
function animateElement(element, frames, duration) {
  if (!element || reducedMotion.matches) return null;
  return element.animate(frames, {duration, easing:'cubic-bezier(.2,.7,.3,1)'});
}
function closeEntryDialog() {
  if (!entryDialog.open || entryDialog.inert) return;
  entryDialog.getAnimations().forEach(animation=>animation.cancel());
  const animation = animateElement(entryDialog, [{opacity:1,transform:'translateY(0)'},{opacity:0,transform:'translateY(16px)'}],180);
  if (!animation) { entryDialog.close(); return; }
  entryDialog.inert = true;
  animation.finished.catch(()=>{}).then(()=>{entryDialog.close();entryDialog.inert=false;});
}
entryDialog.addEventListener('cancel', event=>{event.preventDefault();closeEntryDialog();});
const language = () => (tab === 'settings' ? settingsDraft?.language : null) || data?.settings.language || 'de';
const t = key => messages[language()][key] || key;
const locale = () => language() === 'de' ? 'de-DE' : 'en-GB';
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
const num = value => new Intl.NumberFormat(locale(), { maximumFractionDigits: 2 }).format(value);
const hrs = minutes => num(minutes / 60);
const displayDate = (date, options = { day:'numeric', month:'long' }) => new Intl.DateTimeFormat(locale(), options).format(parseDate(date));
const dateRange = (start, end) => `${displayDate(start, { day:'numeric', month:'short' })} – ${displayDate(end, { day:'numeric', month:'short' })}`;
const entryCount = count => `${count} ${t(count === 1 ? 'entry' : 'entries')}`;
const iconPaths = {
  plus:'<path d="M12 5v14M5 12h14"/>', close:'<path d="m6 6 12 12M18 6 6 18"/>',
  overview:'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  calendar:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18M8 15h2M14 15h2"/>',
  settings:'<path d="M4 6h4m4 0h8M4 12h9m4 0h3M4 18h2m4 0h10"/><circle cx="10" cy="6" r="2"/><circle cx="15" cy="12" r="2"/><circle cx="8" cy="18" r="2"/>',
  left:'<path d="m14 6-6 6 6 6"/>', right:'<path d="m9 6 6 6-6 6"/>',
  download:'<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>', upload:'<path d="M12 16V4m-5 5 5-5 5 5M4 17v4h16v-4"/>',
  sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1 1m12 12 1 1M5 19l1-1M18 6l1-1"/>', moon:'<path d="M20 15A9 9 0 0 1 9 4a9 9 0 1 0 11 11Z"/>',
  file:'<path d="M14 3H5v18h14V8zM14 3v5h5M8 12h8M8 16h8"/>', check:'<path d="m5 12 4 4L19 6"/>'
};
const icon = name => `<svg viewBox="0 0 24 24" aria-hidden="true">${iconPaths[name] || ''}</svg>`;
function load() {
  try {
    rawData = localStorage.getItem(KEY); lastStored = rawData;
    data = rawData ? validateData(JSON.parse(rawData)) : initialData();
  } catch { corrupt = true; data = initialData(); }
}
load();
function toast(message) {
  const el = document.querySelector('#toast');
  el.textContent = message; el.classList.add('visible');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('visible'), 4300);
}
function saveData(next, { changed = true, replace = false } = {}) {
  try {
    if (!replace && localStorage.getItem(KEY) !== lastStored) throw new Error('changedElsewhere');
    if (changed) next.revision = data.revision + 1;
    const json = JSON.stringify(next);
    localStorage.setItem(KEY, json);
    data = next; rawData = json; lastStored = json; corrupt = false;
    return true;
  } catch (error) { toast(t(error.message === 'changedElsewhere' ? 'changedElsewhere' : 'storageError')); return false; }
}
function updateSettings(changes) {
  const next = structuredClone(data); Object.assign(next.settings, changes);
  if (saveData(next)) render();
}
function applyTheme() {
  const theme = (tab === 'settings' ? settingsDraft?.theme : null) || data.settings.theme;
  document.documentElement.dataset.theme = theme;
  document.documentElement.lang = language();
  document.querySelector('meta[name="theme-color"]').content = theme === 'dark' ? '#343534' : '#faf8f3';
  document.title = language() === 'de' ? 'stunden — dein Stundenbuch' : 'stunden — your work journal';
}
function render() {
  const contentScroll = app.querySelector('.app-shell')?.scrollTop || 0;
  if (tab === 'settings' && !settingsDraft && data.onboardingDone && !corrupt) beginSettings();
  const previousProgress = app.querySelector('.track > span')?.style.width;
  const view = `${tab}:${tab==='calendar'?calendarMode:''}`;
  const heatScroll = app.querySelector('.year-scroll')?.scrollLeft || 0;
  applyTheme();
  if (corrupt) { renderRecovery(); return; }
  if (!data.onboardingDone) { renderOnboarding(); return; }
  app.innerHTML = `<div class="app-shell"><header class="app-header"><span class="brand">stunden</span><span class="header-date">${displayDate(today, { weekday:'short', day:'numeric', month:'short' })}</span></header><main class="page" id="page">${tab === 'overview' ? overviewHTML() : tab === 'calendar' ? calendarHTML() : settingsHTML()}</main></div>
    <nav class="tabbar" aria-label="${t('overview')} / ${t('calendar')} / ${t('settings')}">${['overview','calendar','settings'].map(name => `<button type="button" data-tab="${name}" ${tab === name ? 'aria-current="page"' : ''}>${icon(name)}<span>${t(name)}</span></button>`).join('')}</nav>`;
  bindPage();
  const contentScroller = app.querySelector('.app-shell');
  if (contentScroller) contentScroller.scrollTop = contentScroll;
  if (renderedView !== null && renderedView !== view) animateElement(app.querySelector('#page'),[{opacity:.35},{opacity:1}],160);
  renderedView = view;
  const progress = app.querySelector('.track > span');
  if (progress && previousProgress && previousProgress !== progress.style.width) animateElement(progress,[{width:previousProgress},{width:progress.style.width}],220);
  const heatScroller = app.querySelector('.year-scroll');
  if (heatScroller) heatScroller.scrollLeft = heatScroll;
}
function entryList(entries, emptyText = 'noDayEntries') {
  if (!entries.length) return `<div class="empty">${emptyText === 'noEntriesText' ? `<strong>${t('noEntries')}</strong>` : ''}<p>${t(emptyText)}</p></div>`;
  return `<ul class="entries">${entries.map(e => `<li class="entry-row"><button class="entry-button" data-edit="${esc(e.id)}" aria-label="${t('edit')}: ${esc(sessionLabel(e, data.entries))}, ${hrs(e.minutes)} ${t('hours')}"><span class="entry-description">${esc(sessionLabel(e, data.entries))}</span><span class="entry-right">${hrs(e.minutes)} ${t('hours')}${icon('right')}</span></button></li>`).join('')}</ul>`;
}
function overviewHTML() {
  const entries = entriesBetween(data, today, today);
  const [start, end] = periodBounds(today, period);
  const total = sumMinutes(entriesBetween(data, start, end));
  const goal = goalHours(data, today, period);
  const currentDate = parseDate(today);
  const expectedPercent = (period === 'week' ? ((currentDate.getDay() + 6) % 7 + 1) / 7 : currentDate.getDate() / monthDays(today)) * 100;
  const rest = goal === null ? null : goal * 60 - total;
  const percent = goal > 0 ? Math.min(100, total / (goal * 60) * 100) : total > 0 ? 100 : 0;
  return `<section class="hero" aria-labelledby="today-label"><div class="hero-top"><h1 class="eyebrow" id="today-label">${t('todayWorked')}</h1><span class="meta">${entryCount(entries.length)}</span></div><div class="hero-value">${hrs(sumMinutes(entries))}<small>${t('hours')}</small></div><button class="button primary full" data-add="${today}">${icon('plus')}${t('add')}</button></section>
    <section aria-label="${t(period)}"><div class="period-switch" aria-label="${t('week')} / ${t('month')}">${['week','month'].map(p => `<button data-period="${p}" aria-pressed="${p === period}">${t(p)}</button>`).join('')}</div><div class="metrics"><div class="metric"><div class="metric-label">${t('worked')}</div><div class="metric-value">${hrs(total)} <small>${t('hours')}</small></div></div><div class="metric"><div class="metric-label">${t(rest === 0 ? 'reached' : rest < 0 ? 'over' : 'remaining')}</div><div class="metric-value">${rest === null ? '–' : hrs(Math.abs(rest))} <small>${t('hours')}</small></div></div></div><div class="track" role="progressbar" aria-label="${t('goal')}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(percent)}"><span style="width:${percent}%"></span>${goal > 0 ? `<i class="track-target" style="left:clamp(1px, ${expectedPercent}%, calc(100% - 1px))" aria-hidden="true"></i>` : ''}</div><div class="goal-detail"><span>${period === 'week' ? dateRange(start,end) : displayDate(today,{month:'long',year:'numeric'})}</span><span>${goal === null ? t('noGoal') : `${t('goal')}: ${num(goal)} ${t('hours')}`}</span></div></section>
    <section><div class="section-heading"><h2>${t('todayEntries')}</h2><span class="meta">${displayDate(today,{day:'2-digit',month:'2-digit'})}</span></div>${entryList(entries,'noEntriesText')}</section>
    ${backupDue(data,today) ? `<aside class="reminder"><button class="icon-button" data-dismiss-backup aria-label="${t('dismiss')}">${icon('close')}</button><h3>${t('reminderTitle')}</h3><p>${t('reminderText')}</p><button class="button secondary" data-backup>${icon('download')}${t('exportBackup')}</button></aside>` : ''}`;
}
function calendarHTML() {
  if (calendarMode === 'heatmap') return heatmapHTML();
  const first = parseDate(calendarMonth);
  const offset = (first.getDay()+6)%7;
  const dayCount = monthDays(calendarMonth);
  const monthEntries = entriesBetween(data, calendarMonth, shiftDay(calendarMonth,dayCount-1));
  const sums = new Map(); monthEntries.forEach(e => sums.set(e.date,(sums.get(e.date)||0)+e.minutes));
  const selectedEntries = entriesBetween(data, selectedDate, selectedDate);
  const goal = goalHours(data, calendarMonth,'month');
  const weekdays = Array.from({length:7}, (_,i) => displayDate(shiftDay('2026-10-12',i),{weekday:'short'}));
  return `<section><div class="calendar-heading"><h1>${displayDate(calendarMonth,{month:'long',year:'numeric'})}</h1><div class="calendar-controls"><button class="icon-button" data-month="-1" aria-label="${t('prevMonth')}">${icon('left')}</button><button class="icon-button" data-month="1" aria-label="${t('nextMonth')}">${icon('right')}</button></div></div><div class="calendar-summary"><span>${hrs(sumMinutes(monthEntries))} ${t('hours')}${goal === null ? '' : ` / ${num(goal)} ${t('hours')}`}</span><button class="text-link" data-today>${t('today')}</button></div></section>
    <div class="calendar-grid" aria-label="${t('calendar')}">${weekdays.map(day => `<div class="weekday">${day}</div>`).join('')}${'<div aria-hidden="true"></div>'.repeat(offset)}${Array.from({length:dayCount},(_,i)=>{
      const date = shiftDay(calendarMonth,i), total = sums.get(date)||0;
      return `<button class="day heat-${heatLevel(total)} ${total ? 'has-entry' : ''} ${date === today ? 'is-today' : ''}" data-date="${date}" aria-pressed="${date === selectedDate}" ${date===today?'aria-current="date"':''} aria-label="${displayDate(date,{day:'numeric',month:'long',year:'numeric'})}, ${hrs(total)} ${t('hours')}"><span class="day-number">${i+1}</span><small>${total ? `${hrs(total)} ${t('hours')}` : '&nbsp;'}</small></button>`;
    }).join('')}</div>
    <section class="calendar-selected"><div class="section-heading"><h2>${displayDate(selectedDate,{weekday:'short',day:'numeric',month:'long'})}</h2><span class="meta">${hrs(sumMinutes(selectedEntries))} ${t('hours')}</span></div>${entryList(selectedEntries)}${selectedDate <= today ? `<button class="button secondary full" data-add="${selectedDate}">${icon('plus')}${t('addEntry')}</button>` : ''}</section>`;
}
const heatLevel = minutes => minutes === 0 ? 0 : minutes <= 60 ? 1 : minutes <= 120 ? 2 : minutes <= 240 ? 3 : 4;
function heatmapHTML() {
  const start = `${heatYear}-01-01`, end = `${heatYear}-12-31`;
  const offset = (parseDate(start).getDay()+6)%7;
  const count = Array.from({length:12},(_,i)=>monthDays(`${heatYear}-${String(i+1).padStart(2,'0')}-01`)).reduce((a,b)=>a+b,0);
  const sums = new Map();
  const yearEntries = entriesBetween(data,start,end);
  yearEntries.forEach(e=>sums.set(e.date,(sums.get(e.date)||0)+e.minutes));
  let labels = '';
  const cells = Array.from({length:count},(_,i)=>{
    const date=shiftDay(start,i), minutes=sums.get(date)||0, column=Math.floor((offset+i)/7)+1;
    if(date.endsWith('-01')) labels+=`<span style="grid-column:${column};grid-row:1">${displayDate(date,{month:'short'})}</span>`;
    return `<button class="year-day heat-${heatLevel(minutes)}" style="grid-column:${column};grid-row:${(offset+i)%7+1}" data-date="${date}" aria-pressed="${date===selectedDate}" ${date>today?'disabled':''} ${date===today?'aria-current="date"':''} aria-label="${displayDate(date,{day:'numeric',month:'long',year:'numeric'})}, ${hrs(minutes)} ${t('hours')}"></button>`;
  }).join('');
  const entries=entriesBetween(data,selectedDate,selectedDate);
  return `<section><div class="calendar-heading"><h1>${heatYear}</h1><div class="calendar-controls"><button class="icon-button" data-year="-1" aria-label="${language()==='de'?'Vorheriges Jahr':'Previous year'}">${icon('left')}</button><button class="icon-button" data-year="1" aria-label="${language()==='de'?'Nächstes Jahr':'Next year'}">${icon('right')}</button></div></div><p class="help">${hrs(sumMinutes(yearEntries))} ${t('hours')} · ${t('heatDuration')}</p></section>
  <section class="year-map" aria-label="Heatmap ${heatYear}"><div class="year-layout"><div class="year-weekdays">${Array.from({length:7},(_,i)=>`<span>${i%2===0?displayDate(shiftDay('2026-10-12',i),{weekday:'short'}):''}</span>`).join('')}</div><div class="year-scroll" tabindex="0" aria-label="${language()==='de'?'Jahresheatmap, horizontal scrollbar':'Year heatmap, scroll horizontally'}"><div class="year-months">${labels}</div><div class="year-grid">${cells}</div></div></div><div class="heat-legend">${[0,1,2,3,4].map(n=>`<span class="heat-key heat-${n}"><i></i>${['0','≤1','≤2','≤4','>4'][n]}</span>`).join('')}<span>${t('hours')}</span></div></section>
  ${selectedDate.startsWith(String(heatYear))?`<section class="calendar-selected"><div class="section-heading"><h2>${displayDate(selectedDate,{weekday:'short',day:'numeric',month:'long'})}</h2><span class="meta">${hrs(sumMinutes(entries))} ${t('hours')}</span></div>${entryList(entries)}${selectedDate<=today?`<button class="button secondary full" data-add="${selectedDate}">${icon('plus')}${t('addEntry')}</button>`:''}</section>`:''}`;
}
function beginSettings() {
  const weekly=ruleAt(data.goals.weekly,weekStart(today))?.hours ?? '';
  const monthly=ruleAt(data.goals.monthly,monthStart(today));
  settingsDraft={...data.settings,weekly:String(weekly).replace('.',language()==='de'?',':'.'),monthly:String(goalHours(data,today,'month')??0).replace('.',language()==='de'?',':'.'),linked:monthly?.linked??true};
  settingsSnapshot=lastStored;
}
function captureSettings() {
  const form=app.querySelector('#goals-form');
  if(!settingsDraft||!form)return;
  settingsDraft.weekly=form.elements.weekly.value;
  settingsDraft.monthly=form.elements.monthly.value;
  settingsDraft.linked=form.elements.linked.checked;
}
function commitSettings(showError=true) {
  if(!settingsDraft)return true;
  captureSettings();
  const errorEl=app.querySelector('#goals-form .form-error');
  try {
    if(settingsSnapshot!==lastStored)throw new Error('changedElsewhere');
    const next=structuredClone(data);
    const weeklyHours=numberValue(settingsDraft.weekly), monthlyHours=numberValue(settingsDraft.monthly);
    const currentWeekly=ruleAt(data.goals.weekly,weekStart(today))?.hours;
    const currentMonthly=ruleAt(data.goals.monthly,monthStart(today));
    if(weeklyHours!==currentWeekly||settingsDraft.linked!==currentMonthly?.linked||(!settingsDraft.linked&&monthlyHours!==currentMonthly?.hours)) {
      changeGoals(next,{weeklyHours,monthlyHours,linked:settingsDraft.linked},today);
    }
    next.settings={theme:settingsDraft.theme,language:settingsDraft.language,reminderEnabled:settingsDraft.reminderEnabled};
    if(JSON.stringify(next)===JSON.stringify(data))return true;
    if(!saveData(next))return false;
    settingsSnapshot=lastStored;
    return true;
  } catch(error) {
    if(showError&&errorEl){errorEl.textContent=t(error.message);errorEl.scrollIntoView({block:'center'});}
    return false;
  }
}
function settingsHTML() {
  const weekly = settingsDraft.weekly;
  const monthly = settingsDraft;
  return `<h1 class="page-title">${t('settings')}</h1>
    <section class="settings-group"><h2>${t('goals')}</h2><form id="goals-form" novalidate><label class="field"><span class="field-label">${t('weeklyGoal')}</span><div class="input-unit"><input name="weekly" inputmode="decimal" value="${esc(weekly)}" required autocomplete="off"><span>${t('hours')}</span></div></label><label class="toggle-label"><input type="checkbox" name="linked" ${monthly?.linked ? 'checked':''}>${t('linked')}</label><p class="help">${t('linkedHint')}</p><label class="field"><span class="field-label">${t('monthlyGoal')}</span><div class="input-unit"><input name="monthly" inputmode="decimal" value="${esc(settingsDraft.monthly)}" ${monthly?.linked ? 'readonly':''} required autocomplete="off"><span>${t('hours')}</span></div></label><p class="help">${t('goalHint')}</p><p class="form-error" role="alert"></p></form></section>
    <section class="settings-group"><h2>${t('appearance')}</h2><div class="preference-row"><span>${t('appearance')}</span><button class="state-toggle" id="theme-toggle" aria-label="${t('appearance')}: ${t(settingsDraft.theme)}">${icon(settingsDraft.theme==='dark'?'moon':'sun')}<span>${t(settingsDraft.theme)}</span></button></div><div class="preference-row"><span>${t('language')}</span><button class="state-toggle" id="language-toggle" aria-label="${t('language')}: ${language()==='de'?'Deutsch':'English'}">${language()==='de'?'DE':'EN'}</button></div></section>
    <section class="settings-group"><h2>${t('backup')}</h2><p>${t('backupHelp')}</p><p class="help">${data.lastBackupAt ? `${t('lastBackup')}: ${new Intl.DateTimeFormat(locale(),{dateStyle:'medium',timeStyle:'short'}).format(new Date(data.lastBackupAt))}` : t('never')}</p><div class="settings-actions"><button class="button secondary" data-backup>${icon('download')}${t('exportBackup')}</button><button class="button secondary" data-import>${icon('upload')}${t('importBackup')}</button></div><label class="toggle-label" style="margin-top:20px"><input id="reminder-toggle" type="checkbox" ${settingsDraft.reminderEnabled?'checked':''}>${t('reminder')}</label><p class="help" style="margin-bottom:0">${t('reminderHint')}</p></section>
    <section class="settings-group"><h2>${t('csv')}</h2><p>${t('csvHint')}</p><label class="field" style="margin-top:16px"><span class="field-label">${t('month')}</span><input id="csv-month" type="month" value="${today.slice(0,7)}"></label><button class="button secondary full" id="export-csv">${icon('file')}${t('exportCSV')}</button></section>`;
}
function bindPage() {
  app.querySelectorAll('[data-year]').forEach(button=>button.onclick=()=>{heatYear=Math.max(1900,Math.min(9999,heatYear+Number(button.dataset.year)));selectedDate=heatYear===parseDate(today).getFullYear()?today:`${heatYear}-01-01`;render();});
  app.querySelectorAll('[data-tab]').forEach(button => button.onclick=()=>{const target=button.dataset.tab;if(target===tab){if(tab==='calendar'){calendarMode=calendarMode==='calendar'?'heatmap':'calendar';calendarMonth=monthStart(selectedDate);render();app.querySelector('.app-shell')?.scrollTo(0,0);}return;}if(tab==='settings'&&!commitSettings())return;settingsDraft=null;tab=target;render();app.querySelector('.app-shell')?.scrollTo(0,0);});
  app.querySelectorAll('[data-period]').forEach(button=>button.onclick=()=>{period=button.dataset.period;render();});
  app.querySelectorAll('[data-add]').forEach(button=>button.onclick=()=>openEntry(null,button.dataset.add));
  app.querySelectorAll('[data-edit]').forEach(button=>button.onclick=()=>openEntry(button.dataset.edit));
  app.querySelectorAll('[data-month]').forEach(button=>button.onclick=()=>{calendarMonth=shiftMonth(calendarMonth,Number(button.dataset.month));selectedDate=calendarMonth;render();});
  app.querySelectorAll('[data-date]').forEach(button=>button.onclick=()=>{selectedDate=button.dataset.date;render();});
  app.querySelector('[data-today]')?.addEventListener('click',()=>{selectedDate=today;calendarMonth=monthStart(today);render();});
  app.querySelectorAll('[data-backup]').forEach(button=>button.onclick=createBackup);
  app.querySelectorAll('[data-import]').forEach(button=>button.onclick=()=>importFile.click());
  app.querySelector('[data-dismiss-backup]')?.addEventListener('click',()=>{const next=structuredClone(data);next.dismissedReminderMonth=today.slice(0,7);if(saveData(next,{changed:false}))render();});
  app.querySelector('#theme-toggle')?.addEventListener('click',()=>{captureSettings();settingsDraft.theme=settingsDraft.theme==='dark'?'light':'dark';render();});
  app.querySelector('#language-toggle')?.addEventListener('click',()=>{captureSettings();settingsDraft.language=settingsDraft.language==='de'?'en':'de';render();});
  app.querySelector('#reminder-toggle')?.addEventListener('change',e=>{settingsDraft.reminderEnabled=e.target.checked;});
  app.querySelector('#export-csv')?.addEventListener('click',()=>{
    const start=`${app.querySelector('#csv-month').value}-01`;
    if (!parseDate(start)) return;
    const entries=entriesBetween(data,start,shiftDay(start,monthDays(start)-1));
    if(!entries.length){toast(t('noCSV'));return;}
    download(exportCSV(entries,language()),`stunden-${start.slice(0,7)}.csv`,'text/csv;charset=utf-8');toast(t('csvCreated'));
  });
  const form=app.querySelector('#goals-form');
  if(form){
    const weekly=form.elements.weekly, monthly=form.elements.monthly, linked=form.elements.linked;
    const update=()=>{monthly.readOnly=linked.checked;if(linked.checked){const value=numberValue(weekly.value);monthly.value=Number.isFinite(value)?num(Math.round(value/7*monthDays(today))):'';}};
    weekly.addEventListener('input',update);linked.addEventListener('change',update);
    form.addEventListener('input',captureSettings);
    form.addEventListener('change',captureSettings);
    form.onsubmit=e=>e.preventDefault();
  }
}
function renderOnboarding() {
  const stepNumber=onboardingStep==='welcome'?'01':'02';
  const top=`<div class="onboarding-top"><span class="brand">stunden</span><span class="onboarding-step">${stepNumber} / 02</span></div>`;
  if(onboardingStep==='welcome'){
    app.innerHTML=`<main class="onboarding">${top}<span class="eyebrow">${t('onboardingWelcome')}</span><h1>${t('welcome')}</h1><p class="onboarding-intro">${t('welcomeText')}</p><div class="onboarding-preferences"><div class="preference-row"><span>${t('appearance')}</span><button class="state-toggle" id="setup-theme">${data.settings.theme==='dark'?t('dark'):t('light')}</button></div><div class="preference-row"><span>${t('language')}</span><button class="state-toggle" id="setup-language">${language()==='de'?'Deutsch':'English'}</button></div></div><div class="onboarding-choices"><button class="onboarding-choice primary-choice" id="setup-new"><span><strong>${t('startFresh')}</strong><small>${t('startFreshHint')}</small></span>${icon('right')}</button><button class="onboarding-choice" data-import><span><strong>${t('importBackup')}</strong><small>${t('restoreChoiceHint')}</small></span>${icon('right')}</button></div><p class="local-note">${t('localNoteShort')}</p></main>`;
    app.querySelector('#setup-language').onclick=()=>updateSettings({language:language()==='de'?'en':'de'});
    app.querySelector('#setup-theme').onclick=()=>updateSettings({theme:data.settings.theme==='dark'?'light':'dark'});
    app.querySelector('#setup-new').onclick=()=>{onboardingStep='goal';render();};
    app.querySelector('[data-import]').onclick=()=>importFile.click();
    return;
  }
  const weekly=onboardingGoalType==='week';
  app.innerHTML=`<main class="onboarding">${top}<span class="eyebrow">${t('onboardingGoal')}</span><h1>${t('rhythm')}</h1><p class="onboarding-intro">${t('goalChoiceHint')}</p><div class="period-switch onboarding-period" role="group" aria-label="${t('week')} / ${t('month')}"><button type="button" data-setup-period="week" aria-pressed="${weekly}">${t('week')}</button><button type="button" data-setup-period="month" aria-pressed="${!weekly}">${t('month')}</button></div><form id="setup-form" class="setup-form" novalidate><label class="field"><span class="field-label">${t(weekly?'weeklyGoal':'monthlyGoal')}</span><div class="onboarding-goal-input"><input name="goal" inputmode="decimal" placeholder="0" required autocomplete="off"><span>${t(weekly?'hoursPerWeek':'hoursPerMonth')}</span></div></label><p class="form-error" role="alert"></p></form><div class="onboarding-footer"><button class="onboarding-back" id="setup-back">${icon('left')}${t('back')}</button><button type="submit" form="setup-form" class="button primary full">${t('finishSetup')}${icon('right')}</button></div></main>`;
  const form=app.querySelector('#setup-form');
  app.querySelectorAll('[data-setup-period]').forEach(button=>button.onclick=()=>{onboardingGoalType=button.dataset.setupPeriod;render();});
  app.querySelector('#setup-back').onclick=()=>{onboardingStep='welcome';render();};
  form.onsubmit=e=>{e.preventDefault();const next=structuredClone(data);const entered=numberValue(form.elements.goal.value);try{
    if(weekly)changeGoals(next,{weeklyHours:entered,linked:true},today);
    else changeGoals(next,{weeklyHours:entered/monthDays(today)*7,monthlyHours:entered,linked:false},today);
    next.onboardingDone=true;
    if(saveData(next)){onboardingStep='welcome';render();navigator.storage?.persist?.().catch(()=>{});}
  }catch(error){form.querySelector('.form-error').textContent=t(error.message);}};
}
function openEntry(id=null,date=today) {
  const entry=id?data.entries.find(e=>e.id===id):null;
  if(id&&!entry)return;
  editingId=id;entryUnit='hours';formSnapshot=lastStored;
  entryDialog.innerHTML=`<form class="sheet-content" id="entry-form" novalidate><div class="sheet-header"><h2 id="entry-title">${t(id?'editEntry':'newEntry')}</h2><button type="button" class="icon-button" data-close aria-label="${t('close')}">${icon('close')}</button></div><label class="field"><span class="field-label">${t('date')}</span><input type="date" name="date" value="${entry?.date||date}" max="${today}" required></label><div class="duration-heading"><label class="field-label" for="duration-input">${t('duration')}</label><div class="unit-switch"><button type="button" data-unit="hours" aria-pressed="true">${t('unitHours')}</button><button type="button" data-unit="minutes" aria-pressed="false">${t('unitMinutes')}</button></div></div><input class="duration-input" id="duration-input" name="duration" inputmode="decimal" autocomplete="off" placeholder="0" value="${entry?inputHours(entry.minutes):''}" required><div class="quick-add">${[15,30,60].map(value=>`<button type="button" data-increment="${value}">+${value===60?'1 '+t('hours'):value+' '+t('minutes')}</button>`).join('')}</div><label class="field"><span class="field-label">${t('description')} <small>${t('optional')}</small></span><textarea name="note" rows="2" maxlength="240" placeholder="${t('notePlaceholder')}">${esc(entry?.note||'')}</textarea></label><p class="form-error" role="alert"></p><div class="dialog-actions"><button type="button" class="button secondary" data-close>${t('cancel')}</button><button type="submit" class="button primary">${t('save')}</button></div>${id?`<button type="button" class="button danger delete-action" id="delete-entry">${t('delete')}</button>`:''}</form>`;
  const form=entryDialog.querySelector('form'), input=form.elements.duration;
  entryDialog.querySelectorAll('[data-close]').forEach(button=>button.onclick=()=>closeEntryDialog());
  entryDialog.querySelectorAll('[data-unit]').forEach(button=>button.onclick=()=>{
    const minutes=durationMinutes(input.value,entryUnit);entryUnit=button.dataset.unit;
    if(Number.isFinite(minutes)) input.value=entryUnit==='hours'?inputHours(minutes):String(minutes);
    entryDialog.querySelectorAll('[data-unit]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));
  });
  entryDialog.querySelectorAll('[data-increment]').forEach(button=>button.onclick=()=>{
    const current=durationMinutes(input.value,entryUnit);if(input.value.trim()&&!Number.isFinite(current)){form.querySelector('.form-error').textContent=t('invalidDuration');return;}
    const minutes=(current||0)+Number(button.dataset.increment);input.value=entryUnit==='hours'?inputHours(minutes):String(minutes);form.querySelector('.form-error').textContent='';
  });
  form.onsubmit=e=>{e.preventDefault();const errorEl=form.querySelector('.form-error');
    if(formSnapshot!==lastStored){errorEl.textContent=t('changedElsewhere');return;}
    const now=new Date().toISOString();
    const record={id:id||crypto.randomUUID(),date:form.elements.date.value,minutes:durationMinutes(input.value,entryUnit),note:form.elements.note.value.trim(),createdAt:entry?.createdAt||now,updatedAt:now};
    try{validateEntry(record,data.entries,today);const next=structuredClone(data);next.entries=next.entries.filter(e=>e.id!==record.id);next.entries.push(record);if(saveData(next)){closeEntryDialog();selectedDate=record.date;calendarMonth=monthStart(record.date);render();toast(t('saved'));}else errorEl.textContent=t('storageError');}catch(error){errorEl.textContent=t(error.message);}
  };
  entryDialog.querySelector('#delete-entry')?.addEventListener('click',()=>confirmDelete(id));
  entryDialog.inert=false;
  entryDialog.showModal();
  animateElement(entryDialog,[{opacity:0,transform:'translateY(16px)'},{opacity:1,transform:'translateY(0)'}],180);
}
function inputHours(minutes){return (minutes/60).toFixed(6).replace(/0+$/,'').replace(/\.$/,'').replace('.',language()==='de'?',':'.');}
function confirmDelete(id) {
  confirmDialog.innerHTML=`<div class="sheet-content"><div class="sheet-header"><h2 id="confirm-title">${t('deleteTitle')}</h2></div><p class="confirm-copy">${t('deleteHint')}</p><p class="form-error" role="alert"></p><div class="dialog-actions"><button class="button secondary" data-cancel>${t('cancel')}</button><button class="button primary" data-confirm>${t('confirmDelete')}</button></div></div>`;
  confirmDialog.querySelector('[data-cancel]').onclick=()=>confirmDialog.close();
  confirmDialog.querySelector('[data-confirm]').onclick=()=>{
    if(formSnapshot!==lastStored){confirmDialog.querySelector('.form-error').textContent=t('changedElsewhere');return;}
    const next=structuredClone(data);next.entries=next.entries.filter(e=>e.id!==id);
    if(saveData(next)){confirmDialog.close();closeEntryDialog();render();toast(t('deleted'));}
  };confirmDialog.showModal();
}
function download(content, name, type='application/json') {
  const url=URL.createObjectURL(new Blob([content],{type}));
  const link=document.createElement('a');link.href=url;link.download=name;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
}
function createBackup() {
  if(corrupt)return;
  if(tab==='settings'&&!commitSettings())return;
  const next=structuredClone(data);next.lastBackupAt=new Date().toISOString();next.backedUpRevision=next.revision;
  download(JSON.stringify(next,null,2),`stunden-backup-${today}.json`);
  if(saveData(next,{changed:false})){if(tab==='settings')settingsSnapshot=lastStored;render();toast(t('backupCreated'));}
}
importFile.addEventListener('change',async()=>{
  const file=importFile.files[0];importFile.value='';if(!file)return;
  try{
    if(file.size>5*1024*1024)throw new Error('fileTooLarge');
    pendingImport=validateData(JSON.parse(await file.text()));
    const dates=pendingImport.entries.map(e=>e.date).sort();
    confirmDialog.innerHTML=`<div class="sheet-content"><div class="sheet-header"><h2 id="confirm-title">${t('restoreTitle')}</h2><button class="icon-button" data-cancel aria-label="${t('close')}">${icon('close')}</button></div><p class="confirm-copy">${t('restoreHint')}</p><div class="restore-details">${entryCount(pendingImport.entries.length)}<br>${dates.length?`${t('importRange')}: ${dates[0]} – ${dates.at(-1)}`:t('emptyBackup')}</div>${!corrupt&&data.entries.length?`<button class="button quiet" data-backup-first>${icon('download')}${t('backupFirst')}</button>`:''}<p class="form-error" role="alert"></p><div class="dialog-actions"><button class="button secondary" data-cancel>${t('cancel')}</button><button class="button primary" data-restore>${t('restoreButton')}</button></div></div>`;
    confirmDialog.querySelectorAll('[data-cancel]').forEach(b=>b.onclick=()=>confirmDialog.close());
    confirmDialog.querySelector('[data-backup-first]')?.addEventListener('click',createBackup);
    confirmDialog.querySelector('[data-restore]').onclick=()=>{const next=structuredClone(pendingImport);if(saveData(next,{changed:false,replace:true})){confirmDialog.close();pendingImport=null;settingsDraft=null;tab='overview';calendarMonth=monthStart(today);selectedDate=today;render();toast(t('restored'));}};
    confirmDialog.showModal();
  }catch(error){toast(t(error.message==='fileTooLarge'?'fileTooLarge':'invalidBackup'));}
});
function renderRecovery(){
  app.innerHTML=`<main class="recovery"><span class="brand">stunden</span><h1 style="margin-top:30px">${t('corruptTitle')}</h1><p>${t('corruptText')}</p><button class="button secondary full" id="raw-backup">${t('downloadRaw')}</button><button class="button primary full" id="recover-import">${t('recovery')}</button></main>`;
  app.querySelector('#raw-backup').onclick=()=>download(rawData||'',`stunden-recovery-${today}.txt`,'text/plain');
  app.querySelector('#recover-import').onclick=()=>importFile.click();
}
window.addEventListener('storage',event=>{if(event.key===KEY){load();render();if(entryDialog.open)entryDialog.querySelector('.form-error').textContent=t('changedElsewhere');}});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&tab==='settings'&&settingsDraft)commitSettings(false);if(!document.hidden){const current=dateKey();if(current!==today){today=current;render();}}});
async function prepareOffline(){
  const local=['localhost','127.0.0.1'].includes(location.hostname);
  if(!('serviceWorker' in navigator)||local&&!new URLSearchParams(location.search).has('offline'))return;
  offlineStatus='offlineLoading';
  try{await navigator.serviceWorker.register('./sw.js');await navigator.serviceWorker.ready;offlineStatus='offlineReady';}catch{offlineStatus='offlineFailed';}
  const status=document.querySelector('#offline-status');if(status)status.textContent=t(offlineStatus);
}
render();prepareOffline();
