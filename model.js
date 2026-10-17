// Calendar dates are local, represented as YYYY-MM-DD strings. Never parse them as UTC.
export function dateKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
export function parseDate(key) {
  if (typeof key !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(key)) return null;
  const [year, month, day] = key.split('-').map(Number);
  if (year < 1900 || year > 9999) return null;
  const date = new Date(year, month - 1, day, 12);
  return dateKey(date) === key ? date : null;
}
export function shiftDay(key, amount) {
  const date = parseDate(key);
  date.setDate(date.getDate() + amount);
  return dateKey(date);
}
export const monthStart = key => `${key.slice(0, 7)}-01`;
export function monthDays(key) {
  const d = parseDate(monthStart(key));
  return new Date(d.getFullYear(), d.getMonth() + 1, 0, 12).getDate();
}
export function shiftMonth(key, amount) {
  const date = parseDate(monthStart(key));
  date.setMonth(date.getMonth() + amount);
  return dateKey(date);
}
export function weekStart(key) {
  return shiftDay(key, -((parseDate(key).getDay() + 6) % 7));
}
export function periodBounds(key, period) {
  const start = period === 'week' ? weekStart(key) : monthStart(key);
  return [start, period === 'week' ? shiftDay(start, 6) : shiftDay(start, monthDays(start) - 1)];
}
export function numberValue(value) {
  const raw = String(value).trim();
  if (!/^\d+(?:[.,]\d+)?$/.test(raw)) return NaN;
  return Number(raw.replace(',', '.'));
}
export function durationMinutes(value, unit = 'hours') {
  const n = numberValue(value);
  if (!Number.isFinite(n)) return NaN;
  return Math.round(unit === 'hours' ? n * 60 : n);
}
export const sumMinutes = entries => entries.reduce((sum, entry) => sum + entry.minutes, 0);
export function entriesBetween(data, start, end) {
  return data.entries.filter(e => e.date >= start && e.date <= end).sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
}
export function ruleAt(rules, date) {
  return [...rules].reverse().find(rule => rule.from <= date) || null;
}
export function goalHours(data, date, period) {
  if (period === 'week') return ruleAt(data.goals.weekly, weekStart(date))?.hours ?? null;
  const rule = ruleAt(data.goals.monthly, monthStart(date));
  return rule ? (rule.linked ? Math.round(rule.weeklyHours / 7 * monthDays(date)) : rule.hours) : null;
}
export function dailyGoalReached(data, date, minutes) {
  const weekly = goalHours(data, date, 'week');
  return weekly !== null && weekly > 0 && minutes * 7 >= weekly * 60;
}
export function initialData(today = dateKey()) {
  return {
    schemaVersion: 1, entries: [], settings: { language: 'de', theme: 'dark', reminderEnabled: true },
    goals: { weekly: [], monthly: [] }, onboardingDone: false,
    revision: 0, backedUpRevision: -1, lastBackupAt: null, dismissedReminderMonth: null,
    firstUseDate: today
  };
}
export function changeGoals(data, { weeklyHours, monthlyHours, linked }, today = dateKey()) {
  if (!Number.isFinite(weeklyHours) || weeklyHours <= 0 || weeklyHours > 168) throw new Error('invalidGoal');
  if (!linked && (!Number.isFinite(monthlyHours) || monthlyHours <= 0 || monthlyHours > 744)) throw new Error('invalidGoal');
  const put = (rules, rule) => [...rules.filter(r => r.from !== rule.from), rule].sort((a, b) => a.from.localeCompare(b.from));
  data.goals.weekly = put(data.goals.weekly, { from: weekStart(today), hours: weeklyHours });
  data.goals.monthly = put(data.goals.monthly, { from: monthStart(today), linked, weeklyHours, hours: linked ? Math.round(weeklyHours / 7 * monthDays(today)) : monthlyHours });
}
export function validateEntry(entry, entries, today = dateKey()) {
  if (!parseDate(entry.date) || entry.date > today) throw new Error('invalidDate');
  if (!Number.isInteger(entry.minutes) || entry.minutes < 1 || entry.minutes > 1440) throw new Error('invalidDuration');
  if (typeof entry.note !== 'string' || entry.note.length > 240) throw new Error('invalidNote');
  const total = sumMinutes(entries.filter(e => e.date === entry.date && e.id !== entry.id));
  if (total + entry.minutes > 1440) throw new Error('dayTooLong');
}
export function backupDue(data, today = dateKey()) {
  if (!data.onboardingDone || !data.settings.reminderEnabled || data.backedUpRevision >= data.revision || !data.entries.length) return false;
  const month = today.slice(0, 7);
  if (data.dismissedReminderMonth === month) return false;
  const baseline = data.lastBackupAt ? dateKey(new Date(data.lastBackupAt)) : data.firstUseDate;
  return Number(today.slice(-2)) === monthDays(today) || baseline.slice(0, 7) < month;
}
export function validateData(value) {
  const fail = () => { throw new Error('invalidBackup'); };
  if (!value || value.schemaVersion !== 1 || !Array.isArray(value.entries) || value.entries.length > 100000) fail();
  const s = value.settings;
  if (!s || !['de', 'en'].includes(s.language) || !['light', 'dark'].includes(s.theme) || typeof s.reminderEnabled !== 'boolean') fail();
  if (typeof value.onboardingDone !== 'boolean' || !parseDate(value.firstUseDate)) fail();
  if (!Number.isSafeInteger(value.revision) || value.revision < 0 || !Number.isSafeInteger(value.backedUpRevision) || value.backedUpRevision < -1 || value.backedUpRevision > value.revision) fail();
  const timestamp = date => typeof date === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(date) && Number.isFinite(Date.parse(date));
  if (value.lastBackupAt !== null && !timestamp(value.lastBackupAt)) fail();
  if (value.dismissedReminderMonth !== null && (typeof value.dismissedReminderMonth !== 'string' || !parseDate(`${value.dismissedReminderMonth}-01`))) fail();
  const ids = new Set(), totals = new Map();
  for (const e of value.entries) {
    if (!e || typeof e.id !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(e.id) || ids.has(e.id) || !timestamp(e.createdAt) || !timestamp(e.updatedAt)) fail();
    if (!parseDate(e.date) || !Number.isInteger(e.minutes) || e.minutes < 1 || e.minutes > 1440 || typeof e.note !== 'string' || e.note.length > 240) fail();
    ids.add(e.id); totals.set(e.date, (totals.get(e.date) || 0) + e.minutes);
    if (totals.get(e.date) > 1440) fail();
  }
  if (!value.goals || !Array.isArray(value.goals.weekly) || !Array.isArray(value.goals.monthly)) fail();
  for (const [period, rules] of Object.entries(value.goals)) {
    if (!['weekly', 'monthly'].includes(period) || rules.length > 10000 || (value.onboardingDone && !rules.length)) fail();
    let last = '';
    for (const r of rules) {
      if (!parseDate(r.from) || r.from <= last || !Number.isFinite(r.hours) || r.hours < 0 || r.hours > (period === 'weekly' ? 168 : 744)) fail();
      if (period === 'weekly' && (r.from !== weekStart(r.from) || r.hours === 0)) fail();
      if (period === 'monthly' && (r.from !== monthStart(r.from) || typeof r.linked !== 'boolean' || !Number.isFinite(r.weeklyHours) || r.weeklyHours <= 0 || r.weeklyHours > 168 || (!r.linked && r.hours === 0))) fail();
      last = r.from;
    }
  }
  // Keep only our own schema fields; never merge arbitrary imported object properties.
  return {
    schemaVersion: 1,
    entries: value.entries.map(e => ({ id: e.id, date: e.date, minutes: e.minutes, note: e.note, createdAt: e.createdAt, updatedAt: e.updatedAt })),
    settings: { language: s.language, theme: s.theme, reminderEnabled: s.reminderEnabled },
    goals: {
      weekly: value.goals.weekly.map(r => ({ from: r.from, hours: r.hours })),
      monthly: value.goals.monthly.map(r => ({ from: r.from, hours: r.hours, linked: r.linked, weeklyHours: r.weeklyHours }))
    },
    onboardingDone: value.onboardingDone, revision: value.revision, backedUpRevision: value.backedUpRevision,
    lastBackupAt: value.lastBackupAt, dismissedReminderMonth: value.dismissedReminderMonth, firstUseDate: value.firstUseDate
  };
}
export function sessionLabel(entry, entries) {
  if (entry.note.trim()) return entry.note;
  const dayEntries = entries.filter(e => e.date === entry.date).sort((a,b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  return `Session ${dayEntries.findIndex(e => e.id === entry.id) + 1}`;
}
export function exportCSV(entries, language = 'de') {
  const cell = value => `"${String(value).replace(/"/g, '""')}"`;
  const safeNote = note => /^[\s]*[=+@-]|^[\t\r\n]/.test(note) ? `'${note}` : note;
  const header = language === 'de' ? ['Datum', 'Stunden', 'Beschreibung'] : ['Date', 'Hours', 'Description'];
  const rows = [...entries].sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt)).map(e => [
    e.date, (e.minutes / 60).toFixed(4).replace(/0+$/, '').replace(/\.$/, '').replace('.', language === 'de' ? ',' : '.'), safeNote(sessionLabel(e, entries))
  ]);
  return '\ufeff' + [header, ...rows].map(row => row.map(cell).join(';')).join('\r\n') + '\r\n';
}
