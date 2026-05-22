/* ═══════════════════════════════════════════════════════════════════════════
   RUSHCUTTER — Application Logic
   ═══════════════════════════════════════════════════════════════════════════ */

'use strict';

// ─── State ───────────────────────────────────────────────────────────────────
const state = {
  rushes:        [],      // [{name, path, status, inPoint, outPoint, duration, info}]
  currentIndex:  -1,
  activeFilter:  'all',
  outputDir:     null,
  isDraggingIn:  false,
  isDraggingOut: false,
  isDraggingHead:false,
};

// ─── DOM refs ─────────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);
const splash         = $('splash');
const app            = $('app');
const rushList       = $('rush-list');
const videoPlayer    = $('video-player');
const videoContainer = $('video-container');
const videoEmpty     = $('video-empty');
const timelinTrack   = $('timeline-track');
const timelineSel    = $('timeline-selection');
const timelinePlayed = $('timeline-played');
const timelineIn     = $('timeline-in-marker');
const timelineOut    = $('timeline-out-marker');
const timelineHead   = $('timeline-head');
const timeCurrent    = $('time-current');
const timeTotal      = $('time-total');
const tlInTime       = $('tl-in-time');
const tlOutTime      = $('tl-out-time');
const tlDuration     = $('tl-duration');
const btnExport      = $('btn-export');
const btnPlay        = $('btn-play');
const iconPlay       = $('icon-play');
const iconPause      = $('icon-pause');

// ─── Utilities ────────────────────────────────────────────────────────────────
function formatTime(s) {
  if (!isFinite(s) || s < 0) s = 0;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
}

function formatSize(bytes) {
  if (!bytes) return '—';
  if (bytes > 1e9) return (bytes / 1e9).toFixed(1) + ' GB';
  if (bytes > 1e6) return (bytes / 1e6).toFixed(1) + ' MB';
  return (bytes / 1e3).toFixed(0) + ' KB';
}

function statusIcon(status) {
  const icons = {
    pending: `<svg viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="5.5" stroke="currentColor" stroke-width="1.5" stroke-dasharray="3 2"/></svg>`,
    partial: `<svg viewBox="0 0 14 14"><rect x="1" y="5" width="12" height="4" rx="1.5" fill="currentColor"/></svg>`,
    full:    `<svg viewBox="0 0 14 14"><circle cx="7" cy="7" r="6" fill="currentColor"/><path d="M4.5 7l2 2 3-3" stroke="#000" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    deleted: `<svg viewBox="0 0 14 14"><line x1="3" y1="3" x2="11" y2="11" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><line x1="11" y1="3" x2="3" y2="11" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`,
  };
  return icons[status] || icons.pending;
}

function statusLabel(status) {
  const labels = { pending: 'À vérifier', partial: 'Partiel', full: 'Complet', deleted: 'Supprimé' };
  return labels[status] || status;
}

// ─── Rush list rendering ──────────────────────────────────────────────────────
function buildRushList() {
  rushList.innerHTML = '';
  const filtered = state.rushes.filter(r =>
    state.activeFilter === 'all' || r.status === state.activeFilter
  );

  for (const rush of filtered) {
    const globalIdx = state.rushes.indexOf(rush);
    const li = document.createElement('li');
    li.className = 'rush-item' + (globalIdx === state.currentIndex ? ' active' : '');
    li.dataset.status = rush.status;
    li.dataset.idx = globalIdx;

    const durationStr = rush.duration ? formatTime(rush.duration) : '—';
    const inStr  = formatTime(rush.inPoint  || 0);
    const outStr = formatTime(rush.outPoint !== undefined ? rush.outPoint : (rush.duration || 0));

    li.innerHTML = `
      <span class="rush-status-icon">${statusIcon(rush.status)}</span>
      <div class="rush-item-info">
        <span class="rush-name" title="${rush.name}">${rush.name}</span>
        <div class="rush-meta">
          <span>${durationStr}</span>
          ${rush.status === 'partial' ? `<span>| ${inStr} → ${outStr}</span>` : ''}
        </div>
      </div>`;

    li.addEventListener('click', () => selectRush(globalIdx));
    rushList.appendChild(li);
  }

  $('rush-count').textContent = state.rushes.length;
  updateStats();
  checkExportReady();
}

function updateStats() {
  const counts = { pending: 0, partial: 0, full: 0, deleted: 0 };
  for (const r of state.rushes) counts[r.status] = (counts[r.status] || 0) + 1;
  $('stat-pending').textContent = counts.pending;
  $('stat-partial').textContent = counts.partial;
  $('stat-full').textContent    = counts.full;
  $('stat-deleted').textContent = counts.deleted;
}

function checkExportReady() {
  const allReviewed = state.rushes.every(r => r.status !== 'pending');
  const hasExportable = state.rushes.some(r => r.status !== 'deleted');
  btnExport.disabled = !(allReviewed && hasExportable && state.rushes.length > 0);
}

// ─── Rush selection ───────────────────────────────────────────────────────────
async function selectRush(idx) {
  if (idx < 0 || idx >= state.rushes.length) return;

  state.currentIndex = idx;
  const rush = state.rushes[idx];

  // Highlight in list
  document.querySelectorAll('.rush-item').forEach(el => {
    el.classList.toggle('active', parseInt(el.dataset.idx) === idx);
  });

  // Scroll item into view
  const activeEl = rushList.querySelector('.rush-item.active');
  if (activeEl) activeEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' });

  // Load into video player
  videoEmpty.classList.add('hidden');
  videoContainer.classList.remove('hidden');

  videoPlayer.src = `file://${rush.path}`;
  videoPlayer.load();

  // Fetch info if not cached
  if (!rush.info) {
    rush.info = await window.api.getVideoInfo(rush.path);
    rush.duration = rush.info.duration;
    if (rush.inPoint === undefined)  rush.inPoint  = 0;
    if (rush.outPoint === undefined) rush.outPoint = rush.duration;
    buildRushList();
  }

  // Set player to in-point
  videoPlayer.currentTime = rush.inPoint || 0;

  updateVideoInfoBar(rush);
  updateTimeDisplay();
  updateTimeline();
  updateActionButtons();
}

function updateVideoInfoBar(rush) {
  const info = rush.info || {};
  $('info-filename').textContent  = rush.name;
  $('info-codec').textContent     = (info.codec || '—').toUpperCase();
  $('info-resolution').textContent = info.width ? `${info.width}×${info.height}` : '—';
  $('info-fps').textContent       = info.fps ? `${info.fps.toFixed(2)} fps` : '—';
  $('info-size').textContent      = formatSize(info.size);
}

// ─── Playback ─────────────────────────────────────────────────────────────────
function togglePlay() {
  if (videoPlayer.paused) {
    videoPlayer.play();
  } else {
    videoPlayer.pause();
  }
}

function seek(seconds) {
  const rush = currentRush();
  if (!rush) return;
  let t = videoPlayer.currentTime + seconds;
  t = Math.max(0, Math.min(rush.duration || videoPlayer.duration || 0, t));
  videoPlayer.currentTime = t;
}

function currentRush() {
  return state.rushes[state.currentIndex] || null;
}

videoPlayer.addEventListener('play',  () => { iconPlay.classList.add('hidden'); iconPause.classList.remove('hidden'); });
videoPlayer.addEventListener('pause', () => { iconPlay.classList.remove('hidden'); iconPause.classList.add('hidden'); });
videoPlayer.addEventListener('ended', () => { iconPlay.classList.remove('hidden'); iconPause.classList.add('hidden'); });

videoPlayer.addEventListener('timeupdate', () => {
  updateTimeDisplay();
  updateTimelineHead();
});

videoPlayer.addEventListener('loadedmetadata', () => {
  const rush = currentRush();
  if (rush && !rush.duration) {
    rush.duration = videoPlayer.duration;
    if (rush.outPoint === undefined || rush.outPoint === 0) rush.outPoint = rush.duration;
  }
  updateTimeDisplay();
  updateTimeline();
});

function updateTimeDisplay() {
  const t = videoPlayer.currentTime;
  timeCurrent.textContent = formatTime(t);
  const rush = currentRush();
  const dur = rush ? (rush.duration || videoPlayer.duration || 0) : 0;
  timeTotal.textContent = formatTime(dur);
}

// ─── Timeline ─────────────────────────────────────────────────────────────────
function updateTimeline() {
  const rush = currentRush();
  if (!rush) return;
  const dur = rush.duration || videoPlayer.duration || 1;
  const inPct  = ((rush.inPoint  || 0) / dur) * 100;
  const outPct = ((rush.outPoint !== undefined ? rush.outPoint : dur) / dur) * 100;

  timelineSel.style.left  = `${inPct}%`;
  timelineSel.style.width = `${outPct - inPct}%`;
  timelineIn.style.left   = `${inPct}%`;
  timelineOut.style.left  = `calc(${outPct}% - 3px)`;

  tlInTime.textContent  = formatTime(rush.inPoint || 0);
  tlOutTime.textContent = formatTime(rush.outPoint !== undefined ? rush.outPoint : dur);

  const selDur = (rush.outPoint || dur) - (rush.inPoint || 0);
  tlDuration.textContent = `sélection : ${formatTime(selDur)}`;
}

function updateTimelineHead() {
  const rush = currentRush();
  const dur = rush ? (rush.duration || videoPlayer.duration || 1) : 1;
  const t = videoPlayer.currentTime;
  const pct = Math.max(0, Math.min(100, (t / dur) * 100));
  timelineHead.style.left = `${pct}%`;
  timelinePlayed.style.width = `${pct}%`;
}

// Timeline click/drag for playhead
timelinTrack.addEventListener('mousedown', (e) => {
  // Check if clicking on IN/OUT markers
  const rect = timelinTrack.getBoundingClientRect();
  const pct = (e.clientX - rect.left) / rect.width;
  const rush = currentRush();
  if (!rush) return;
  const dur = rush.duration || videoPlayer.duration || 1;

  // Detect marker hit area (±8px)
  const inPx  = (rush.inPoint  / dur) * rect.width;
  const outPx = ((rush.outPoint !== undefined ? rush.outPoint : dur) / dur) * rect.width;
  const clickX = e.clientX - rect.left;

  if (Math.abs(clickX - inPx) < 10) {
    state.isDraggingIn = true;
    e.preventDefault(); return;
  }
  if (Math.abs(clickX - outPx) < 10) {
    state.isDraggingOut = true;
    e.preventDefault(); return;
  }

  // Click to seek
  const t = pct * dur;
  videoPlayer.currentTime = Math.max(0, Math.min(dur, t));
  state.isDraggingHead = true;
  e.preventDefault();
});

document.addEventListener('mousemove', (e) => {
  if (!state.isDraggingIn && !state.isDraggingOut && !state.isDraggingHead) return;
  const rush = currentRush();
  if (!rush) return;
  const rect = timelinTrack.getBoundingClientRect();
  const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
  const dur = rush.duration || videoPlayer.duration || 1;
  const t = pct * dur;

  if (state.isDraggingIn) {
    rush.inPoint = Math.min(t, rush.outPoint - 0.5);
    updateTimeline();
    updateRushStatus();
  } else if (state.isDraggingOut) {
    rush.outPoint = Math.max(t, rush.inPoint + 0.5);
    updateTimeline();
    updateRushStatus();
  } else if (state.isDraggingHead) {
    videoPlayer.currentTime = t;
  }
});

document.addEventListener('mouseup', () => {
  if (state.isDraggingIn || state.isDraggingOut) {
    buildRushList();
  }
  state.isDraggingIn = state.isDraggingOut = state.isDraggingHead = false;
});

// ─── Rush status management ───────────────────────────────────────────────────
function setInPoint() {
  const rush = currentRush();
  if (!rush) return;
  rush.inPoint = videoPlayer.currentTime;
  if (rush.inPoint >= rush.outPoint) rush.outPoint = rush.duration || videoPlayer.duration;
  updateRushStatus();
  updateTimeline();
  buildRushList();
  flashOverlay('🎬');
}

function setOutPoint() {
  const rush = currentRush();
  if (!rush) return;
  rush.outPoint = videoPlayer.currentTime;
  if (rush.outPoint <= rush.inPoint) rush.inPoint = 0;
  updateRushStatus();
  updateTimeline();
  buildRushList();
  flashOverlay('🎬');
}

function resetRush() {
  const rush = currentRush();
  if (!rush) return;
  rush.inPoint  = 0;
  rush.outPoint = rush.duration || videoPlayer.duration || 0;
  rush.status   = 'full';
  updateTimeline();
  buildRushList();
  updateActionButtons();
  flashOverlay('✅');
}

function deleteRush() {
  const rush = currentRush();
  if (!rush) return;
  rush.status = 'deleted';
  buildRushList();
  updateActionButtons();
  flashOverlay('🗑️');
  // Auto-advance
  setTimeout(() => {
    const next = state.currentIndex + 1;
    if (next < state.rushes.length) selectRush(next);
  }, 400);
}

function updateRushStatus() {
  const rush = currentRush();
  if (!rush || rush.status === 'deleted') return;
  const dur = rush.duration || videoPlayer.duration || 0;
  const inIsStart  = rush.inPoint < 0.5;
  const outIsEnd   = dur - rush.outPoint < 0.5;
  rush.status = (inIsStart && outIsEnd) ? 'full' : 'partial';
}

function updateActionButtons() {
  const rush = currentRush();
  if (!rush) return;
  $('btn-delete').classList.toggle('active', rush.status === 'deleted');
  $('btn-reset').classList.toggle('active',  rush.status === 'full');
}

function flashOverlay(emoji) {
  const el = $('overlay-status-icon');
  el.textContent = emoji;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 600);
}

// ─── Keyboard shortcuts ───────────────────────────────────────────────────────
document.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
  if (!app.classList.contains('hidden') && state.currentIndex >= 0) {
    switch (e.code) {
      case 'Space':
        e.preventDefault();
        togglePlay();
        break;
      case 'ArrowLeft':
        e.preventDefault();
        seek(-10);
        break;
      case 'ArrowRight':
        e.preventDefault();
        seek(10);
        break;
      case 'ArrowUp':
        e.preventDefault();
        if (state.currentIndex > 0) selectRush(state.currentIndex - 1);
        break;
      case 'ArrowDown':
        e.preventDefault();
        if (state.currentIndex < state.rushes.length - 1) selectRush(state.currentIndex + 1);
        break;
      case 'KeyI':
        e.preventDefault();
        setInPoint();
        break;
      case 'KeyO':
        e.preventDefault();
        setOutPoint();
        break;
      case 'KeyR':
        e.preventDefault();
        resetRush();
        break;
      case 'Backspace':
      case 'Delete':
        e.preventDefault();
        deleteRush();
        break;
    }
  }
});

// ─── Control buttons ──────────────────────────────────────────────────────────
btnPlay.addEventListener('click', togglePlay);
$('btn-seek-back').addEventListener('click', () => seek(-10));
$('btn-seek-fwd').addEventListener('click', () => seek(10));
$('btn-prev-rush').addEventListener('click', () => { if (state.currentIndex > 0) selectRush(state.currentIndex - 1); });
$('btn-next-rush').addEventListener('click', () => { if (state.currentIndex < state.rushes.length - 1) selectRush(state.currentIndex + 1); });
$('btn-set-in').addEventListener('click', setInPoint);
$('btn-set-out').addEventListener('click', setOutPoint);
$('btn-reset').addEventListener('click', resetRush);
$('btn-delete').addEventListener('click', deleteRush);

// ─── Directory opening ────────────────────────────────────────────────────────
async function openDirectory() {
  const dir = await window.api.selectDirectory();
  if (!dir) return;

  const files = await window.api.scanDirectory(dir);
  if (files.length === 0) {
    alert('Aucun fichier vidéo trouvé dans ce répertoire.');
    return;
  }

  state.rushes       = files.map(f => ({ ...f, status: 'pending', inPoint: 0, outPoint: undefined }));
  state.currentIndex = -1;
  state.activeFilter = 'all';

  $('header-dir').textContent = dir;
  splash.classList.add('hidden');
  app.classList.remove('hidden');

  buildRushList();

  // Load info for first few items in background
  selectRush(0);
}

$('btn-open-dir').addEventListener('click', openDirectory);
// $('btn-new-session').addEventListener('click', () => {
//   videoPlayer.pause();
//   splash.classList.remove('hidden');
//   app.classList.add('hidden');
//   state.rushes = [];
//   state.currentIndex = -1;
// });

// ─── Filters ──────────────────────────────────────────────────────────────────
document.querySelectorAll('.filter-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    state.activeFilter = btn.dataset.filter;
    buildRushList();
  });
});

// ─── Export ───────────────────────────────────────────────────────────────────
btnExport.addEventListener('click', openExportModal);

function openExportModal() {
  const partial = state.rushes.filter(r => r.status === 'partial').length;
  const full    = state.rushes.filter(r => r.status === 'full').length;
  const deleted = state.rushes.filter(r => r.status === 'deleted').length;

  $('export-summary').innerHTML = `
    <div class="summary-item c-yellow"><span class="summary-num">${partial}</span><span class="summary-lbl">Partiels</span></div>
    <div class="summary-item c-green"><span class="summary-num">${full}</span><span class="summary-lbl">Complets</span></div>
    <div class="summary-item c-red"><span class="summary-num">${deleted}</span><span class="summary-lbl">Supprimés</span></div>`;

  $('export-config').classList.remove('hidden');
  $('export-progress-view').classList.add('hidden');
  $('export-done-view').classList.add('hidden');
  $('export-modal').classList.remove('hidden');
}

$('modal-close').addEventListener('click', () => $('export-modal').classList.add('hidden'));
$('btn-cancel-export').addEventListener('click', () => $('export-modal').classList.add('hidden'));

$('btn-choose-output').addEventListener('click', async () => {
  const dir = await window.api.selectOutputDirectory();
  if (!dir) return;
  state.outputDir = dir;
  const el = $('output-dir-display');
  el.textContent = dir;
  el.classList.add('set');
  $('btn-start-export').disabled = false;
});

$('btn-start-export').addEventListener('click', async () => {
  if (!state.outputDir) return;

  const clipsToProcess = state.rushes.filter(r => r.status !== 'pending');

  $('export-config').classList.add('hidden');
  $('export-progress-view').classList.remove('hidden');

  const total = clipsToProcess.filter(c => c.status !== 'deleted').length;
  $('progress-fraction').textContent = `0 / ${total}`;
  $('progress-bar-fill').style.width = '0%';

  window.api.onExportProgress((data) => {
    $('progress-fraction').textContent = `${data.current} / ${data.total}`;
    $('progress-bar-fill').style.width = `${(data.current / data.total) * 100}%`;
    $('progress-current-file').textContent = data.name;
  });

  try {
    const results = await window.api.exportClips(clipsToProcess, state.outputDir);
    window.api.removeExportProgress();

    $('export-progress-view').classList.add('hidden');
    $('export-done-view').classList.remove('hidden');

    const resultsEl = $('export-results');
    resultsEl.innerHTML = results.map(r => {
      if (r.skipped) return `<div class="result-skip">— ${r.name} (ignoré)</div>`;
      if (r.success) return `<div class="result-ok">✓ ${r.name}</div>`;
      return `<div class="result-err">✗ ${r.name}: ${r.error}</div>`;
    }).join('');
  } catch (e) {
    window.api.removeExportProgress();
    alert('Erreur lors de l\'export : ' + e.message);
    $('export-modal').classList.add('hidden');
  }
});

$('btn-close-done').addEventListener('click', () => {
  $('export-modal').classList.add('hidden');
  state.outputDir = null;
  $('output-dir-display').textContent = 'Non sélectionné';
  $('output-dir-display').classList.remove('set');
  $('btn-start-export').disabled = true;
});

// ─── Shortcuts panel ──────────────────────────────────────────────────────────
// $('btn-shortcuts').addEventListener('click', () => {
//   $('shortcuts-panel').classList.toggle('hidden');
// });

document.addEventListener('click', (e) => {
  if (!$('shortcuts-panel').classList.contains('hidden') &&
      !$('shortcuts-panel').contains(e.target) &&
      e.target !== $('btn-shortcuts')) {
    $('shortcuts-panel').classList.add('hidden');
  }
});
