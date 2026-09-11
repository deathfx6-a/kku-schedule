/* =================================================================
   KKU Schedule — جدولي
   Vanilla JavaScript, no framework, no build step.

   Content (university, years, programs, groups, subjects, lectures,
   calendar) lives ONLY in /data/*.json. This file holds UI strings
   (I18N) and logic. Markup for repeated components lives in the
   <template> elements of index.html; this file clones them and fills
   them with textContent — data is never injected as HTML.

   Personal edits made in the browser (see "Customizations") are stored
   in localStorage and layered over the JSON; the JSON is never changed.
   ================================================================= */
"use strict";

/* ===== Configuration ===== */
const CONFIG = Object.freeze({
  dataDir: "data/",
  files: {
    university: "university.json",
    years: "years.json",
    programs: "programs.json",
    groups: "groups.json",
    subjects: "subjects.json",
    departments: "departments.json",
    activityTypes: "activity-types.json",
    calendar: "calendar.json"
  },
  // If you rename these, update the small inline script in index.html too.
  storageKeys: {
    language: "kkuLanguage",
    theme: "kkuTheme",
    selection: "kkuSelection",
    checklist: "kkuLectureChecklist",
    customizations: "kkuCustomizations",
    grades: "kkuGrades"
  },
  // Used by the editor's "day" list when data/university.json has no "workDays".
  defaultWorkDays: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday"],
  toastMs: 2600,
  languages: ["ar", "en"],
  defaultLanguage: "ar",
  // Backlog levels: the first level whose "max" is >= the backlog count wins.
  backlogLevels: [
    { level: "clear", max: 0, icon: "✓" },
    { level: "mild", max: 3, icon: "•" },
    { level: "medium", max: 7, icon: "!" },
    { level: "high", max: Infinity, icon: "↑" }
  ],
  fetchTimeoutMs: 15000,
  refreshIntervalMs: 60000,
  themeColors: { light: "#0f766e", dark: "#081413" }
});

/* ===== State ===== */
const state = {
  lang: CONFIG.defaultLanguage,
  theme: "light",
  view: "loading",          // loading | error | years | programs | groups | overview | schedule
  data: null,               // normalized core data (see normalizeCoreData)
  scheduleCache: new Map(), // schedule file path -> parsed JSON
  yearId: null,
  programId: null,
  groupId: null,
  model: null,              // normalized schedule of the active group (see buildGroupModel)
  weekIndex: 0,
  renderedDate: null,       // the day the schedule was rendered (to refresh "today" after midnight)
  checklist: {},            // { lectureId: true }
  grades: {},                // { subjectId: { componentId: score } }
  openSubjects: new Set(),  // subject cards the user expanded
  custom: null,             // personal edits layered over the JSON (see Customizations)
  editor: null,             // the slot editor while it is open
  error: null,
  retry: null
};

const els = {}; // every element with an id, filled by cacheElements()

/* ===== i18n ===== */
// UI strings only. Subject names, lectures and dates come from JSON.
const I18N = {
  ar: {
    dir: "rtl",
    locale: "ar-SA-u-ca-gregory-nu-latn",
    hijriLocale: "ar-SA-u-ca-islamic-umalqura-nu-latn",
    langShort: "ع",
    switchToThis: "التبديل إلى العربية",
    hijriSuffix: "هـ",
    listSeparator: "، ",
    appName: "جدولي",
    skipLink: "تخطَّ إلى المحتوى",
    themeToDark: "تفعيل الوضع الداكن",
    themeToLight: "تفعيل الوضع الفاتح",
    loading: "جارٍ تحميل البيانات…",
    errorTitle: "تعذر التحميل",
    errorLoad: "تعذر تحميل بيانات الجدول، حاول تحديث الصفحة.",
    errorFileProtocol: "فُتح الموقع مباشرة من ملف على جهازك، والمتصفح يمنع قراءة ملفات JSON بهذه الطريقة. شغّله عبر خادم محلي أو من GitHub Pages كما هو موضح في README.",
    errorMissingSchedule: "لم يُحدَّد ملف الجدول لهذه المجموعة. أضف الحقل scheduleFile في data/groups.json.",
    errorFile: "الملف",
    errorReason: "السبب",
    retry: "إعادة المحاولة",
    changeSelection: "تغيير الاختيار",
    heroTitle: "اختر سنتك الدراسية",
    heroSub: "بعد الاختيار يفتح جدولك تلقائيًا في كل زيارة.",
    stepYear: "السنة",
    stepProgram: "التخصص",
    stepGroup: "المجموعة",
    pickProgram: "اختر تخصصك",
    pickGroup: "اختر مجموعتك",
    back: "رجوع",
    hasSchedule: "جدول أسبوعي مفصّل",
    overviewOnly: "التقويم والتخصصات",
    noYears: "لا توجد سنوات مسجلة في data/years.json.",
    noGroups: "لا توجد مجموعات لهذا الاختيار في data/groups.json.",
    noScheduleTitle: "لا يوجد جدول أسبوعي لهذه السنة بعد.",
    noScheduleSub: "هذه نظرة عامة على التخصصات والمواد والتقويم الأكاديمي.",
    programsTitle: "التخصصات",
    subjectsTitle: "المواد",
    semesterN: "الفصل {n}",
    noPrograms: "لا توجد تخصصات مسجلة لهذه السنة.",
    scheduleFor: "جدولك",
    weekLabel: "الأسبوع",
    weeksNav: "أسابيع الفصل",
    progressText: "أنجزت {done} من {total}",
    noCoreThisWeek: "لا توجد محاضرات أساسية لتتبعها في هذا الأسبوع.",
    emptyDay: "لا يوجد نشاط مسجّل",
    emptyWeek: "لا توجد أيام مسجلة في هذا الأسبوع.",
    noWeeks: "لا توجد أسابيع مسجلة لهذه المجموعة بعد. أضفها في ملف الجدول.",
    holiday: "إجازة",
    weekIsHoliday: "هذا الأسبوع كله إجازة، فلا محاضرات فيه.",
    today: "اليوم",
    now: "الآن",
    markComplete: "تحديد كمنجزة",
    upcoming: "لم يحن موعدها",
    roomLabel: "قاعة",
    gradesButton: "الدرجات",
    gradesTitle: "درجات: {subject}",
    gradesEmpty: "لا توجد أوزان تقييم مسجّلة لهذه المادة في data/subjects.json.",
    gradesScoreLabel: "الدرجة",
    gradesOutOf: "من {w}",
    gradesAchieved: "المُحصَّل حتى الآن",
    gradesEnteredOf: "من {w}٪ تم إدخالها",
    gradesRemaining: "الوزن المتبقي",
    gradesTarget: "الهدف",
    gradesNeeded: "تحتاج {n}٪ بالمعدّل من الباقي ({remaining}٪) لتحقيقه.",
    gradesImpossible: "غير قابل للتحقيق بالباقي المتاح ({remaining}٪).",
    gradesAlreadyThere: "تحقّق الهدف بالفعل، مهما حصلت في الباقي.",
    gradesComplete: "أُدخلت كل الأوزان. درجتك: {n}٪.",
    gradesNote: "الدرجات محفوظة على هذا الجهاز فقط ولا تُرسل لأي مكان.",
    dashboardTitle: "إنجاز المواد",
    dashboardSub: "يُحسب تلقائيًا من الجدول لكل مادة.",
    statTotal: "المجدولة",
    statDue: "حلّ موعدها",
    statCompleted: "المنجزة",
    statRemaining: "المتبقية",
    statBacklog: "المتراكمة",
    noSubjects: "لا توجد محاضرات أساسية في جدول هذه المجموعة.",
    otherSubject: "مواد أخرى",
    backlogTitle: "إجمالي المتراكم",
    paceLabel: "نسبة المواكبة",
    backlogDetail: "مما حلّ موعده: أنجزت {done} من {due}",
    backlogLevels: { clear: "ممتاز", mild: "بسيط", medium: "متوسط", high: "مرتفع" },
    backlogMessages: {
      clear: "لا شيء متراكم عليك، أحسنت.",
      mild: "متراكم يسير؛ أنجزه اليوم وتعود مواكبًا تمامًا.",
      medium: "المحاضرات بدأت تتجمع؛ رتّبها قبل أن تزيد.",
      high: "المتراكم مرتفع؛ ابدأ بالأقدم وخذها مادةً مادة."
    },
    calendarTitle: "التقويم الأكاديمي",
    calendarSource: "المصدر الرسمي",
    calendarWeeks: "عدد الأسابيع: {n}",
    calendarDays: "الأيام الدراسية: {n}",
    noCalendar: "لا يوجد تقويم مسجل في data/calendar.json.",
    customizeTitle: "تخصيص الجدول",
    customizeNone: "عدّل أي موعد بزر القلم بجانبه، أو أضف موعدًا جديدًا. تعديلاتك تُحفظ على هذا الجهاز ولا تمسّ ملفات البيانات.",
    customizeCount: "التعديلات المحفوظة على هذا الجهاز لهذه المجموعة: {n}",
    addSlot: "إضافة موعد",
    exportBackup: "تصدير نسخة",
    importBackup: "استيراد نسخة",
    resetCustom: "استعادة الجدول الأصلي",
    editSlotTitle: "تعديل الموعد",
    addSlotTitle: "إضافة موعد جديد",
    editSlotAria: "تعديل: {title}",
    addToDay: "إضافة موعد يوم {day}",
    fSubject: "المادة",
    fNoSubject: "بدون مادة",
    fNewSubject: "+ مادة جديدة…",
    fNewSubjectName: "اسم المادة الجديدة",
    fDepartment: "القسم",
    fNoDepartment: "بدون قسم",
    fType: "نوع النشاط",
    fTitle: "العنوان (اختياري)",
    fTitlePh: "مثل: النهايات والاتصال",
    fInstructor: "الدكتور",
    fRoom: "القاعة",
    fDay: "اليوم",
    fStart: "من",
    fEnd: "إلى",
    fCore: "محاضرة أساسية — تُتابَع في التقدّم والمتراكم",
    fWeeks: "الأسابيع",
    fAllWeeks: "تحديد كل الأسابيع",
    fWeeksHintEdit: "يُطبَّق على المواعيد المماثلة (نفس المادة والنوع واليوم والوقت) في الأسابيع المختارة.",
    fWeeksHintAdd: "يُضاف الموعد إلى كل أسبوع مختار.",
    fNoOccurrence: "لا يوجد موعد مماثل في هذا الأسبوع",
    save: "حفظ",
    cancel: "إلغاء",
    close: "إغلاق",
    deleteSlot: "حذف",
    restoreOriginal: "استعادة الأصل",
    errTime: "أدخل وقتَي البداية والنهاية، وتكون النهاية بعد البداية.",
    errWeeks: "اختر أسبوعًا واحدًا على الأقل.",
    errNewSubject: "اكتب اسم المادة الجديدة.",
    confirmDelete: "حذف هذا الموعد من الأسابيع المختارة ({n})؟ يمكنك التراجع لاحقًا باستعادة الجدول الأصلي.",
    confirmReset: "ستُحذف كل تعديلاتك على جدول هذه المجموعة ويعود كما في ملف البيانات. متابعة؟",
    confirmImport: "ستحلّ هذه النسخة محلّ كل تعديلاتك الحالية على هذا الجهاز. متابعة؟",
    toastSaved: "حُفظ التعديل",
    toastAdded: "أُضيف الموعد",
    toastDeleted: "حُذف الموعد",
    toastRestored: "استُعيد الأصل",
    toastReset: "عاد الجدول إلى أصله",
    toastImported: "استُوردت النسخة",
    toastExported: "نُزّلت النسخة الاحتياطية",
    toastImportError: "الملف ليس نسخة احتياطية صالحة من جدولي.",
    toastStorageError: "تعذّر الحفظ: مساحة التخزين في المتصفح غير متاحة.",
    badgeEdited: "معدّل",
    badgeAdded: "مضاف",
    // Arabic plural forms (Intl.PluralRules categories)
    unitForms: { zero: "محاضرة", one: "محاضرة", two: "محاضرتان", few: "محاضرات", many: "محاضرة", other: "محاضرة" },
    days: { Sunday: "الأحد", Monday: "الإثنين", Tuesday: "الثلاثاء", Wednesday: "الأربعاء", Thursday: "الخميس", Friday: "الجمعة", Saturday: "السبت" }
  },
  en: {
    dir: "ltr",
    locale: "en-GB",
    hijriLocale: "en-SA-u-ca-islamic-umalqura-nu-latn",
    langShort: "EN",
    switchToThis: "Switch to English",
    hijriSuffix: "AH",
    listSeparator: ", ",
    appName: "My Schedule",
    skipLink: "Skip to content",
    themeToDark: "Switch to dark mode",
    themeToLight: "Switch to light mode",
    loading: "Loading data…",
    errorTitle: "Couldn't load",
    errorLoad: "The schedule data couldn't be loaded. Refresh the page and try again.",
    errorFileProtocol: "The site was opened directly as a file, and browsers block reading JSON that way. Run it from a local server or GitHub Pages as described in README.",
    errorMissingSchedule: "This group has no schedule file. Add the scheduleFile field in data/groups.json.",
    errorFile: "File",
    errorReason: "Reason",
    retry: "Try again",
    changeSelection: "Change selection",
    heroTitle: "Choose your study year",
    heroSub: "After you choose, your schedule opens automatically on every visit.",
    stepYear: "Year",
    stepProgram: "Program",
    stepGroup: "Group",
    pickProgram: "Choose your program",
    pickGroup: "Choose your group",
    back: "Back",
    hasSchedule: "Detailed weekly schedule",
    overviewOnly: "Calendar and programs",
    noYears: "No years are listed in data/years.json.",
    noGroups: "No groups match this choice in data/groups.json.",
    noScheduleTitle: "There's no weekly schedule for this year yet.",
    noScheduleSub: "Here is an overview of the programs, subjects and academic calendar.",
    programsTitle: "Programs",
    subjectsTitle: "Subjects",
    semesterN: "Semester {n}",
    noPrograms: "No programs are listed for this year.",
    scheduleFor: "Your schedule",
    weekLabel: "Week",
    weeksNav: "Semester weeks",
    progressText: "Completed {done} of {total}",
    noCoreThisWeek: "No core lectures to track this week.",
    emptyDay: "No activity recorded",
    emptyWeek: "No days are recorded for this week.",
    noWeeks: "No weeks are recorded for this group yet. Add them in the schedule file.",
    holiday: "Holiday",
    weekIsHoliday: "This whole week is a holiday — no lectures.",
    today: "Today",
    now: "Now",
    markComplete: "Mark as completed",
    upcoming: "Not yet due",
    roomLabel: "Room",
    gradesButton: "Grades",
    gradesTitle: "Grades: {subject}",
    gradesEmpty: "No assessment weights are listed for this subject in data/subjects.json.",
    gradesScoreLabel: "Score",
    gradesOutOf: "out of {w}",
    gradesAchieved: "Achieved so far",
    gradesEnteredOf: "of {w}% entered",
    gradesRemaining: "Weight remaining",
    gradesTarget: "Target",
    gradesNeeded: "You need {n}% on average across the rest ({remaining}%) to reach it.",
    gradesImpossible: "Not reachable with the remaining weight ({remaining}%).",
    gradesAlreadyThere: "Already reached, whatever you score on the rest.",
    gradesComplete: "Every weight is entered. Final grade: {n}%.",
    gradesNote: "Grades are saved on this device only and never sent anywhere.",
    dashboardTitle: "Subject progress",
    dashboardSub: "Calculated automatically from the schedule for each subject.",
    statTotal: "Scheduled",
    statDue: "Due so far",
    statCompleted: "Completed",
    statRemaining: "Remaining",
    statBacklog: "Backlog",
    noSubjects: "This group's schedule has no core lectures.",
    otherSubject: "Other subjects",
    backlogTitle: "Total backlog",
    paceLabel: "On-track rate",
    backlogDetail: "Of lectures already due: completed {done} of {due}",
    backlogLevels: { clear: "Excellent", mild: "Low", medium: "Moderate", high: "High" },
    backlogMessages: {
      clear: "Nothing is piling up. Well done.",
      mild: "A small backlog — clear it today and you're fully on track.",
      medium: "Lectures are starting to pile up. Sort them before they grow.",
      high: "Your backlog is high. Start with the oldest, one subject at a time."
    },
    calendarTitle: "Academic calendar",
    calendarSource: "Official source",
    calendarWeeks: "Weeks: {n}",
    calendarDays: "Study days: {n}",
    noCalendar: "No calendar is listed in data/calendar.json.",
    customizeTitle: "Customize the schedule",
    customizeNone: "Edit any slot with the pencil button next to it, or add a new one. Your changes are saved on this device and never touch the data files.",
    customizeCount: "Changes saved on this device for this group: {n}",
    addSlot: "Add slot",
    exportBackup: "Export backup",
    importBackup: "Import backup",
    resetCustom: "Restore original schedule",
    editSlotTitle: "Edit slot",
    addSlotTitle: "Add a new slot",
    editSlotAria: "Edit: {title}",
    addToDay: "Add a slot on {day}",
    fSubject: "Subject",
    fNoSubject: "No subject",
    fNewSubject: "+ New subject…",
    fNewSubjectName: "New subject name",
    fDepartment: "Department",
    fNoDepartment: "No department",
    fType: "Activity type",
    fTitle: "Title (optional)",
    fTitlePh: "e.g. Limits and Continuity",
    fInstructor: "Instructor",
    fRoom: "Room",
    fDay: "Day",
    fStart: "From",
    fEnd: "To",
    fCore: "Core lecture — tracked in progress and backlog",
    fWeeks: "Weeks",
    fAllWeeks: "Select all weeks",
    fWeeksHintEdit: "Applies to matching slots (same subject, type, day and time) in the selected weeks.",
    fWeeksHintAdd: "The slot is added to every selected week.",
    fNoOccurrence: "No matching slot this week",
    save: "Save",
    cancel: "Cancel",
    close: "Close",
    deleteSlot: "Delete",
    restoreOriginal: "Restore original",
    errTime: "Enter a start and end time; the end must be after the start.",
    errWeeks: "Select at least one week.",
    errNewSubject: "Enter the new subject's name.",
    confirmDelete: "Delete this slot from the selected weeks ({n})? You can undo later by restoring the original schedule.",
    confirmReset: "All your changes to this group's schedule will be removed and it will match the data file again. Continue?",
    confirmImport: "This backup will replace all your current changes on this device. Continue?",
    toastSaved: "Change saved",
    toastAdded: "Slot added",
    toastDeleted: "Slot deleted",
    toastRestored: "Original restored",
    toastReset: "Schedule restored to the original",
    toastImported: "Backup imported",
    toastExported: "Backup downloaded",
    toastImportError: "This file isn't a valid My Schedule backup.",
    toastStorageError: "Couldn't save: browser storage isn't available.",
    badgeEdited: "Edited",
    badgeAdded: "Added",
    unitForms: { one: "lecture", other: "lectures" },
    days: { Sunday: "Sunday", Monday: "Monday", Tuesday: "Tuesday", Wednesday: "Wednesday", Thursday: "Thursday", Friday: "Friday", Saturday: "Saturday" }
  }
};

function t(key) {
  const dict = I18N[state.lang] || I18N[CONFIG.defaultLanguage];
  if (dict[key] !== undefined) return dict[key];
  if (I18N.en[key] !== undefined) return I18N.en[key];
  return key;
}

function format(template, vars = {}) {
  return String(template).replace(/\{(\w+)\}/g, (match, key) => (key in vars ? String(vars[key]) : match));
}

function tf(key, vars) {
  return format(t(key), vars);
}

function langSuffix(lang) {
  return lang.charAt(0).toUpperCase() + lang.slice(1);
}

// Reads a bilingual JSON field: pick(obj, "title") -> obj.titleAr / obj.titleEn,
// falling back to the other languages, then to a plain obj.title.
function pick(obj, base) {
  if (!obj || typeof obj !== "object") return "";
  const order = [state.lang, ...CONFIG.languages.filter(lang => lang !== state.lang)];
  for (const lang of order) {
    const value = obj[base + langSuffix(lang)];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return typeof obj[base] === "string" ? obj[base].trim() : "";
}

function formatNumber(value) {
  try {
    return new Intl.NumberFormat(t("locale")).format(value);
  } catch (_) {
    return String(value);
  }
}

function lectureUnit(count) {
  const forms = t("unitForms");
  let category = "other";
  try {
    category = new Intl.PluralRules(state.lang).select(count);
  } catch (_) { /* keep "other" */ }
  return forms[category] || forms.other;
}

function nextLanguage() {
  const index = CONFIG.languages.indexOf(state.lang);
  return CONFIG.languages[(index + 1) % CONFIG.languages.length];
}

function applyI18n(root) {
  const scope = root || document;
  const nodes = [...scope.querySelectorAll("[data-i18n]")];
  if (scope !== document && scope.matches && scope.matches("[data-i18n]")) nodes.push(scope);
  nodes.forEach(el => { el.textContent = t(el.dataset.i18n); });
  const ariaNodes = [...scope.querySelectorAll("[data-i18n-aria]")];
  if (scope !== document && scope.matches && scope.matches("[data-i18n-aria]")) ariaNodes.push(scope);
  ariaNodes.forEach(el => { el.setAttribute("aria-label", t(el.dataset.i18nAria)); });
  scope.querySelectorAll("[data-i18n-placeholder]").forEach(el => { el.placeholder = t(el.dataset.i18nPlaceholder); });
}

function applyLanguage() {
  const root = document.documentElement;
  root.lang = state.lang;
  root.dir = t("dir");
  applyI18n(document);
  const next = nextLanguage();
  els.langToggle.textContent = I18N[next].langShort;
  els.langToggle.setAttribute("aria-label", I18N[next].switchToThis);
  els.langToggle.title = I18N[next].switchToThis;
  els.langToggle.lang = next;
  updateThemeToggle();
  renderHeader();
}

/* ===== Data loading ===== */
class DataLoadError extends Error {
  constructor(path, reason, code) {
    super(`${path}: ${reason}`);
    this.name = "DataLoadError";
    this.path = path;
    this.reason = reason;
    this.code = code || "load";
  }
}

async function fetchJson(relativePath) {
  const url = CONFIG.dataDir + relativePath;
  const controller = typeof AbortController === "function" ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), CONFIG.fetchTimeoutMs) : null;
  try {
    let response;
    try {
      // "no-cache" revalidates with the server, so edited JSON shows up after deploy.
      response = await fetch(url, { cache: "no-cache", signal: controller ? controller.signal : undefined });
    } catch (err) {
      throw new DataLoadError(url, err && err.name === "AbortError" ? "timeout" : "network error");
    }
    if (!response.ok) throw new DataLoadError(url, `HTTP ${response.status}`);
    try {
      return await response.json();
    } catch (err) {
      // Usually a missing comma or bracket in the JSON file.
      throw new DataLoadError(url, `invalid JSON — ${err.message}`);
    }
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function loadCoreData() {
  const entries = Object.entries(CONFIG.files);
  const results = await Promise.all(entries.map(([, file]) => fetchJson(file)));
  const raw = {};
  entries.forEach(([key], index) => { raw[key] = results[index]; });
  state.data = normalizeCoreData(raw);
}

function expectArray(value, file) {
  if (!Array.isArray(value)) throw new DataLoadError(CONFIG.dataDir + file, "expected a list [ ... ]");
  return value.filter(item => item && typeof item === "object");
}

function expectObject(value, file) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new DataLoadError(CONFIG.dataDir + file, "expected an object { ... }");
  }
  return value;
}

function normalizeKey(value) {
  return value == null ? "" : String(value).trim().toLowerCase();
}

function lowerKeys(obj) {
  const out = {};
  Object.entries(obj).forEach(([key, value]) => { out[normalizeKey(key)] = value || {}; });
  return out;
}

function normalizeCoreData(raw) {
  const subjects = new Map();
  expectArray(raw.subjects, CONFIG.files.subjects).forEach((subject, order) => {
    if (subject.id == null) return;
    subjects.set(String(subject.id), { ...subject, order });
  });
  return {
    university: expectObject(raw.university, CONFIG.files.university),
    years: expectArray(raw.years, CONFIG.files.years),
    programs: expectArray(raw.programs, CONFIG.files.programs),
    groups: expectArray(raw.groups, CONFIG.files.groups),
    subjects,
    departments: lowerKeys(expectObject(raw.departments, CONFIG.files.departments)),
    activityTypes: lowerKeys(expectObject(raw.activityTypes, CONFIG.files.activityTypes)),
    calendar: expectObject(raw.calendar, CONFIG.files.calendar)
  };
}

async function loadSchedule(path) {
  if (state.scheduleCache.has(path)) return state.scheduleCache.get(path);
  const json = expectObject(await fetchJson(path), path);
  state.scheduleCache.set(path, json);
  return json;
}

/* ===== Storage ===== */
const storage = {
  get(key) {
    try { return window.localStorage.getItem(key); } catch (_) { return null; }
  },
  set(key, value) {
    try { window.localStorage.setItem(key, value); return true; } catch (_) { return false; }
  },
  remove(key) {
    try { window.localStorage.removeItem(key); } catch (_) { /* ignore */ }
  },
  getJSON(key, fallback) {
    const raw = this.get(key);
    if (raw == null) return fallback;
    try {
      const value = JSON.parse(raw);
      return value == null ? fallback : value;
    } catch (_) {
      return fallback;
    }
  },
  setJSON(key, value) {
    return this.set(key, JSON.stringify(value));
  }
};

function readLanguage() {
  const saved = storage.get(CONFIG.storageKeys.language);
  return CONFIG.languages.includes(saved) && I18N[saved] ? saved : CONFIG.defaultLanguage;
}

function saveLanguage() {
  storage.set(CONFIG.storageKeys.language, state.lang);
}

function readTheme() {
  const saved = storage.get(CONFIG.storageKeys.theme);
  if (saved === "light" || saved === "dark") return saved;
  return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function saveTheme() {
  storage.set(CONFIG.storageKeys.theme, state.theme);
}

function readSelection() {
  const value = storage.getJSON(CONFIG.storageKeys.selection, null);
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}

function saveSelection(selection) {
  storage.setJSON(CONFIG.storageKeys.selection, { ...selection, savedAt: new Date().toISOString() });
}

function clearSelection() {
  storage.remove(CONFIG.storageKeys.selection);
}

function readChecklist() {
  const value = storage.getJSON(CONFIG.storageKeys.checklist, {});
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function saveChecklist() {
  storage.setJSON(CONFIG.storageKeys.checklist, state.checklist);
}

function readGrades() {
  const value = storage.getJSON(CONFIG.storageKeys.grades, {});
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function saveGrades() {
  return storage.setJSON(CONFIG.storageKeys.grades, state.grades);
}

/* ===== Customizations (personal edits) ===== */
// The student's own edits live in localStorage and are layered over the JSON
// every time a schedule is built. The JSON files are never changed, so
// "restore original" is always possible and lecture ids never change — a moved
// or edited lecture keeps its "completed" tick.
//
// Shape (kkuCustomizations):
//   { version: 1,
//     subjects: { "<id>": { id, nameAr, nameEn, department } },          // subjects the student added
//     groups: { "<groupId>": {
//       edits: { "<slotId>": { ...changed fields, day? } | { deleted: true } },
//       added: { "<slotId>": { ...all slot fields, weekNumber, day } } } } }
const CUSTOM_VERSION = 1;
const DAY_KEYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const CUSTOM_TEXT_FIELDS = ["subjectId", "department", "activityType", "activityAr", "activityEn", "instructorAr", "instructorEn", "room", "time"];

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function cleanText(value, max = 200) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function canonicalDay(value) {
  const key = normalizeKey(value);
  return DAY_KEYS.find(day => day.toLowerCase() === key) || "";
}

function emptyCustom() {
  return { version: CUSTOM_VERSION, subjects: {}, groups: {} };
}

// Keeps only known fields with the right types, so a hand-edited or foreign
// backup can never inject anything unexpected.
function cleanCustomEntry(entry, { added }) {
  if (!isPlainObject(entry)) return null;
  if (!added && entry.deleted === true) return { deleted: true };
  const out = {};
  CUSTOM_TEXT_FIELDS.forEach(key => {
    if (typeof entry[key] === "string") out[key] = cleanText(entry[key]);
  });
  if (out.time && !parseTimeRange(out.time)) delete out.time;
  if (typeof entry.isCoreLecture === "boolean") out.isCoreLecture = entry.isCoreLecture;
  const day = canonicalDay(entry.day);
  if (day) out.day = day;
  if (added) {
    if (!day || entry.weekNumber == null || !out.time) return null;
    out.weekNumber = entry.weekNumber;
  }
  return Object.keys(out).length ? out : null;
}

function sanitizeCustom(value) {
  const out = emptyCustom();
  if (!isPlainObject(value)) return out;
  if (isPlainObject(value.subjects)) {
    Object.entries(value.subjects).forEach(([id, subject]) => {
      if (!isPlainObject(subject)) return;
      const nameAr = cleanText(subject.nameAr, 80);
      const nameEn = cleanText(subject.nameEn, 80);
      if (!nameAr && !nameEn) return;
      out.subjects[id] = { id, nameAr, nameEn, department: cleanText(subject.department) };
    });
  }
  if (isPlainObject(value.groups)) {
    Object.entries(value.groups).forEach(([groupId, group]) => {
      if (!isPlainObject(group)) return;
      const edits = {};
      const added = {};
      if (isPlainObject(group.edits)) {
        Object.entries(group.edits).forEach(([id, entry]) => {
          const clean = cleanCustomEntry(entry, { added: false });
          if (clean) edits[id] = clean;
        });
      }
      if (isPlainObject(group.added)) {
        Object.entries(group.added).forEach(([id, entry]) => {
          const clean = cleanCustomEntry(entry, { added: true });
          if (clean) added[id] = { ...clean, id };
        });
      }
      if (Object.keys(edits).length || Object.keys(added).length) out.groups[groupId] = { edits, added };
    });
  }
  return out;
}

function readCustom() {
  return sanitizeCustom(storage.getJSON(CONFIG.storageKeys.customizations, null));
}

function saveCustom() {
  Object.keys(state.custom.groups).forEach(groupId => {
    const group = state.custom.groups[groupId];
    if (!Object.keys(group.edits).length && !Object.keys(group.added).length) delete state.custom.groups[groupId];
  });
  return storage.setJSON(CONFIG.storageKeys.customizations, state.custom);
}

function customGroup(groupId, create = false) {
  let group = state.custom.groups[groupId];
  if (!group && create) {
    group = { edits: {}, added: {} };
    state.custom.groups[groupId] = group;
  }
  return group || null;
}

function customCount(groupId) {
  const group = customGroup(groupId);
  return group ? Object.keys(group.edits).length + Object.keys(group.added).length : 0;
}

// Adds the student's own subjects to the subject list (after the official ones).
function mergeCustomSubjects() {
  if (!state.data) return;
  for (const [id, subject] of state.data.subjects) {
    if (subject.custom) state.data.subjects.delete(id);
  }
  Object.values(state.custom.subjects).forEach((subject, index) => {
    if (!state.data.subjects.has(subject.id)) {
      state.data.subjects.set(subject.id, { ...subject, custom: true, order: 100000 + index });
    }
  });
}

function workDays() {
  const fromData = state.data && Array.isArray(state.data.university.workDays)
    ? state.data.university.workDays.map(canonicalDay).filter(Boolean)
    : [];
  return fromData.length ? fromData : CONFIG.defaultWorkDays;
}

function addDaysISO(iso, days) {
  const date = isoToDate(iso);
  date.setDate(date.getDate() + days);
  return todayISO(date);
}

function dayKeyOf(rawDay) {
  const named = canonicalDay(rawDay && rawDay.day);
  if (named) return named;
  const iso = parseDate(rawDay && rawDay.date);
  return iso ? DAY_KEYS[isoToDate(iso).getDay()] : "";
}

// Finds the day in a week, or creates it (with its real date) in weekday order.
function ensureDay(week, dayKey) {
  const existing = week.days.find(day => dayKeyOf(day) === dayKey);
  if (existing) return existing;
  const day = { day: dayKey, slots: [] };
  const dated = week.days.find(item => parseDate(item.date));
  if (dated) {
    const iso = parseDate(dated.date);
    day.date = addDaysISO(iso, DAY_KEYS.indexOf(dayKey) - isoToDate(iso).getDay());
  }
  const order = DAY_KEYS.indexOf(dayKey);
  const at = week.days.findIndex(item => DAY_KEYS.indexOf(dayKeyOf(item)) > order);
  if (at === -1) week.days.push(day);
  else week.days.splice(at, 0, day);
  return day;
}

function sortDaySlots(day) {
  const start = slot => {
    const range = parseTimeRange(slot.time);
    return range ? range.start : Number.MAX_SAFE_INTEGER;
  };
  day.slots.sort((a, b) => start(a) - start(b));
}

// Returns copies of the raw weeks with this group's edits applied, plus the
// untouched originals (used to prune edits and to "restore original").
function applyCustomizations(rawWeeks, groupId) {
  const custom = customGroup(groupId) || { edits: {}, added: {} };
  const originals = new Map();
  const weeks = rawWeeks.map(rawWeek => {
    const week = isPlainObject(rawWeek) ? { ...rawWeek } : {};
    week.days = (Array.isArray(week.days) ? week.days : []).map(rawDay => {
      const day = isPlainObject(rawDay) ? { ...rawDay } : {};
      day.slots = (Array.isArray(day.slots) ? day.slots : []).map(slot => (isPlainObject(slot) ? { ...slot } : {}));
      return day;
    });
    return week;
  });

  const placements = []; // slots that must be (re)placed on another day
  const touched = new Set();

  weeks.forEach((week, weekIndex) => {
    const weekNumber = week.weekNumber != null ? week.weekNumber : weekIndex + 1;
    week.days.forEach(day => {
      const dayKey = dayKeyOf(day);
      day.slots = day.slots.filter(slot => {
        const id = typeof slot.id === "string" ? slot.id.trim() : "";
        if (!id) return true;
        if (!originals.has(id)) originals.set(id, { raw: { ...slot }, weekNumber, dayKey });
        const edit = custom.edits[id];
        if (!edit) return true;
        if (edit.deleted) return false;
        Object.entries(edit).forEach(([key, value]) => { if (key !== "day") slot[key] = value; });
        slot._custom = "edited";
        if (edit.day && edit.day !== dayKey) {
          placements.push({ week, dayKey: edit.day, slot });
          return false;
        }
        if (edit.time) touched.add(day);
        return true;
      });
    });
  });

  Object.values(custom.added).forEach(entry => {
    const week = weeks.find((item, index) => sameId(item.weekNumber != null ? item.weekNumber : index + 1, entry.weekNumber));
    if (!week) return; // that week is no longer in the data file
    const { day, weekNumber, ...fields } = entry;
    placements.push({ week, dayKey: day, slot: { ...fields, _custom: "added" } });
  });

  placements.forEach(({ week, dayKey, slot }) => {
    const day = ensureDay(week, dayKey);
    day.slots.push(slot);
    touched.add(day);
  });
  touched.forEach(sortDaySlots);

  return { weeks, originals };
}

/* ===== Selection ===== */
function sameId(a, b) {
  return a != null && b != null && String(a) === String(b);
}

function findYear(id) {
  return state.data.years.find(year => sameId(year.id, id)) || null;
}

function findProgram(id) {
  return state.data.programs.find(program => sameId(program.id, id)) || null;
}

function findGroup(id) {
  return state.data.groups.find(group => sameId(group.id, id)) || null;
}

function groupsFor(yearId, programId) {
  return state.data.groups.filter(group =>
    sameId(group.year, yearId) && (programId == null || sameId(group.program, programId))
  );
}

function programsForYear(yearId) {
  return state.data.programs.filter(program =>
    (Array.isArray(program.years) && program.years.some(year => sameId(year, yearId))) ||
    state.data.groups.some(group => sameId(group.year, yearId) && sameId(group.program, program.id))
  );
}

// Programs that actually lead to a schedule in this year (have at least one group).
function schedulablePrograms(yearId) {
  return programsForYear(yearId).filter(program => groupsFor(yearId, program.id).length > 0);
}

function yearHasSchedule(year) {
  return Boolean(year && year.hasDetailedSchedule) && groupsFor(year.id, null).length > 0;
}

function chooseYear(yearId) {
  const year = findYear(yearId);
  if (!year) return;
  state.yearId = year.id;
  state.programId = null;
  state.groupId = null;

  if (!yearHasSchedule(year)) {
    saveSelection({ yearId: year.id });
    state.view = "overview";
    renderCurrentView();
    return;
  }

  const programs = schedulablePrograms(year.id);
  if (programs.length === 1) {
    chooseProgram(programs[0].id);
    return;
  }
  if (programs.length === 0) {
    // Groups exist but their program isn't in programs.json: list the groups directly.
    const groups = groupsFor(year.id, null);
    if (groups.length === 1) { chooseGroup(groups[0].id); return; }
    state.view = "groups";
  } else {
    state.view = "programs";
  }
  renderCurrentView();
}

function chooseProgram(programId) {
  state.programId = programId;
  state.groupId = null;
  const groups = groupsFor(state.yearId, programId);
  if (groups.length === 1) {
    chooseGroup(groups[0].id);
    return;
  }
  state.view = "groups";
  renderCurrentView();
}

function chooseGroup(groupId) {
  const group = findGroup(groupId);
  if (!group) return;
  saveSelection({ yearId: group.year, programId: group.program, groupId: group.id });
  state.openSubjects.clear();
  openSchedule(group.id, { scrollToToday: true });
}

function backFromGroups() {
  state.groupId = null;
  if (schedulablePrograms(state.yearId).length > 1) {
    state.view = "programs";
  } else {
    state.yearId = null;
    state.programId = null;
    state.view = "years";
  }
  renderCurrentView();
}

function backFromPrograms() {
  state.yearId = null;
  state.programId = null;
  state.view = "years";
  renderCurrentView();
}

function changeSelection() {
  clearSelection();
  state.yearId = null;
  state.programId = null;
  state.groupId = null;
  state.model = null;
  state.openSubjects.clear();
  state.view = "years";
  renderCurrentView();
  window.scrollTo({ top: 0 });
}

function restoreSelection() {
  const saved = readSelection();
  if (saved && saved.groupId != null && findGroup(saved.groupId)) {
    openSchedule(saved.groupId, { scrollToToday: true });
    return;
  }
  if (saved && saved.yearId != null) {
    const year = findYear(saved.yearId);
    if (year && !yearHasSchedule(year)) {
      state.yearId = year.id;
      state.view = "overview";
      renderCurrentView();
      return;
    }
  }
  if (saved) clearSelection(); // stale selection (e.g. a group was removed from groups.json)
  state.view = "years";
  renderCurrentView();
}

/* ===== Schedule ===== */
const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

function pad2(value) {
  return String(value).padStart(2, "0");
}

function makeISO(year, month, day) {
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

// Accepts "2026-09-13" (recommended), "13 Sep 2026" and "Sep 13, 2026". Returns "YYYY-MM-DD" or null.
function parseDate(value) {
  if (typeof value !== "string") return null;
  const text = value.trim();
  let match = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (match) return makeISO(+match[1], +match[2], +match[3]);
  match = text.match(/^(\d{1,2})\s+([A-Za-z]+)\.?,?\s+(\d{4})$/);
  if (match) {
    const month = MONTHS[match[2].slice(0, 3).toLowerCase()];
    return month ? makeISO(+match[3], month, +match[1]) : null;
  }
  match = text.match(/^([A-Za-z]+)\.?\s+(\d{1,2}),?\s+(\d{4})$/);
  if (match) {
    const month = MONTHS[match[1].slice(0, 3).toLowerCase()];
    return month ? makeISO(+match[3], month, +match[2]) : null;
  }
  return null;
}

function todayISO(now = new Date()) {
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
}

function isoToDate(iso) {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, month - 1, day, 12); // noon avoids any DST edge
}

function parseClock(text) {
  const match = String(text).trim().match(/^(\d{1,2})(?::(\d{2}))?$/);
  if (!match) return null;
  const hours = +match[1];
  const minutes = +(match[2] || 0);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

// "08:00-09:40" -> { start: 480, end: 580 } in minutes. Short forms like "1-2" are read as 13:00-14:00.
function parseTimeRange(text) {
  if (typeof text !== "string") return null;
  const parts = text.split(/\s*[-–—]\s*/);
  if (parts.length !== 2) return null;
  let start = parseClock(parts[0]);
  let end = parseClock(parts[1]);
  if (start == null || end == null) return null;
  if (start < 7 * 60) start += 12 * 60;
  if (end <= start) end += 12 * 60;
  return { start, end };
}

function departmentInfo(id) {
  const key = normalizeKey(id);
  return key ? state.data.departments[key] || null : null;
}

function safeColor(value) {
  return typeof value === "string" && window.CSS && CSS.supports("color", value) ? value : null;
}

function normalizeSlot(raw, ctx) {
  const typeId = normalizeKey(raw.activityType) || "other";
  const type = state.data.activityTypes[typeId] || null;
  const subjectId = raw.subjectId != null && raw.subjectId !== "" ? String(raw.subjectId) : null;
  const subject = subjectId ? state.data.subjects.get(subjectId) || null : null;
  if (subjectId && !subject) console.warn(`[KKU Schedule] subjectId "${subjectId}" is not in subjects.json.`);
  const departmentId = normalizeKey(raw.department || (subject && subject.department) || "");
  const isBreak = Boolean(type && type.isBreak) || typeId === "break";
  const isCore = !isBreak && (typeof raw.isCoreLecture === "boolean"
    ? raw.isCoreLecture
    : Boolean(type && type.isCoreByDefault));

  let id = typeof raw.id === "string" && raw.id.trim() ? raw.id.trim() : null;
  if (isCore && !id) {
    // Fallback only. Progress for this lecture is lost if its position changes — give it an "id".
    id = `${ctx.group.id}-w${ctx.week.number}-d${ctx.dayIndex + 1}-s${ctx.slotIndex + 1}`;
    console.warn(`[KKU Schedule] A core lecture has no "id" (week ${ctx.week.number}). Temporary id: ${id}`);
  }

  return {
    raw,
    id,
    typeId,
    type,
    subjectId,
    subject,
    departmentId,
    isBreak,
    isCore,
    isAssessment: Boolean(type && type.isAssessment),
    time: typeof raw.time === "string" ? raw.time.trim() : "",
    range: parseTimeRange(raw.time),
    dateISO: ctx.dateISO,
    dayKey: ctx.dayKey,
    weekIndex: ctx.week.index,
    custom: raw._custom || null // "edited" | "added" | null
  };
}

// Turns the raw schedule JSON into weeks/days/slots for one group,
// plus a Map of unique core lectures (the same id anywhere = one lecture).
function buildGroupModel(schedule, group) {
  const semester = schedule.semester != null ? schedule.semester : (group.semester != null ? group.semester : null);
  const groupData = schedule.groups ? schedule.groups[group.id] : null;
  const model = { semester, weeks: [], lectures: new Map(), originals: new Map() };

  if (!groupData || !Array.isArray(groupData.weeks)) {
    console.warn(`[KKU Schedule] "groups.${group.id}.weeks" was not found in ${group.scheduleFile}.`);
    return model;
  }

  const effective = applyCustomizations(groupData.weeks, group.id);
  model.originals = effective.originals;

  effective.weeks.forEach((rawWeek, weekIndex) => {
    const safeWeek = rawWeek && typeof rawWeek === "object" ? rawWeek : {};
    const week = {
      index: weekIndex,
      number: safeWeek.weekNumber != null ? safeWeek.weekNumber : weekIndex + 1,
      raw: safeWeek,
      days: [],
      lectureIds: [],
      firstDate: null,
      lastDate: null
    };
    const weekLectureIds = new Set();

    (Array.isArray(safeWeek.days) ? safeWeek.days : []).forEach((rawDay, dayIndex) => {
      const safeDay = rawDay && typeof rawDay === "object" ? rawDay : {};
      const dateISO = parseDate(safeDay.date);
      if (safeDay.date && !dateISO) {
        console.warn(`[KKU Schedule] Unrecognized date "${safeDay.date}" in week ${week.number}. Use YYYY-MM-DD.`);
      }
      const dayKey = dayKeyOf(safeDay);
      const day = { raw: safeDay, dateISO, dayKey, slots: [] };

      (Array.isArray(safeDay.slots) ? safeDay.slots : []).forEach((rawSlot, slotIndex) => {
        const slot = normalizeSlot(rawSlot && typeof rawSlot === "object" ? rawSlot : {}, { group, week, dayIndex, slotIndex, dateISO, dayKey });
        day.slots.push(slot);
        if (!slot.isCore) return;
        const existing = model.lectures.get(slot.id);
        if (!existing) {
          model.lectures.set(slot.id, { id: slot.id, slot, weekIndex, weekNumber: week.number, dateISO, range: slot.range });
        } else if (existing.slot.subjectId !== slot.subjectId) {
          console.warn(`[KKU Schedule] Lecture id "${slot.id}" is used for different subjects.`);
        }
        weekLectureIds.add(slot.id);
      });

      if (dateISO) {
        if (!week.firstDate || dateISO < week.firstDate) week.firstDate = dateISO;
        if (!week.lastDate || dateISO > week.lastDate) week.lastDate = dateISO;
      }
      week.days.push(day);
    });

    week.lectureIds = [...weekLectureIds];
    model.weeks.push(week);
  });

  return model;
}

// Opens the week that contains today; on weekends the next week; after the semester the last week.
function pickInitialWeek(weeks, today = todayISO()) {
  if (!weeks.length) return 0;
  const index = weeks.findIndex(week => week.lastDate && week.lastDate >= today);
  if (index !== -1) return index;
  return weeks.some(week => week.lastDate) ? weeks.length - 1 : 0;
}

function currentWeek() {
  return state.model ? state.model.weeks[state.weekIndex] || null : null;
}

function slotTitle(slot) {
  return pick(slot.raw, "activity") || pick(slot.subject, "name") || pick(slot.type, "label") || slot.typeId;
}

async function openSchedule(groupId, options = {}) {
  const group = findGroup(groupId);
  if (!group) { changeSelection(); return; }
  state.view = "loading";
  renderCurrentView();
  try {
    if (!group.scheduleFile) {
      throw new DataLoadError(`${CONFIG.dataDir}${CONFIG.files.groups} → ${group.id}`, "scheduleFile is missing", "missing-schedule");
    }
    const schedule = await loadSchedule(group.scheduleFile);
    if (!state.holidayRanges) state.holidayRanges = buildHolidayIndex();
    state.model = buildGroupModel(schedule, group);
    state.groupId = group.id;
    state.yearId = group.year;
    state.programId = group.program;
    state.weekIndex = pickInitialWeek(state.model.weeks);
    if (state.openSubjects.size === 0) openWorstSubject();
    state.view = "schedule";
    renderCurrentView();
    if (options.scrollToToday) scrollToToday();
  } catch (err) {
    showError(err, () => openSchedule(groupId, options));
  }
}

/* ===== Checklist ===== */
function isCompleted(id) {
  return Boolean(state.checklist[id]);
}

function setCompleted(id, done) {
  if (done) state.checklist[id] = true;
  else delete state.checklist[id];
  saveChecklist();
  syncChecklistInputs(id);
  updateProgressViews();
}

// The same lecture can appear in the week view and in the dashboard: keep every copy in sync.
function syncChecklistInputs(id) {
  const done = isCompleted(id);
  document.querySelectorAll("input[data-lecture-id]").forEach(input => {
    if (input.dataset.lectureId !== id) return;
    input.checked = done;
    const row = input.closest(".slot, .subject-lecture");
    if (row) row.classList.toggle("is-completed", done);
  });
}

function syncAllChecklistInputs() {
  document.querySelectorAll("input[data-lecture-id]").forEach(input => {
    const done = isCompleted(input.dataset.lectureId);
    input.checked = done;
    const row = input.closest(".slot, .subject-lecture");
    if (row) row.classList.toggle("is-completed", done);
  });
}

function setupCheck(label, id, title) {
  const input = label.querySelector("input");
  input.dataset.lectureId = id;
  input.checked = isCompleted(id);
  input.setAttribute("aria-label", `${t("markComplete")}: ${title}`);
  label.title = t("markComplete");
  const row = label.closest(".slot, .subject-lecture");
  if (row) row.classList.toggle("is-completed", input.checked);
}

/* ===== Progress ===== */
// Four separate ideas:
//   scheduled  = every core lecture in the schedule (past and future)
//   completed  = core lectures the student ticked (future ones may be ticked too)
//   remaining  = scheduled − completed (includes lectures that haven't happened yet)
//   backlog    = lectures that already ENDED and are not completed (never the future)

function isDue(record, now = new Date()) {
  if (!record.dateISO) return false;
  const [year, month, day] = record.dateISO.split("-").map(Number);
  const endMinutes = record.range ? record.range.end : 24 * 60 - 1;
  const dueAt = new Date(year, month - 1, day, Math.floor(endMinutes / 60), endMinutes % 60);
  return dueAt <= now;
}

function percent(part, total) {
  return total ? Math.round((part / total) * 100) : 0;
}

function weekStats(week) {
  const total = week.lectureIds.length;
  const completed = week.lectureIds.filter(isCompleted).length;
  return { total, completed, percent: percent(completed, total) };
}

function subjectKeyOf(record) {
  return record.slot.subjectId || "__other";
}

function subjectStats(now = new Date()) {
  const map = new Map();
  for (const record of state.model.lectures.values()) {
    const key = subjectKeyOf(record);
    let stats = map.get(key);
    if (!stats) {
      stats = { key, total: 0, completed: 0, due: 0, completedDue: 0 };
      map.set(key, stats);
    }
    const done = isCompleted(record.id);
    stats.total += 1;
    if (done) stats.completed += 1;
    if (isDue(record, now)) {
      stats.due += 1;
      if (done) stats.completedDue += 1;
    }
  }
  for (const stats of map.values()) {
    stats.remaining = stats.total - stats.completed;
    stats.backlog = stats.due - stats.completedDue;
    stats.percent = percent(stats.completed, stats.total);
  }
  return map;
}

function overallStats(now = new Date()) {
  let total = 0, completed = 0, due = 0, completedDue = 0;
  for (const record of state.model.lectures.values()) {
    const done = isCompleted(record.id);
    total += 1;
    if (done) completed += 1;
    if (isDue(record, now)) {
      due += 1;
      if (done) completedDue += 1;
    }
  }
  return {
    total,
    completed,
    remaining: total - completed,
    due,
    completedDue,
    backlog: due - completedDue,
    pace: due ? Math.round((completedDue / due) * 100) : 100
  };
}

function backlogLevel(count) {
  return CONFIG.backlogLevels.find(item => count <= item.max) || CONFIG.backlogLevels[CONFIG.backlogLevels.length - 1];
}

function compareRecords(a, b) {
  const dateA = a.dateISO || "9999-12-31";
  const dateB = b.dateISO || "9999-12-31";
  if (dateA !== dateB) return dateA < dateB ? -1 : 1;
  return (a.range ? a.range.start : 0) - (b.range ? b.range.start : 0);
}

function subjectGroups() {
  const groups = new Map();
  [...state.model.lectures.values()].sort(compareRecords).forEach(record => {
    const key = subjectKeyOf(record);
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        subject: record.slot.subject,
        departmentId: normalizeKey((record.slot.subject && record.slot.subject.department) || record.slot.departmentId),
        records: []
      });
    }
    groups.get(key).records.push(record);
  });
  const order = group => (group.subject ? group.subject.order : Number.MAX_SAFE_INTEGER);
  return [...groups.values()].sort((a, b) => order(a) - order(b));
}

// On first open, expand the subject with the largest backlog so catching up is one tap away.
function openWorstSubject() {
  if (!state.model) return;
  let worst = null;
  for (const stats of subjectStats().values()) {
    if (stats.backlog > 0 && (!worst || stats.backlog > worst.backlog)) worst = stats;
  }
  if (worst) state.openSubjects.add(worst.key);
}

/* ===== Rendering ===== */
function cacheElements() {
  document.querySelectorAll("[id]").forEach(el => { els[el.id] = el; });
}

function cloneTemplate(id) {
  const node = document.getElementById(id).content.firstElementChild.cloneNode(true);
  applyI18n(node);
  return node;
}

function field(root, name) {
  return root.querySelector(`[data-f="${name}"]`);
}

// Sets text and hides the element when there is nothing to show.
function setField(root, name, text) {
  const el = field(root, name);
  if (!el) return null;
  const value = text == null ? "" : String(text);
  el.textContent = value;
  el.hidden = value === "";
  return el;
}

function fillParts(el, parts) {
  const clean = parts.filter(part => part != null && String(part).trim() !== "");
  el.replaceChildren(...clean.map(part => {
    const span = document.createElement("span");
    span.textContent = String(part);
    return span;
  }));
  el.hidden = clean.length === 0;
}

function applyDepartmentBadge(el, departmentId) {
  if (!el) return;
  const info = departmentInfo(departmentId);
  if (!departmentId) { el.hidden = true; return; }
  el.textContent = pick(info, "name") || departmentId;
  el.hidden = false;
  const color = safeColor(info && info.color);
  if (color) el.style.setProperty("--dept", color);
}

function formatDate(iso, options) {
  try {
    return new Intl.DateTimeFormat(t("locale"), options).format(isoToDate(iso));
  } catch (_) {
    return iso;
  }
}

function formatDateRange(startISO, endISO, options) {
  if (!endISO || startISO === endISO) return formatDate(startISO, options);
  try {
    const formatter = new Intl.DateTimeFormat(t("locale"), options);
    if (typeof formatter.formatRange === "function") {
      return formatter.formatRange(isoToDate(startISO), isoToDate(endISO));
    }
  } catch (_) { /* fall through */ }
  return `${formatDate(startISO, options)} – ${formatDate(endISO, options)}`;
}

function hijriDate(iso) {
  if (!state.data || !state.data.university.showHijriDates) return "";
  try {
    return new Intl.DateTimeFormat(t("hijriLocale"), { day: "numeric", month: "long", year: "numeric" }).format(isoToDate(iso));
  } catch (_) {
    return "";
  }
}

function dayName(day) {
  if (day.dateISO) return formatDate(day.dateISO, { weekday: "long" });
  const raw = day.raw.day;
  return (raw && t("days")[raw]) || raw || "";
}

function weekRangeText(week) {
  if (week.firstDate) return formatDateRange(week.firstDate, week.lastDate, { day: "numeric", month: "long" });
  return typeof week.raw.dateRange === "string" ? week.raw.dateRange : "";
}

function showScreen(name) {
  ["loading", "error", "selection", "overview", "schedule"].forEach(key => {
    els[`${key}Screen`].hidden = key !== name;
  });
  els.changeSelectionBtn.hidden = !(name === "schedule" || name === "overview");
}

function renderHeader() {
  const university = (state.data && state.data.university) || {};
  const title = pick(university, "siteTitle") || t("appName");
  const faculty = pick(university, "faculty");
  const name = pick(university, "name");
  els.siteTitle.textContent = title;
  els.siteSub.textContent = [faculty, name].filter(Boolean).join(t("listSeparator"));
  els.brandMark.textContent = university.shortName || "";
  els.brandMark.hidden = !university.shortName;
  document.title = [title, university.shortName].filter(Boolean).join(" | ");

  const disclaimer = pick(university, "disclaimer");
  els.disclaimer.textContent = disclaimer;
  els.disclaimer.hidden = !disclaimer;
  els.footerNote.textContent = pick(university, "footerNote");
  els.footerYear.textContent = pick(university, "academicYear");
  els.heroYear.textContent = pick(university, "academicYear");
  els.heroYear.hidden = !els.heroYear.textContent;
}

function renderCurrentView() {
  switch (state.view) {
    case "error": renderError(); break;
    case "years": renderYearStep(); break;
    case "programs": renderProgramStep(); break;
    case "groups": renderGroupStep(); break;
    case "overview": renderOverview(); break;
    case "schedule": renderSchedule(); break;
    default: showScreen("loading");
  }
}

function showError(error, retry) {
  console.error("[KKU Schedule]", error);
  state.error = error;
  state.retry = retry || null;
  state.view = "error";
  renderCurrentView();
}

function renderError() {
  showScreen("error");
  const error = state.error || {};
  els.errorMessage.textContent = error.code === "missing-schedule" ? t("errorMissingSchedule") : t("errorLoad");
  els.errorHint.textContent = t("errorFileProtocol");
  els.errorHint.hidden = window.location.protocol !== "file:";
  const lines = [];
  if (error.path) lines.push(`${t("errorFile")}: ${error.path}`);
  if (error.reason) lines.push(`${t("errorReason")}: ${error.reason}`);
  els.errorDetail.textContent = lines.join("\n");
  els.errorDetail.hidden = lines.length === 0;
  els.errorChangeBtn.hidden = !(state.data && readSelection());
}

/* --- Selection screen --- */
function renderSelectionStep(step) {
  showScreen("selection");
  els.yearStep.hidden = step !== "years";
  els.programStep.hidden = step !== "programs";
  els.groupStep.hidden = step !== "groups";
  const order = ["years", "programs", "groups"];
  const current = order.indexOf(step);
  els.stepper.querySelectorAll("[data-step]").forEach(item => {
    const index = order.indexOf(item.dataset.step);
    item.classList.toggle("is-active", index === current);
    item.classList.toggle("is-done", index < current);
    if (index === current) item.setAttribute("aria-current", "step");
    else item.removeAttribute("aria-current");
  });
}

function choiceCard({ num, title, desc, badge, dataset, modifier }) {
  const card = cloneTemplate("tpl-choice-card");
  setField(card, "num", num);
  setField(card, "title", title);
  setField(card, "desc", desc);
  setField(card, "badge", badge);
  Object.entries(dataset).forEach(([key, value]) => { card.dataset[key] = String(value); });
  if (modifier) card.classList.add(modifier);
  return card;
}

function renderYearStep() {
  renderSelectionStep("years");
  const years = state.data.years;
  els.yearGrid.replaceChildren(...years.map(year => choiceCard({
    num: year.shortLabel != null ? year.shortLabel : year.id,
    title: pick(year, "title"),
    desc: pick(year, "description"),
    badge: yearHasSchedule(year) ? t("hasSchedule") : t("overviewOnly"),
    dataset: { yearId: year.id },
    modifier: yearHasSchedule(year) ? "" : "is-overview"
  })));
  els.yearEmpty.hidden = years.length > 0;
}

function renderProgramStep() {
  renderSelectionStep("programs");
  const year = findYear(state.yearId);
  els.programStepSub.textContent = pick(year, "title");
  const programs = schedulablePrograms(state.yearId);
  els.programGrid.replaceChildren(...programs.map((program, index) => choiceCard({
    num: program.shortLabel != null ? program.shortLabel : formatNumber(index + 1),
    title: pick(program, "title"),
    desc: pick(program, "description"),
    badge: "",
    dataset: { programId: program.id }
  })));
}

function renderGroupStep() {
  renderSelectionStep("groups");
  const year = findYear(state.yearId);
  const program = findProgram(state.programId);
  els.groupStepSub.textContent = [pick(program, "title"), pick(year, "title")].filter(Boolean).join(t("listSeparator"));
  const groups = groupsFor(state.yearId, state.programId);
  els.groupGrid.replaceChildren(...groups.map((group, index) => choiceCard({
    num: group.shortLabel != null ? group.shortLabel : formatNumber(index + 1),
    title: pick(group, "title") || String(group.id),
    desc: pick(group, "description"),
    badge: "",
    dataset: { groupId: group.id }
  })));
  els.groupEmpty.hidden = groups.length > 0;
}

/* --- Overview screen --- */
function renderOverview() {
  showScreen("overview");
  const year = findYear(state.yearId);
  if (!year) { changeSelection(); return; }
  els.overviewTitle.textContent = pick(year, "title");
  els.overviewDesc.textContent = pick(year, "description");

  const programs = programsForYear(year.id);
  els.overviewPrograms.replaceChildren(...programs.map(program => {
    const item = cloneTemplate("tpl-program-item");
    setField(item, "title", pick(program, "title"));
    setField(item, "desc", pick(program, "description"));
    return item;
  }));
  els.overviewProgramsEmpty.hidden = programs.length > 0;

  const subjects = [...state.data.subjects.values()].filter(subject => sameId(subject.year, year.id));
  els.overviewSubjectsSection.hidden = subjects.length === 0;
  const bySemester = new Map();
  subjects.forEach(subject => {
    const key = subject.semester != null ? String(subject.semester) : "";
    if (!bySemester.has(key)) bySemester.set(key, []);
    bySemester.get(key).push(subject);
  });
  const blocks = [...bySemester.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([semester, list]) => {
    const block = document.createElement("div");
    block.className = "subject-block";
    if (semester) {
      const heading = document.createElement("h3");
      heading.textContent = semesterTitle(semester);
      block.append(heading);
    }
    const chips = document.createElement("div");
    chips.className = "subject-chips";
    list.forEach(subject => {
      const chip = cloneTemplate("tpl-subject-chip");
      chip.textContent = pick(subject, "name");
      const color = safeColor((departmentInfo(subject.department) || {}).color);
      if (color) chip.style.setProperty("--dept", color);
      chips.append(chip);
    });
    block.append(chips);
    return block;
  });
  els.overviewSubjects.replaceChildren(...blocks);

  renderCalendar(els.overviewCalendar, calendarSemesters());
}

function calendarSemesters() {
  const semesters = state.data.calendar.semesters;
  return Array.isArray(semesters) ? semesters.filter(item => item && typeof item === "object") : [];
}

function semesterTitle(number) {
  const semester = calendarSemesters().find(item => sameId(item.number, number));
  return pick(semester, "title") || tf("semesterN", { n: formatNumber(number) });
}

/* --- Holidays (from data/calendar.json "holidays" ranges) --- */
// Built once per group and reused by every render — a date lookup, not a
// per-day scan, so it stays cheap even for a full-semester schedule.
function buildHolidayIndex() {
  const ranges = [];
  calendarSemesters().forEach(semester => {
    (Array.isArray(semester.holidays) ? semester.holidays : []).forEach(holiday => {
      const start = parseDate(holiday.startDate);
      const end = parseDate(holiday.endDate) || start;
      if (start) ranges.push({ start, end: end < start ? start : end, holiday });
    });
  });
  return ranges;
}

function holidayFor(dateISO) {
  if (!dateISO || !state.holidayRanges) return null;
  const match = state.holidayRanges.find(range => range.start <= dateISO && dateISO <= range.end);
  return match ? match.holiday : null;
}

// A week where every recorded day falls inside a holiday range.
function weekIsHoliday(week) {
  return week.days.length > 0 && week.days.every(day => !day.dateISO || holidayFor(day.dateISO));
}

/* --- Calendar --- */
function renderCalendar(container, semesters) {
  container.replaceChildren();
  if (!semesters.length) {
    const note = document.createElement("p");
    note.className = "empty-note";
    note.textContent = t("noCalendar");
    container.append(note);
    return;
  }
  const today = todayISO();

  semesters.forEach(semester => {
    const card = cloneTemplate("tpl-calendar-card");
    setField(card, "title", pick(semester, "title"));
    fillParts(field(card, "meta"), [
      semester.weeks != null ? tf("calendarWeeks", { n: formatNumber(semester.weeks) }) : "",
      semester.studyDays != null ? tf("calendarDays", { n: formatNumber(semester.studyDays) }) : ""
    ]);
    setField(card, "note", pick(semester, "note"));

    const events = (Array.isArray(semester.events) ? semester.events : [])
      .filter(item => item && typeof item === "object")
      .map(item => ({ item, start: parseDate(item.date), end: parseDate(item.endDate) || parseDate(item.date) }))
      .sort((a, b) => (a.start || "9999").localeCompare(b.start || "9999"));

    let nextMarked = false;
    const list = field(card, "events");
    events.forEach(({ item, start, end }) => {
      const row = cloneTemplate("tpl-event-row");
      setField(row, "date", start ? formatDateRange(start, end, { day: "numeric", month: "short", year: "numeric" }) : String(item.date || ""));
      setField(row, "weekday", start ? formatDateRange(start, end, { weekday: "long" }) : "");
      const hijri = typeof item.hijri === "string" && item.hijri.trim()
        ? `${item.hijri.trim()} ${t("hijriSuffix")}`
        : (start ? hijriDate(start) : "");
      setField(row, "hijri", hijri);
      setField(row, "label", pick(item, "label"));
      if (end && end < today) {
        row.classList.add("is-past");
      } else if (start && !nextMarked) {
        row.classList.add("is-next");
        nextMarked = true;
      }
      list.append(row);
    });
    container.append(card);
  });

  const url = state.data.calendar.sourceUrl;
  if (typeof url === "string" && /^https?:\/\//i.test(url)) {
    const link = cloneTemplate("tpl-calendar-source");
    link.href = url;
    container.append(link);
  }
}

/* --- Schedule screen --- */
function renderSchedule() {
  const group = findGroup(state.groupId);
  if (!group || !state.model) { changeSelection(); return; }
  showScreen("schedule");
  state.renderedDate = todayISO();

  const program = findProgram(group.program);
  const year = findYear(group.year);
  els.scheduleTitle.textContent = pick(group, "title") || String(group.id);
  const chips = [pick(program, "title"), pick(year, "title")];
  if (state.model.semester != null) chips.push(semesterTitle(state.model.semester));
  fillParts(els.scheduleMeta, chips);
  els.scheduleMeta.querySelectorAll("span").forEach(span => span.classList.add("chip"));

  renderCustomizeBar();
  renderWeekTabs();
  renderWeek();
  renderDashboard();

  const semesters = calendarSemesters();
  const matching = semesters.filter(item => sameId(item.number, state.model.semester));
  renderCalendar(els.scheduleCalendar, matching.length ? matching : semesters);

  updateProgressViews();
}

function renderWeekTabs() {
  const today = todayISO();
  const tabs = state.model.weeks.map((week, index) => {
    const tab = cloneTemplate("tpl-week-tab");
    const active = index === state.weekIndex;
    tab.dataset.weekIndex = String(index);
    tab.id = `week-tab-${index}`;
    setField(tab, "label", `${t("weekLabel")} ${formatNumber(week.number)}`);
    setField(tab, "range", week.firstDate ? formatDateRange(week.firstDate, week.lastDate, { day: "numeric", month: "short" }) : "");
    tab.classList.toggle("is-active", active);
    tab.classList.toggle("is-current", Boolean(week.firstDate && week.firstDate <= today && today <= week.lastDate));
    tab.classList.toggle("is-holiday", weekIsHoliday(week));
    tab.setAttribute("aria-selected", String(active));
    tab.tabIndex = active ? 0 : -1;
    return tab;
  });
  els.weekTabs.replaceChildren(...tabs);
  els.weekTabs.hidden = tabs.length === 0;
}

function setWeek(index, { focus = false } = {}) {
  if (!state.model || index < 0 || index >= state.model.weeks.length) return;
  state.weekIndex = index;
  els.weekTabs.querySelectorAll("[data-week-index]").forEach(tab => {
    const active = Number(tab.dataset.weekIndex) === index;
    tab.classList.toggle("is-active", active);
    tab.setAttribute("aria-selected", String(active));
    tab.tabIndex = active ? 0 : -1;
    if (active) {
      if (focus) tab.focus();
      tab.scrollIntoView({ block: "nearest", inline: "nearest" });
    }
  });
  renderWeek();
  updateProgressViews();
}

function renderWeek() {
  const week = currentWeek();
  els.noWeeks.hidden = Boolean(week);
  els.weekPanel.hidden = !week;
  if (!week) { els.weekDays.replaceChildren(); return; }

  els.weekPanel.setAttribute("aria-labelledby", `week-tab-${state.weekIndex}`);
  els.weekTitle.textContent = `${t("weekLabel")} ${formatNumber(week.number)}`;
  const theme = pick(week.raw, "theme");
  els.weekTheme.textContent = theme;
  els.weekTheme.hidden = !theme || theme === els.weekTitle.textContent;
  els.weekRange.textContent = weekRangeText(week);

  if (!week.days.length) {
    const note = document.createElement("p");
    note.className = "empty-note";
    note.textContent = t("emptyWeek");
    els.weekDays.replaceChildren(note);
    return;
  }

  // A fully-holiday week (e.g. fall break) gets one banner instead of five
  // repeated "no activity" day cards.
  if (weekIsHoliday(week)) {
    const holiday = holidayFor(week.days.find(day => day.dateISO).dateISO);
    const banner = document.createElement("div");
    banner.className = "week-holiday-banner";
    const strong = document.createElement("strong");
    strong.textContent = (holiday && pick(holiday, "label")) || t("holiday");
    const small = document.createElement("span");
    small.textContent = t("weekIsHoliday");
    banner.append(strong, small);
    els.weekDays.replaceChildren(banner);
    return;
  }

  els.weekDays.replaceChildren(...week.days.map(renderDay));
}

function renderDay(day) {
  const card = cloneTemplate("tpl-day-card");
  const isToday = day.dateISO === todayISO();
  const holiday = holidayFor(day.dateISO);
  card.classList.toggle("is-today", isToday);
  card.classList.toggle("is-holiday", Boolean(holiday));
  setField(card, "name", dayName(day));
  setField(card, "date", day.dateISO ? formatDate(day.dateISO, { day: "numeric", month: "long", year: "numeric" }) : (day.raw.date || ""));
  setField(card, "hijri", day.dateISO ? hijriDate(day.dateISO) : "");
  field(card, "today").hidden = !isToday;
  setField(card, "holiday", holiday ? pick(holiday, "label") || t("holiday") : "");
  const add = field(card, "add");
  if (add) {
    const label = tf("addToDay", { day: dayName(day) });
    add.dataset.addDay = day.dayKey || "";
    add.setAttribute("aria-label", label);
    add.title = label;
    add.hidden = !day.dayKey;
  }

  const list = field(card, "slots");
  if (!day.slots.length) {
    const empty = cloneTemplate("tpl-empty-slot");
    if (holiday) empty.textContent = pick(holiday, "label") || t("holiday");
    list.append(empty);
  }
  day.slots.forEach(slot => list.append(renderSlot(slot)));
  return card;
}

function fillTime(el, text) {
  const parts = text.split(/\s*[-–—]\s*/);
  if (parts.length === 2) {
    const start = document.createElement("span");
    const end = document.createElement("span");
    start.textContent = parts[0];
    end.textContent = parts[1];
    end.className = "slot-time-end";
    el.replaceChildren(start, end);
  } else {
    el.textContent = text;
  }
}

function renderSlot(slot) {
  if (slot.isBreak) {
    const row = cloneTemplate("tpl-break");
    fillTime(field(row, "time"), slot.time);
    setField(row, "label", pick(slot.raw, "activity") || pick(slot.type, "label") || slot.typeId);
    return row;
  }

  const row = cloneTemplate("tpl-slot");
  const title = slotTitle(slot);
  fillTime(field(row, "time"), slot.time);

  const tag = setField(row, "type", pick(slot.type, "label") || slot.typeId);
  const tagColor = safeColor(slot.type && slot.type.color);
  if (tag && tagColor) tag.style.setProperty("--tag", tagColor);
  applyDepartmentBadge(field(row, "dept"), slot.departmentId);

  setField(row, "title", title);
  const subjectName = pick(slot.subject, "name");
  const room = typeof slot.raw.room === "string" ? slot.raw.room.trim() : "";
  fillParts(field(row, "meta"), [
    subjectName && subjectName !== title ? subjectName : "",
    pick(slot.raw, "instructor"),
    room ? `${t("roomLabel")} ${room}` : ""
  ]);
  setField(row, "note", pick(slot.raw, "note"));
  setField(row, "custom", slot.custom === "added" ? t("badgeAdded") : slot.custom === "edited" ? t("badgeEdited") : "");
  row.classList.toggle("is-custom", Boolean(slot.custom));

  const edit = field(row, "edit");
  if (edit && slot.id) {
    const label = tf("editSlotAria", { title });
    edit.dataset.editId = slot.id;
    edit.dataset.weekIndex = String(slot.weekIndex);
    edit.setAttribute("aria-label", label);
    edit.title = label;
  } else if (edit) {
    edit.remove();
  }

  if (slot.isAssessment) row.classList.add("is-assessment");
  if (slot.dateISO && slot.range) {
    row.dataset.date = slot.dateISO;
    row.dataset.start = String(slot.range.start);
    row.dataset.end = String(slot.range.end);
  }

  const check = field(row, "check");
  if (slot.isCore && slot.id) setupCheck(check, slot.id, title);
  else check.remove();
  return row;
}

/* --- Subject dashboard --- */
function renderDashboard() {
  const groups = subjectGroups();
  els.subjectEmpty.hidden = groups.length > 0;
  els.subjectList.replaceChildren(...groups.map(group => {
    const card = cloneTemplate("tpl-subject-card");
    card.dataset.subjectKey = group.key;
    card.open = state.openSubjects.has(group.key);
    setField(card, "name", group.subject ? pick(group.subject, "name") : t("otherSubject"));
    applyDepartmentBadge(field(card, "dept"), group.departmentId);
    const color = safeColor((departmentInfo(group.departmentId) || {}).color);
    if (color) card.style.setProperty("--dept", color);
    const gradesBtn = field(card, "grades");
    if (gradesBtn) gradesBtn.hidden = !group.subject || subjectAssessments(group.key).length === 0;

    const list = field(card, "list");
    group.records.forEach(record => list.append(renderSubjectLecture(record)));
    return card;
  }));
}

function renderSubjectLecture(record) {
  const item = cloneTemplate("tpl-subject-lecture");
  const title = slotTitle(record.slot);
  item.dataset.lectureRow = record.id;
  setField(item, "title", title);
  fillParts(field(item, "meta"), [
    `${t("weekLabel")} ${formatNumber(record.weekNumber)}`,
    record.dateISO ? formatDate(record.dateISO, { weekday: "short", day: "numeric", month: "short" }) : "",
    record.slot.time
  ]);
  setupCheck(field(item, "check"), record.id, title);
  return item;
}

/* --- Live progress (no re-render needed) --- */
function updateProgressViews() {
  if (state.view !== "schedule" || !state.model) return;
  const now = new Date();

  // Week progress
  const week = currentWeek();
  if (week) {
    const stats = weekStats(week);
    els.weekProgress.hidden = stats.total === 0;
    els.weekProgressEmpty.hidden = stats.total > 0;
    els.weekProgressText.textContent = tf("progressText", { done: formatNumber(stats.completed), total: formatNumber(stats.total) });
    els.weekProgressFill.style.width = `${stats.percent}%`;
    els.weekProgress.setAttribute("aria-valuenow", String(stats.percent));
    els.weekProgress.setAttribute("aria-valuetext", els.weekProgressText.textContent);
  }

  // Week tab meters
  els.weekTabs.querySelectorAll("[data-week-index]").forEach(tab => {
    const tabWeek = state.model.weeks[Number(tab.dataset.weekIndex)];
    if (!tabWeek) return;
    const stats = weekStats(tabWeek);
    field(tab, "fill").style.width = `${stats.percent}%`;
    tab.classList.toggle("is-done", stats.total > 0 && stats.completed === stats.total);
  });

  // Subject cards
  const bySubject = subjectStats(now);
  els.subjectList.querySelectorAll("[data-subject-key]").forEach(card => {
    const stats = bySubject.get(card.dataset.subjectKey);
    if (!stats) return;
    setField(card, "percent", `${formatNumber(stats.percent)}%`);
    field(card, "fill").style.width = `${stats.percent}%`;
    setField(card, "completed", `${formatNumber(stats.completed)} / ${formatNumber(stats.total)}`);
    setField(card, "remaining", formatNumber(stats.remaining));
    setField(card, "backlog", formatNumber(stats.backlog));
    card.classList.toggle("has-backlog", stats.backlog > 0);
  });

  // Lecture rows in the dashboard: "not yet due" and "overdue" depend on the clock
  els.subjectList.querySelectorAll("[data-lecture-row]").forEach(item => {
    const record = state.model.lectures.get(item.dataset.lectureRow);
    if (!record) return;
    const due = isDue(record, now);
    field(item, "upcoming").hidden = due;
    item.classList.toggle("is-overdue", due && !isCompleted(record.id));
  });

  renderBacklogSummary(now);
  updateNowMarkers(now);
}

function renderBacklogSummary(now) {
  const stats = overallStats(now);
  const level = backlogLevel(stats.backlog);
  els.backlogSummary.dataset.level = level.level;
  els.backlogIcon.textContent = level.icon;
  els.backlogNumber.textContent = formatNumber(stats.backlog);
  els.backlogUnit.textContent = lectureUnit(stats.backlog);
  els.backlogLevel.textContent = t("backlogLevels")[level.level];
  els.backlogMessage.textContent = t("backlogMessages")[level.level];
  els.backlogDetail.textContent = tf("backlogDetail", { done: formatNumber(stats.completedDue), due: formatNumber(stats.due) });
  els.paceValue.textContent = `${formatNumber(stats.pace)}%`;
  els.paceRing.style.setProperty("--p", String(stats.pace));
  els.paceRing.setAttribute("aria-label", `${t("paceLabel")}: ${stats.pace}%`);
  els.statTotal.textContent = formatNumber(stats.total);
  els.statDue.textContent = formatNumber(stats.due);
  els.statCompleted.textContent = formatNumber(stats.completed);
  els.statRemaining.textContent = formatNumber(stats.remaining);
}

function updateNowMarkers(now) {
  const today = todayISO(now);
  const minutes = now.getHours() * 60 + now.getMinutes();
  els.weekDays.querySelectorAll(".slot[data-date]").forEach(row => {
    const active = row.dataset.date === today && Number(row.dataset.start) <= minutes && minutes < Number(row.dataset.end);
    row.classList.toggle("is-now", active);
    const pill = field(row, "now");
    if (pill) pill.hidden = !active;
  });
}

function scrollToToday() {
  const smooth = !(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  requestAnimationFrame(() => {
    const tab = els.weekTabs.querySelector(".week-tab.is-active");
    if (tab) tab.scrollIntoView({ block: "nearest", inline: "center" });
    const todayCard = els.weekDays.querySelector(".day-card.is-today");
    if (todayCard) todayCard.scrollIntoView({ behavior: smooth ? "smooth" : "auto", block: "start" });
  });
}

/* ===== Editor (customize a slot) ===== */
let toastTimer = null;

function showToast(text) {
  if (!els.toast) return;
  els.toast.textContent = text;
  els.toast.hidden = false;
  requestAnimationFrame(() => els.toast.classList.add("is-visible"));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    els.toast.classList.remove("is-visible");
    setTimeout(() => { els.toast.hidden = true; }, 250);
  }, CONFIG.toastMs);
}

function renderCustomizeBar() {
  if (!els.customizeBar) return;
  const count = customCount(state.groupId);
  els.customizeStatus.textContent = count ? tf("customizeCount", { n: formatNumber(count) }) : t("customizeNone");
  els.resetCustomBtn.disabled = count === 0;
  els.customizeBar.classList.toggle("has-changes", count > 0);
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function minutesToClock(minutes) {
  return `${pad2(Math.floor(minutes / 60) % 24)}:${pad2(minutes % 60)}`;
}

function weekSlots(week) {
  return week.days.flatMap(day => day.slots);
}

function findSlot(weekIndex, id) {
  const week = state.model && state.model.weeks[weekIndex];
  return week ? weekSlots(week).find(slot => slot.id === id) || null : null;
}

// Slots in different weeks are "the same" recurring slot when these match.
function seriesKey(slot) {
  return [slot.subjectId || "", slot.typeId, slot.dayKey, slot.range ? `${slot.range.start}-${slot.range.end}` : slot.time].join("|");
}

function makeOption(value, label) {
  const option = document.createElement("option");
  option.value = value;
  option.textContent = label;
  return option;
}

function editorSubjects(currentId) {
  const group = findGroup(state.groupId);
  return [...state.data.subjects.values()]
    .filter(subject => subject.custom || subject.year == null || sameId(subject.year, group && group.year) || sameId(subject.id, currentId))
    .sort((a, b) => a.order - b.order);
}

function fillEditorSelects(values) {
  els.fSubject.replaceChildren(
    makeOption("", t("fNoSubject")),
    ...editorSubjects(values.subjectId).map(subject => makeOption(subject.id, pick(subject, "name") || subject.id)),
    makeOption("__new", t("fNewSubject"))
  );
  els.fDepartment.replaceChildren(
    makeOption("", t("fNoDepartment")),
    ...Object.entries(state.data.departments).map(([id, info]) => makeOption(id, pick(info, "name") || id))
  );
  els.fType.replaceChildren(
    ...Object.entries(state.data.activityTypes)
      .filter(([id, type]) => !type.isBreak && id !== "break")
      .map(([id, type]) => makeOption(id, pick(type, "label") || id))
  );
  const days = [...workDays()];
  if (values.day && !days.includes(values.day)) days.push(values.day);
  els.fDay.replaceChildren(...days.map(day => makeOption(day, t("days")[day] || day)));
}

function writeEditorForm(values) {
  els.fSubject.value = values.subjectId;
  if (els.fSubject.value !== values.subjectId) els.fSubject.value = "";
  els.fNewSubjectName.value = "";
  els.fDepartment.value = "";
  els.newSubjectFields.hidden = true;
  els.fType.value = values.typeId;
  if (!els.fType.value && els.fType.options.length) els.fType.selectedIndex = 0;
  els.fTitle.value = values.title;
  els.fInstructor.value = values.instructor;
  els.fRoom.value = values.room;
  els.fDay.value = values.day;
  els.fStart.value = values.start;
  els.fEnd.value = values.end;
  els.fCore.checked = values.core;
}

function readEditorForm() {
  const start = els.fStart.value;
  const end = els.fEnd.value;
  return {
    subjectId: els.fSubject.value,
    newSubjectName: els.fNewSubjectName.value.trim(),
    newSubjectDepartment: els.fDepartment.value,
    typeId: els.fType.value,
    title: els.fTitle.value.trim(),
    instructor: els.fInstructor.value.trim(),
    room: els.fRoom.value.trim(),
    day: els.fDay.value,
    start,
    end,
    time: start && end ? `${start}-${end}` : "",
    core: els.fCore.checked,
    weekIndexes: [...els.fWeeks.querySelectorAll("input:checked")].map(input => Number(input.value))
  };
}

function slotFormValues(slot) {
  return {
    subjectId: slot.subjectId || "",
    typeId: slot.typeId,
    title: pick(slot.raw, "activity"),
    instructor: pick(slot.raw, "instructor"),
    room: cleanText(slot.raw.room),
    day: slot.dayKey || workDays()[0],
    start: slot.range ? minutesToClock(slot.range.start) : "",
    end: slot.range ? minutesToClock(slot.range.end) : "",
    core: slot.isCore
  };
}

function defaultTypeId() {
  return state.data.activityTypes.lecture ? "lecture" : Object.keys(state.data.activityTypes).find(id => !state.data.activityTypes[id].isBreak) || "other";
}

function typeIsCore(typeId) {
  const type = state.data.activityTypes[typeId];
  return Boolean(type && type.isCoreByDefault);
}

function renderEditorWeeks() {
  const editor = state.editor;
  const chips = state.model.weeks.map((week, index) => {
    const label = document.createElement("label");
    label.className = "week-pick";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.value = String(index);
    const text = document.createElement("span");
    text.textContent = `${t("weekLabel")} ${formatNumber(week.number)}`;
    const occurrence = editor.mode === "edit" ? editor.series[index] : true;
    input.disabled = !occurrence;
    input.checked = Boolean(occurrence) && index === editor.weekIndex;
    if (!occurrence) label.title = t("fNoOccurrence");
    label.append(input, text);
    return label;
  });
  els.fWeeks.replaceChildren(...chips);
  els.fWeeksHint.textContent = t(editor.mode === "edit" ? "fWeeksHintEdit" : "fWeeksHintAdd");
}

function openEditor({ mode, slotId = null, weekIndex = state.weekIndex, dayKey = null, trigger = null }) {
  if (!state.model || !els.slotEditor) return;
  let values;
  const editor = { mode, slotId, weekIndex, series: [], trigger, focusId: slotId };

  if (mode === "edit") {
    const slot = findSlot(weekIndex, slotId);
    if (!slot) return;
    const key = seriesKey(slot);
    editor.series = state.model.weeks.map((week, index) => {
      if (index === weekIndex) return slot.id;
      const match = weekSlots(week).find(item => item.id && seriesKey(item) === key);
      return match ? match.id : null;
    });
    editor.isEdited = slot.custom === "edited";
    values = slotFormValues(slot);
  } else {
    const typeId = defaultTypeId();
    values = {
      subjectId: "", typeId, title: "", instructor: "", room: "",
      day: dayKey || workDays()[0], start: "", end: "", core: typeIsCore(typeId)
    };
  }

  editor.initial = values;
  state.editor = editor;
  fillEditorSelects(values);
  writeEditorForm(values);
  renderEditorWeeks();
  els.editorTitle.textContent = t(mode === "edit" ? "editSlotTitle" : "addSlotTitle");
  els.editorDelete.hidden = mode !== "edit";
  els.editorRestore.hidden = !(mode === "edit" && editor.isEdited);
  els.editorError.hidden = true;
  els.slotEditor.showModal();
  els.fSubject.focus();
}

function closeEditor() {
  if (els.slotEditor && els.slotEditor.open) els.slotEditor.close();
}

function onEditorClosed() {
  const editor = state.editor;
  state.editor = null;
  if (!editor) return;
  // Return focus to the slot's (re-rendered) edit button, or to what opened the editor.
  const target = (editor.focusId && els.weekDays.querySelector(`[data-edit-id="${CSS.escape(editor.focusId)}"]`))
    || (editor.trigger && editor.trigger.isConnected ? editor.trigger : null)
    || els.addSlotBtn;
  if (target) target.focus();
}

function editorError(message) {
  els.editorError.textContent = message;
  els.editorError.hidden = false;
}

function validateEditor(values) {
  const range = parseTimeRange(values.time);
  if (!values.start || !values.end || !range || parseClock(values.end) <= parseClock(values.start)) return t("errTime");
  if (!values.weekIndexes.length) return t("errWeeks");
  if (values.subjectId === "__new" && !values.newSubjectName) return t("errNewSubject");
  return null;
}

// "__new" becomes a real subject the student owns.
function resolveSubject(values) {
  if (values.subjectId !== "__new") {
    const subject = values.subjectId ? state.data.subjects.get(values.subjectId) : null;
    return { id: values.subjectId, department: subject ? cleanText(subject.department) : "" };
  }
  const id = `u-subj-${uid()}`;
  state.custom.subjects[id] = { id, nameAr: values.newSubjectName, nameEn: values.newSubjectName, department: values.newSubjectDepartment };
  return { id, department: values.newSubjectDepartment };
}

// A value typed in one language also becomes the other language's value;
// switch language and edit again to give it a separate translation.
function setBilingual(target, base, value) {
  CONFIG.languages.forEach(lang => { target[base + langSuffix(lang)] = value; });
}

function sameValue(a, b) {
  const norm = value => (value == null ? "" : typeof value === "string" ? value.trim() : value);
  return norm(a) === norm(b);
}

// Stores only what really differs from the data file; an edit that matches
// the original again disappears on its own.
function applyPatch(groupCustom, id, patch) {
  if (groupCustom.added[id]) {
    Object.assign(groupCustom.added[id], patch);
    return;
  }
  const merged = { ...(groupCustom.edits[id] || {}), ...patch };
  delete merged.deleted;
  const original = state.model.originals.get(id);
  if (original) {
    Object.keys(merged).forEach(key => {
      const before = key === "day" ? original.dayKey : original.raw[key];
      if (sameValue(before, merged[key])) delete merged[key];
    });
  }
  if (Object.keys(merged).length) groupCustom.edits[id] = merged;
  else delete groupCustom.edits[id];
}

function saveEditor() {
  const editor = state.editor;
  if (!editor) return;
  const values = readEditorForm();
  const problem = validateEditor(values);
  if (problem) { editorError(problem); return; }

  const subject = resolveSubject(values);
  const groupCustom = customGroup(state.groupId, true);

  if (editor.mode === "add") {
    const series = uid();
    let firstId = null;
    values.weekIndexes.forEach(index => {
      const week = state.model.weeks[index];
      const id = `u-${state.groupId}-${series}-w${week.number}`;
      const entry = {
        id, weekNumber: week.number, day: values.day, time: values.time,
        subjectId: subject.id, department: subject.department, activityType: values.typeId,
        room: values.room, isCoreLecture: values.core
      };
      setBilingual(entry, "activity", values.title);
      setBilingual(entry, "instructor", values.instructor);
      groupCustom.added[id] = entry;
      if (index === editor.weekIndex || !firstId) firstId = id;
    });
    editor.focusId = firstId;
    commitCustom("toastAdded");
    return;
  }

  const initial = editor.initial;
  const patch = {};
  if (subject.id !== initial.subjectId) { patch.subjectId = subject.id; patch.department = subject.department; }
  if (values.typeId !== initial.typeId) patch.activityType = values.typeId;
  if (values.title !== initial.title) setBilingual(patch, "activity", values.title);
  if (values.instructor !== initial.instructor) setBilingual(patch, "instructor", values.instructor);
  if (values.room !== initial.room) patch.room = values.room;
  if (values.day !== initial.day) patch.day = values.day;
  if (values.time !== `${initial.start}-${initial.end}`) patch.time = values.time;
  if (values.core !== initial.core) patch.isCoreLecture = values.core;

  if (Object.keys(patch).length) {
    values.weekIndexes.forEach(index => {
      const id = editor.series[index];
      if (id) applyPatch(groupCustom, id, patch);
    });
  }
  commitCustom("toastSaved");
}

function selectedOccurrences() {
  const editor = state.editor;
  return readEditorForm().weekIndexes.map(index => editor.series[index]).filter(Boolean);
}

function deleteFromEditor() {
  const ids = selectedOccurrences();
  if (!ids.length) { editorError(t("errWeeks")); return; }
  if (!window.confirm(tf("confirmDelete", { n: formatNumber(ids.length) }))) return;
  const groupCustom = customGroup(state.groupId, true);
  ids.forEach(id => {
    if (groupCustom.added[id]) delete groupCustom.added[id];
    else groupCustom.edits[id] = { deleted: true };
  });
  state.editor.focusId = null;
  commitCustom("toastDeleted");
}

function restoreFromEditor() {
  const groupCustom = customGroup(state.groupId);
  if (groupCustom) selectedOccurrences().forEach(id => { delete groupCustom.edits[id]; });
  commitCustom("toastRestored");
}

// Saves, rebuilds the schedule from JSON + edits, and keeps the same week open.
function commitCustom(toastKey) {
  const saved = saveCustom();
  mergeCustomSubjects();
  closeEditor();
  rebuildSchedule();
  showToast(saved ? t(toastKey) : t("toastStorageError"));
}

function rebuildSchedule() {
  if (state.view !== "schedule") return;
  const group = findGroup(state.groupId);
  const schedule = group && state.scheduleCache.get(group.scheduleFile);
  if (!group || !schedule) return;
  const week = currentWeek();
  const weekNumber = week ? week.number : null;
  const scrollY = window.scrollY;
  if (!state.holidayRanges) state.holidayRanges = buildHolidayIndex();
  state.model = buildGroupModel(schedule, group);
  const index = state.model.weeks.findIndex(item => sameId(item.number, weekNumber));
  state.weekIndex = index !== -1 ? index : Math.min(state.weekIndex, Math.max(0, state.model.weeks.length - 1));
  renderSchedule();
  window.scrollTo({ top: scrollY });
}

function resetCustom() {
  if (!customCount(state.groupId)) return;
  if (!window.confirm(t("confirmReset"))) return;
  delete state.custom.groups[state.groupId];
  commitCustom("toastReset");
}

function exportCustom() {
  const payload = { app: "kku-schedule", exportedAt: new Date().toISOString(), ...state.custom };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `kku-schedule-backup-${todayISO()}.json`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  showToast(t("toastExported"));
}

async function importCustom(file) {
  if (!file) return;
  let parsed = null;
  try {
    parsed = JSON.parse(await file.text());
  } catch (_) {
    parsed = null;
  }
  if (!isPlainObject(parsed) || parsed.version == null || !(isPlainObject(parsed.groups) || isPlainObject(parsed.subjects))) {
    showToast(t("toastImportError"));
    return;
  }
  if (!window.confirm(t("confirmImport"))) return;
  state.custom = sanitizeCustom(parsed);
  commitCustom("toastImported");
}

function onEditorSubjectChange() {
  els.newSubjectFields.hidden = els.fSubject.value !== "__new";
  if (!els.newSubjectFields.hidden) els.fNewSubjectName.focus();
}

function onEditorTypeChange() {
  // New slots follow the type's default; existing ones keep what the student chose.
  if (state.editor && state.editor.mode === "add") els.fCore.checked = typeIsCore(els.fType.value);
}

/* ===== Grades (assessment-weight tracker) ===== */
// Purely local: scores live in localStorage next to the checklist and the
// customizations, keyed by subject id, and are never mixed into data/*.json.
let gradesSubjectId = null;

function subjectAssessments(subjectId) {
  const subject = state.data.subjects.get(subjectId);
  return subject && Array.isArray(subject.assessments) ? subject.assessments : [];
}

function subjectGrades(subjectId) {
  return state.grades[subjectId] || {};
}

function clampScore(value, weight) {
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  return Math.min(Math.max(num, 0), weight);
}

function gradesSummaryFor(subjectId) {
  const assessments = subjectAssessments(subjectId);
  const scores = subjectGrades(subjectId);
  let totalWeight = 0, enteredWeight = 0, achieved = 0;
  assessments.forEach(item => {
    totalWeight += item.weight;
    const score = scores[item.id];
    if (score != null) { enteredWeight += item.weight; achieved += clampScore(score, item.weight); }
  });
  return { totalWeight, enteredWeight, achieved, remaining: totalWeight - enteredWeight };
}

function renderGradesSummary() {
  const summary = gradesSummaryFor(gradesSubjectId);
  els.gradesAchievedValue.textContent = `${formatNumber(Math.round(summary.achieved * 100) / 100)}%`;
  els.gradesEnteredOf.textContent = tf("gradesEnteredOf", { w: formatNumber(summary.enteredWeight) });

  if (summary.remaining <= 0) {
    els.gradesTarget.closest(".grades-target-field").hidden = true;
    els.gradesTargetMessage.textContent = tf("gradesComplete", { n: formatNumber(Math.round(summary.achieved * 100) / 100) });
    return;
  }
  els.gradesTarget.closest(".grades-target-field").hidden = false;
  const target = Number(els.gradesTarget.value);
  const neededTotal = target - summary.achieved;
  const neededAvg = (neededTotal / summary.remaining) * 100;
  if (neededAvg <= 0) {
    els.gradesTargetMessage.textContent = t("gradesAlreadyThere");
  } else if (neededAvg > 100) {
    els.gradesTargetMessage.textContent = tf("gradesImpossible", { remaining: formatNumber(summary.remaining) });
  } else {
    els.gradesTargetMessage.textContent = tf("gradesNeeded", {
      n: formatNumber(Math.round(neededAvg * 10) / 10),
      remaining: formatNumber(summary.remaining)
    });
  }
}

function renderGradesRows(subjectId) {
  const assessments = subjectAssessments(subjectId);
  els.gradesEmpty.hidden = assessments.length > 0;
  els.gradesSummary.hidden = assessments.length === 0;
  const scores = subjectGrades(subjectId);
  els.gradesRows.replaceChildren(...assessments.map(item => {
    const row = cloneTemplate("tpl-grade-row");
    setField(row, "label", pick(item, "label") || item.id);
    setField(row, "weight", `${formatNumber(item.weight)}%`);
    const scoreLabel = field(row, "scoreLabel");
    if (scoreLabel) scoreLabel.textContent = tf("gradesOutOf", { w: formatNumber(item.weight) });
    const input = row.querySelector("input");
    input.dataset.componentId = item.id;
    input.max = String(item.weight);
    input.placeholder = "0";
    if (scores[item.id] != null) input.value = String(scores[item.id]);
    return row;
  }));
}

function openGrades(subjectId) {
  const subject = state.data.subjects.get(subjectId);
  if (!subject || !els.gradesEditor) return;
  gradesSubjectId = subjectId;
  els.gradesTitle.textContent = tf("gradesTitle", { subject: pick(subject, "name") || subjectId });
  renderGradesRows(subjectId);
  renderGradesSummary();
  els.gradesEditor.showModal();
}

function closeGrades() {
  if (els.gradesEditor && els.gradesEditor.open) els.gradesEditor.close();
}

function onGradesInput(event) {
  const input = event.target.closest("input[data-component-id]");
  if (!input || !gradesSubjectId) return;
  const assessments = subjectAssessments(gradesSubjectId);
  const item = assessments.find(a => a.id === input.dataset.componentId);
  if (!item) return;
  const scores = { ...subjectGrades(gradesSubjectId) };
  if (input.value.trim() === "") {
    delete scores[item.id];
  } else {
    const clamped = clampScore(input.value, item.weight);
    if (clamped == null) return;
    input.value = String(clamped);
    scores[item.id] = clamped;
  }
  state.grades = { ...state.grades, [gradesSubjectId]: scores };
  if (Object.keys(scores).length === 0) delete state.grades[gradesSubjectId];
  saveGrades();
  renderGradesSummary();
}

function bindGradesEvents() {
  on("subjectList", "click", event => {
    const button = event.target.closest("[data-f='grades']");
    if (!button) return;
    event.preventDefault();   // don't toggle the <details> under it
    event.stopPropagation();
    const card = button.closest("[data-subject-key]");
    if (card) openGrades(card.dataset.subjectKey);
  });
  on("gradesRows", "input", onGradesInput);
  on("gradesTarget", "change", renderGradesSummary);
  on("gradesClose", "click", closeGrades);
  on("gradesEditor", "click", event => { if (event.target === els.gradesEditor) closeGrades(); });
}

function bindEditorEvents() {
  on("addSlotBtn", "click", event => openEditor({ mode: "add", trigger: event.currentTarget }));
  on("exportCustomBtn", "click", exportCustom);
  on("importCustomBtn", "click", () => els.importCustomInput.click());
  on("importCustomInput", "change", event => {
    importCustom(event.target.files && event.target.files[0]);
    event.target.value = "";
  });
  on("resetCustomBtn", "click", resetCustom);

  on("weekDays", "click", event => {
    const edit = event.target.closest("[data-edit-id]");
    if (edit) {
      openEditor({ mode: "edit", slotId: edit.dataset.editId, weekIndex: Number(edit.dataset.weekIndex), trigger: edit });
      return;
    }
    const add = event.target.closest("[data-add-day]");
    if (add && add.dataset.addDay) openEditor({ mode: "add", dayKey: add.dataset.addDay, trigger: add });
  });

  on("slotForm", "submit", event => { event.preventDefault(); saveEditor(); });
  // An old error message disappears as soon as the student starts fixing the form.
  on("slotForm", "input", () => { els.editorError.hidden = true; });
  on("slotForm", "change", () => { els.editorError.hidden = true; });
  on("fSubject", "change", onEditorSubjectChange);
  on("fType", "change", onEditorTypeChange);
  on("fAllWeeks", "click", () => {
    els.fWeeks.querySelectorAll("input:not(:disabled)").forEach(input => { input.checked = true; });
  });
  on("editorDelete", "click", deleteFromEditor);
  on("editorRestore", "click", restoreFromEditor);
  on("editorCancel", "click", closeEditor);
  on("editorClose", "click", closeEditor);
  on("slotEditor", "close", onEditorClosed);
  // A click on the dimmed backdrop (the dialog element itself) closes it.
  on("slotEditor", "click", event => { if (event.target === els.slotEditor) closeEditor(); });
}

/* ===== Theme ===== */
function applyTheme() {
  document.documentElement.dataset.theme = state.theme;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", CONFIG.themeColors[state.theme]);
  updateThemeToggle();
}

function updateThemeToggle() {
  if (!els.themeToggle) { console.warn("KKU Schedule: #themeToggle button not found in index.html"); return; }
  const label = t(state.theme === "dark" ? "themeToLight" : "themeToDark");
  els.themeToggle.setAttribute("aria-label", label);
  els.themeToggle.title = label;
  els.themeToggle.setAttribute("aria-pressed", String(state.theme === "dark"));
}

/* ===== Events ===== */
function toggleLanguage() {
  state.lang = nextLanguage();
  saveLanguage();
  applyLanguage();
  // Same view, same week, same open cards — only the language changes.
  renderCurrentView();
}

function toggleTheme() {
  state.theme = state.theme === "dark" ? "light" : "dark";
  saveTheme();
  applyTheme();
}

function onWeekTabsKeydown(event) {
  if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key) || !state.model) return;
  const count = state.model.weeks.length;
  if (!count) return;
  const rtl = document.documentElement.dir === "rtl";
  let index = state.weekIndex;
  if (event.key === "Home") index = 0;
  else if (event.key === "End") index = count - 1;
  else {
    const forward = (event.key === "ArrowRight") !== rtl;
    index = Math.min(count - 1, Math.max(0, index + (forward ? 1 : -1)));
  }
  event.preventDefault();
  setWeek(index, { focus: true });
}

function refreshTimeSensitive() {
  if (state.view !== "schedule" || !state.model) return;
  if (state.renderedDate !== todayISO()) {
    renderSchedule(); // the day changed: move the "today" highlight
    return;
  }
  updateProgressViews();
}

// Binds an event only if the element was found by cacheElements(); logs a
// clear warning instead of throwing when index.html and app.js drift apart
// (e.g. a stale/partial copy of the project mixing old and new files).
function on(id, event, handler) {
  const el = els[id];
  if (!el) { console.warn(`KKU Schedule: #${id} not found in index.html — check that assets/app.js and index.html are from the same copy of the project.`); return; }
  el.addEventListener(event, handler);
}

function bindEvents() {
  on("langToggle", "click", toggleLanguage);
  on("themeToggle", "click", toggleTheme);
  on("changeSelectionBtn", "click", changeSelection);
  on("errorChangeBtn", "click", changeSelection);
  on("retryBtn", "click", () => {
    if (typeof state.retry === "function") state.retry();
    else window.location.reload();
  });

  on("yearGrid", "click", event => {
    const card = event.target.closest("[data-year-id]");
    if (card) chooseYear(card.dataset.yearId);
  });
  on("programGrid", "click", event => {
    const card = event.target.closest("[data-program-id]");
    if (card) chooseProgram(card.dataset.programId);
  });
  on("groupGrid", "click", event => {
    const card = event.target.closest("[data-group-id]");
    if (card) chooseGroup(card.dataset.groupId);
  });
  on("backFromPrograms", "click", backFromPrograms);
  on("backFromGroups", "click", backFromGroups);
  on("overviewBack", "click", changeSelection);
  on("scheduleBack", "click", changeSelection);

  on("weekTabs", "click", event => {
    const tab = event.target.closest("[data-week-index]");
    if (tab) setWeek(Number(tab.dataset.weekIndex));
  });
  on("weekTabs", "keydown", onWeekTabsKeydown);

  // One listener for every checkbox, wherever it is rendered.
  document.addEventListener("change", event => {
    const input = event.target;
    if (input instanceof HTMLInputElement && input.dataset.lectureId) {
      setCompleted(input.dataset.lectureId, input.checked);
    }
  });

  // Remember which subject cards are open ("toggle" doesn't bubble, so capture it).
  document.addEventListener("toggle", event => {
    const card = event.target;
    if (!(card instanceof HTMLDetailsElement) || !card.dataset.subjectKey) return;
    if (card.open) state.openSubjects.add(card.dataset.subjectKey);
    else state.openSubjects.delete(card.dataset.subjectKey);
  }, true);

  bindEditorEvents();
  bindGradesEvents();

  // Keep several open tabs in sync.
  window.addEventListener("storage", event => {
    if (event.key === CONFIG.storageKeys.checklist) {
      state.checklist = readChecklist();
      syncAllChecklistInputs();
      updateProgressViews();
    } else if (event.key === CONFIG.storageKeys.customizations) {
      state.custom = readCustom();
      mergeCustomSubjects();
      closeEditor();
      rebuildSchedule();
    }
  });

  window.setInterval(refreshTimeSensitive, CONFIG.refreshIntervalMs);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) refreshTimeSensitive();
  });
}

/* ===== Boot ===== */
async function start() {
  state.view = "loading";
  renderCurrentView();
  try {
    await loadCoreData();
  } catch (err) {
    showError(err, start);
    return;
  }
  mergeCustomSubjects();
  renderHeader();
  restoreSelection();
}

function boot() {
  try {
    cacheElements();
    state.lang = readLanguage();
    state.theme = readTheme();
    state.checklist = readChecklist();
    state.custom = readCustom();
    state.grades = readGrades();
    applyTheme();
    applyLanguage();
    bindEvents();
  } catch (err) {
    // A setup error here would otherwise leave the page stuck on the loading
    // screen with no clue why. Surface it instead — this normally means
    // index.html and assets/app.js are not from the same copy of the project.
    console.error("KKU Schedule: failed to initialize the page.", err);
  }
  start();
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
else boot();
