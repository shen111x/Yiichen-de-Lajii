const PREFIX = "[DeLajii Load]";
const START_MARK = "delajii:navigation-start";
const measures = [];
const longTasks = [];
let finalReportPrinted = false;
let windowLoadFinished = document.readyState === "complete";
let reportQueued = false;

function safeMark(name) {
  performance.mark(name);
  return performance.now();
}

function elapsedText(time = performance.now()) {
  return `+${time.toFixed(1)}ms`;
}

export function loadMark(name, detail = null) {
  const time = safeMark(name);
  if (detail === null) console.log(PREFIX, elapsedText(time), name);
  else console.log(PREFIX, elapsedText(time), name, detail);
  return time;
}

export function loadMeasure(name, startMark, endMark, detail = null) {
  try {
    const measure = performance.measure(name, startMark, endMark);
    const record = {
      name,
      startTime: measure.startTime,
      duration: measure.duration,
      detail
    };
    measures.push(record);
    console.log(
      PREFIX,
      elapsedText(measure.startTime),
      `${name}: ${measure.duration.toFixed(1)}ms`,
      detail ?? ""
    );
    return record;
  } catch (error) {
    console.warn(PREFIX, `Unable to measure "${name}"`, error);
    return null;
  }
}

export async function measureLoadStep(name, task, detail = null) {
  const start = `${name}:start`;
  const end = `${name}:end`;
  loadMark(start, detail);
  try {
    const result = await task();
    loadMark(end, detail);
    loadMeasure(name, start, end, detail);
    return result;
  } catch (error) {
    loadMark(`${name}:error`, {
      ...detail,
      message: error instanceof Error ? error.message : String(error)
    });
    throw error;
  }
}

function resourceRows() {
  return performance.getEntriesByType("resource")
    .map(entry => ({
      resource: entry.name.replace(location.href, ""),
      type: entry.initiatorType || "other",
      start_ms: Number(entry.startTime.toFixed(1)),
      duration_ms: Number(entry.duration.toFixed(1)),
      transfer_kb: Number(((entry.transferSize || 0) / 1024).toFixed(1)),
      decoded_kb: Number(((entry.decodedBodySize || 0) / 1024).toFixed(1))
    }))
    .sort((a, b) => b.duration_ms - a.duration_ms);
}

export function reportLoadPerformance() {
  if (finalReportPrinted) return;
  if (!windowLoadFinished) {
    if (!reportQueued) {
      reportQueued = true;
      addEventListener("load", () => {
        setTimeout(reportLoadPerformance, 0);
      }, { once: true });
    }
    return;
  }
  finalReportPrinted = true;

  const navigation = performance.getEntriesByType("navigation")[0];
  const navigationSummary = navigation ? {
    domInteractive_ms: Number(navigation.domInteractive.toFixed(1)),
    domContentLoaded_ms: Number(navigation.domContentLoadedEventEnd.toFixed(1)),
    windowLoad_ms: Number(navigation.loadEventEnd.toFixed(1)),
    transferred_kb: Number(((navigation.transferSize || 0) / 1024).toFixed(1))
  } : null;
  const phaseRows = [...measures]
    .sort((a, b) => b.duration - a.duration)
    .map(record => ({
      phase: record.name,
      start_ms: Number(record.startTime.toFixed(1)),
      duration_ms: Number(record.duration.toFixed(1)),
      detail: record.detail || null
    }));
  const resources = resourceRows();
  const report = {
    generatedAt: new Date().toISOString(),
    userAgent: navigator.userAgent,
    navigation: navigationSummary,
    phases: phaseRows,
    resources,
    longTasks
  };
  globalThis.__DELAJII_LOAD_REPORT__ = report;

  console.group(`${PREFIX} complete report`);
  console.log(PREFIX, "Navigation", navigationSummary ?? "Unavailable");
  console.table(phaseRows.map(row => ({
    ...row,
    detail: row.detail ? JSON.stringify(row.detail) : ""
  })));
  console.table(resources);
  if (longTasks.length) console.table(longTasks);
  console.log(`${PREFIX} COPYABLE_REPORT`, JSON.stringify(report));
  console.log(
    PREFIX,
    "Copy the COPYABLE_REPORT line, or run: copy(JSON.stringify(__DELAJII_LOAD_REPORT__))"
  );
  console.groupEnd();
}

if (!performance.getEntriesByName(START_MARK).length) {
  performance.mark(START_MARK, { startTime: 0 });
}

loadMark("delajii:performance-monitor-ready");

try {
  const longTaskObserver = new PerformanceObserver(list => {
    list.getEntries().forEach(entry => {
      longTasks.push({
        start_ms: Number(entry.startTime.toFixed(1)),
        duration_ms: Number(entry.duration.toFixed(1))
      });
    });
  });
  longTaskObserver.observe({ type: "longtask", buffered: true });
} catch {
  console.log(PREFIX, "Long-task timing is not supported by this browser.");
}

addEventListener("error", event => {
  console.error(PREFIX, elapsedText(), "window-error", {
    message: event.message,
    source: event.filename,
    line: event.lineno,
    column: event.colno
  });
});

addEventListener("unhandledrejection", event => {
  console.error(PREFIX, elapsedText(), "unhandled-rejection", event.reason);
});

addEventListener("DOMContentLoaded", () => {
  loadMark("delajii:dom-content-loaded");
}, { once: true });

addEventListener("load", () => {
  windowLoadFinished = true;
  loadMark("delajii:window-load");
}, { once: true });
