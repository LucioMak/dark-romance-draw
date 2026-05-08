(() => {
  'use strict';

  const DB_NAME = 'dark-romance-draw-db';
  const DB_VERSION = 1;
  const PAGE_SIZE = 48;
  const SUPPORTED_MIME = [
    'image/gif', 'image/webp', 'image/png',
    'video/mp4', 'video/webm', 'video/quicktime', 'video/x-m4v',
    'audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/mp4'
  ];
  const MEDIA_EXTENSIONS = ['gif', 'webp', 'mp4', 'webm', 'mov', 'm4v', 'apng', 'png'];

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

  const state = {
    db: null,
    unlocked: false,
    allMedia: [],
    filteredMedia: [],
    history: [],
    page: 1,
    staging: [],
    currentResult: null,
    currentDraw: null,
    selectedIds: new Set(),
    objectUrls: new Set(),
    deferredInstallPrompt: null,
    timer: {
      running: false,
      startedAt: null,
      elapsed: 0,
      interval: null,
      laps: []
    }
  };

  const els = {};

  document.addEventListener('DOMContentLoaded', init);

  async function init() {
    cacheElements();
    bindUI();
    await openDB();
    await loadTheme();
    await setupServiceWorker();
    await checkPinState();
    restoreTimer();
    updateTimerDisplay();
  }

  function cacheElements() {
    Object.assign(els, {
      lockScreen: $('#lock-screen'),
      appShell: $('#app-shell'),
      pinForm: $('#pin-form'),
      pinInput: $('#pin-input'),
      pinConfirm: $('#pin-confirm'),
      pinSubmit: $('#pin-submit'),
      pinSubtitle: $('#lock-subtitle'),
      pinMessage: $('#pin-message'),
      resetFromLock: $('#reset-app-from-lock'),
      lockBtn: $('#lock-btn'),
      installBtn: $('#install-btn'),
      tabs: $$('.tab'),
      views: $$('.view'),
      drawBtn: $('#draw-btn'),
      drawTarget: $('#draw-target'),
      drawMode: $('#draw-mode'),
      drawLevels: $('#draw-levels'),
      includeDone: $('#include-done'),
      includeTags: $('#include-tags'),
      excludeTags: $('#exclude-tags'),
      resultCard: $('#result-card'),
      resultTarget: $('#result-target'),
      resultTitle: $('#result-title'),
      resultLevel: $('#result-level'),
      resultMedia: $('#result-media'),
      resultNote: $('#result-note'),
      resultTags: $('#result-tags'),
      markDoneBtn: $('#mark-done-btn'),
      markNotDoneBtn: $('#mark-not-done-btn'),
      rerollBtn: $('#reroll-btn'),
      editResultBtn: $('#edit-result-btn'),
      timerDisplay: $('#timer-display'),
      timerToggle: $('#timer-toggle'),
      timerReset: $('#timer-reset'),
      timerLap: $('#timer-lap'),
      lapList: $('#lap-list'),
      statMedia: $('#stat-media'),
      statUndone: $('#stat-undone'),
      statDone: $('#stat-done'),
      statDraws: $('#stat-draws'),
      fileInput: $('#file-input'),
      dropZone: $('#drop-zone'),
      defaultTarget: $('#default-target'),
      defaultLevel: $('#default-level'),
      defaultTags: $('#default-tags'),
      stagingSummary: $('#staging-summary'),
      stagingList: $('#staging-list'),
      clearStaging: $('#clear-staging'),
      saveStaging: $('#save-staging'),
      importProgress: $('#import-progress'),
      searchInput: $('#search-input'),
      filterTarget: $('#filter-target'),
      filterLevel: $('#filter-level'),
      filterDone: $('#filter-done'),
      filterType: $('#filter-type'),
      filterTags: $('#filter-tags'),
      sortMedia: $('#sort-media'),
      mediaGrid: $('#media-grid'),
      libraryCount: $('#library-count'),
      prevPage: $('#prev-page'),
      nextPage: $('#next-page'),
      pageLabel: $('#page-label'),
      bulkDone: $('#bulk-done'),
      bulkUndone: $('#bulk-undone'),
      bulkDelete: $('#bulk-delete'),
      historyStats: $('#history-stats'),
      historyList: $('#history-list'),
      clearHistory: $('#clear-history'),
      deezerUrl: $('#deezer-url'),
      loadDeezer: $('#load-deezer'),
      deezerPlayer: $('#deezer-player'),
      audioInput: $('#audio-input'),
      localAudio: $('#local-audio'),
      audioLoop: $('#audio-loop'),
      oldPin: $('#old-pin'),
      newPin: $('#new-pin'),
      changePin: $('#change-pin'),
      themeSelect: $('#theme-select'),
      animationsToggle: $('#animations-toggle'),
      exportLight: $('#export-light'),
      exportFull: $('#export-full'),
      backupInput: $('#backup-input'),
      resetStatuses: $('#reset-statuses'),
      deleteHistory: $('#delete-history'),
      deleteAll: $('#delete-all'),
      storageInfo: $('#storage-info'),
      editDialog: $('#edit-dialog'),
      editForm: $('#edit-form'),
      editId: $('#edit-id'),
      editTitle: $('#edit-title'),
      editTarget: $('#edit-target'),
      editLevel: $('#edit-level'),
      editTags: $('#edit-tags'),
      editNote: $('#edit-note'),
      editDone: $('#edit-done'),
      saveEdit: $('#save-edit'),
      toast: $('#toast')
    });
  }

  function bindUI() {
    els.pinForm.addEventListener('submit', onPinSubmit);
    els.resetFromLock.addEventListener('click', resetEverythingFromLock);
    els.lockBtn.addEventListener('click', lockApp);

    els.tabs.forEach(tab => tab.addEventListener('click', () => switchView(tab.dataset.view)));

    els.drawBtn.addEventListener('click', performDraw);
    els.rerollBtn.addEventListener('click', performDraw);
    els.markDoneBtn.addEventListener('click', () => markCurrentResult(true));
    els.markNotDoneBtn.addEventListener('click', () => markCurrentResult(false));
    els.editResultBtn.addEventListener('click', () => state.currentResult && openEditDialog(state.currentResult.id));

    els.timerToggle.addEventListener('click', toggleTimer);
    els.timerReset.addEventListener('click', resetTimer);
    els.timerLap.addEventListener('click', addLap);

    els.fileInput.addEventListener('change', event => stageFiles(event.target.files));
    ['dragenter', 'dragover'].forEach(type => els.dropZone.addEventListener(type, event => {
      event.preventDefault();
      els.dropZone.classList.add('dragover');
    }));
    ['dragleave', 'drop'].forEach(type => els.dropZone.addEventListener(type, event => {
      event.preventDefault();
      els.dropZone.classList.remove('dragover');
    }));
    els.dropZone.addEventListener('drop', event => stageFiles(event.dataTransfer.files));
    els.clearStaging.addEventListener('click', clearStaging);
    els.saveStaging.addEventListener('click', saveStagedFiles);

    [els.searchInput, els.filterTags].forEach(el => el.addEventListener('input', debounce(renderLibrary, 150)));
    [els.filterTarget, els.filterLevel, els.filterDone, els.filterType, els.sortMedia].forEach(el => el.addEventListener('change', renderLibrary));
    els.prevPage.addEventListener('click', () => changePage(-1));
    els.nextPage.addEventListener('click', () => changePage(1));
    els.bulkDone.addEventListener('click', () => bulkUpdateDone(true));
    els.bulkUndone.addEventListener('click', () => bulkUpdateDone(false));
    els.bulkDelete.addEventListener('click', bulkDelete);

    els.clearHistory.addEventListener('click', clearHistory);

    els.loadDeezer.addEventListener('click', loadDeezerWidget);
    els.audioInput.addEventListener('change', loadLocalAudio);
    els.audioLoop.addEventListener('change', () => { els.localAudio.loop = els.audioLoop.checked; });

    els.changePin.addEventListener('click', changePin);
    els.themeSelect.addEventListener('change', saveTheme);
    els.animationsToggle.addEventListener('change', saveMotionPreference);
    els.exportLight.addEventListener('click', () => exportBackup(false));
    els.exportFull.addEventListener('click', () => exportBackup(true));
    els.backupInput.addEventListener('change', importBackup);
    els.resetStatuses.addEventListener('click', resetStatuses);
    els.deleteHistory.addEventListener('click', clearHistory);
    els.deleteAll.addEventListener('click', deleteAllData);

    els.editForm.addEventListener('submit', saveEditDialog);

    window.addEventListener('beforeunload', revokeObjectUrls);
    window.addEventListener('beforeinstallprompt', event => {
      event.preventDefault();
      state.deferredInstallPrompt = event;
      els.installBtn.classList.remove('hidden');
    });
    els.installBtn.addEventListener('click', async () => {
      if (!state.deferredInstallPrompt) return;
      state.deferredInstallPrompt.prompt();
      await state.deferredInstallPrompt.userChoice;
      state.deferredInstallPrompt = null;
      els.installBtn.classList.add('hidden');
    });
  }

  function openDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = event => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains('settings')) db.createObjectStore('settings', { keyPath: 'key' });
        if (!db.objectStoreNames.contains('media')) {
          const media = db.createObjectStore('media', { keyPath: 'id' });
          media.createIndex('target', 'target', { unique: false });
          media.createIndex('level', 'level', { unique: false });
          media.createIndex('done', 'done', { unique: false });
          media.createIndex('createdAt', 'createdAt', { unique: false });
        }
        if (!db.objectStoreNames.contains('files')) db.createObjectStore('files', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('draws')) {
          const draws = db.createObjectStore('draws', { keyPath: 'id' });
          draws.createIndex('drawnAt', 'drawnAt', { unique: false });
          draws.createIndex('mediaId', 'mediaId', { unique: false });
        }
      };
      request.onsuccess = () => { state.db = request.result; resolve(); };
      request.onerror = () => reject(request.error);
    });
  }

  function tx(storeNames, mode = 'readonly') {
    return state.db.transaction(Array.isArray(storeNames) ? storeNames : [storeNames], mode);
  }

  function promisify(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  function getStoreValue(store, key) {
    return promisify(tx(store).objectStore(store).get(key));
  }

  function putStoreValue(store, value) {
    return new Promise((resolve, reject) => {
      const transaction = tx(store, 'readwrite');
      transaction.objectStore(store).put(value);
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error);
    });
  }

  function deleteStoreValue(store, key) {
    return new Promise((resolve, reject) => {
      const transaction = tx(store, 'readwrite');
      transaction.objectStore(store).delete(key);
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error);
    });
  }

  function getAll(store) {
    return promisify(tx(store).objectStore(store).getAll());
  }

  async function getSetting(key, fallback = null) {
    const row = await getStoreValue('settings', key);
    return row ? row.value : fallback;
  }

  function setSetting(key, value) {
    return putStoreValue('settings', { key, value });
  }

  async function setupServiceWorker() {
    if ('serviceWorker' in navigator && location.protocol !== 'file:') {
      try { await navigator.serviceWorker.register('./service-worker.js'); }
      catch (error) { console.warn('Service worker ignoré:', error); }
    }
  }

  async function checkPinState() {
    const hash = await getSetting('pinHash');
    const salt = await getSetting('pinSalt');
    els.lockScreen.classList.remove('hidden');
    els.appShell.classList.add('hidden');
    els.pinInput.value = '';
    els.pinConfirm.value = '';
    els.pinMessage.textContent = '';
    if (!hash || !salt) {
      els.pinSubtitle.textContent = 'Crée un code PIN privé à 4 chiffres.';
      els.pinConfirm.classList.remove('hidden');
      els.pinSubmit.textContent = 'Créer le code';
      els.pinForm.dataset.mode = 'setup';
    } else {
      els.pinSubtitle.textContent = 'Déverrouille l’application privée.';
      els.pinConfirm.classList.add('hidden');
      els.pinSubmit.textContent = 'Entrer';
      els.pinForm.dataset.mode = 'unlock';
    }
    setTimeout(() => els.pinInput.focus(), 40);
  }

  async function onPinSubmit(event) {
    event.preventDefault();
    const pin = els.pinInput.value.trim();
    const confirm = els.pinConfirm.value.trim();
    if (!/^\d{4}$/.test(pin)) return showPinMessage('Le PIN doit contenir exactement 4 chiffres. Quelle surprise, un PIN de 4 chiffres veut 4 chiffres.');

    if (els.pinForm.dataset.mode === 'setup') {
      if (pin !== confirm) return showPinMessage('Les deux codes ne correspondent pas.');
      const salt = cryptoRandomId();
      const hash = await hashPin(pin, salt);
      await setSetting('pinSalt', salt);
      await setSetting('pinHash', hash);
      await unlockApp();
      toast('PIN créé. Application verrouillable.');
    } else {
      const salt = await getSetting('pinSalt');
      const hash = await getSetting('pinHash');
      const attempt = await hashPin(pin, salt);
      if (attempt !== hash) return showPinMessage('Code incorrect.');
      await unlockApp();
    }
  }

  function showPinMessage(message) { els.pinMessage.textContent = message; }

  async function unlockApp() {
    state.unlocked = true;
    els.lockScreen.classList.add('hidden');
    els.appShell.classList.remove('hidden');
    await refreshData();
  }

  function lockApp() {
    state.unlocked = false;
    state.currentResult = null;
    state.currentDraw = null;
    revokeObjectUrls();
    checkPinState();
  }

  async function hashPin(pin, salt) {
    const data = new TextEncoder().encode(`${salt}:${pin}`);
    const buffer = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(buffer)).map(byte => byte.toString(16).padStart(2, '0')).join('');
  }

  function cryptoRandomId() {
    if (crypto.randomUUID) return crypto.randomUUID();
    const values = new Uint32Array(4);
    crypto.getRandomValues(values);
    return Array.from(values).map(v => v.toString(16)).join('-');
  }

  async function refreshData() {
    state.allMedia = await getAll('media');
    state.history = (await getAll('draws')).sort((a, b) => b.drawnAt.localeCompare(a.drawnAt));
    renderStats();
    renderLibrary();
    renderHistory();
    updateStorageInfo();
  }

  function switchView(viewId) {
    els.tabs.forEach(tab => tab.classList.toggle('active', tab.dataset.view === viewId));
    els.views.forEach(view => view.classList.toggle('active', view.id === viewId));
    if (viewId === 'library-view') renderLibrary();
    if (viewId === 'history-view') renderHistory();
    if (viewId === 'settings-view') updateStorageInfo();
  }

  function parseTags(value) {
    return String(value || '')
      .split(',')
      .map(tag => tag.trim().toLowerCase())
      .filter(Boolean)
      .filter((tag, index, array) => array.indexOf(tag) === index);
  }

  function formatTarget(target) {
    return target === 'lui' ? 'Lui' : target === 'elle' ? 'Elle' : 'Mixte';
  }

  function formatResultTarget(target) {
    return target === 'lui' ? 'Pour Lui' : target === 'elle' ? 'Pour Elle' : 'Mixte';
  }

  function getExtension(fileName = '') {
    return fileName.split('.').pop()?.toLowerCase() || '';
  }

  function detectKind(mimeType, fileName) {
    const ext = getExtension(fileName);
    if (mimeType?.startsWith('video/') || ['mp4', 'webm', 'mov', 'm4v'].includes(ext)) return 'video';
    if (mimeType?.startsWith('image/') || ['gif', 'webp', 'png', 'apng'].includes(ext)) return 'image';
    return 'unknown';
  }

  function typeLabel(media) {
    return (media.extension || getExtension(media.fileName) || media.mimeType || 'fichier').toUpperCase();
  }

  function isSupportedMedia(file) {
    const ext = getExtension(file.name);
    return SUPPORTED_MIME.includes(file.type) || MEDIA_EXTENSIONS.includes(ext);
  }

  function bytes(size) {
    if (!size) return '0 o';
    const units = ['o', 'Ko', 'Mo', 'Go'];
    const power = Math.min(Math.floor(Math.log(size) / Math.log(1024)), units.length - 1);
    return `${(size / Math.pow(1024, power)).toFixed(power ? 1 : 0)} ${units[power]}`;
  }

  function formatDate(iso) {
    try { return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(iso)); }
    catch { return iso; }
  }

  function debounce(fn, wait) {
    let timer;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), wait);
    };
  }

  function toast(message, duration = 3200) {
    els.toast.textContent = message;
    els.toast.classList.remove('hidden');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => els.toast.classList.add('hidden'), duration);
  }

  function createUrl(blob) {
    const url = URL.createObjectURL(blob);
    state.objectUrls.add(url);
    return url;
  }

  function revokeObjectUrls() {
    state.objectUrls.forEach(url => URL.revokeObjectURL(url));
    state.objectUrls.clear();
  }

  async function renderMediaElement(media, container, options = {}) {
    container.innerHTML = '<span class="muted">Chargement...</span>';
    const fileRow = await getStoreValue('files', media.id);
    if (!fileRow?.blob) {
      container.innerHTML = '<span class="muted">Fichier introuvable</span>';
      return;
    }
    const url = createUrl(fileRow.blob);
    const kind = media.kind || detectKind(media.mimeType, media.fileName);
    container.innerHTML = '';
    if (kind === 'video') {
      const video = document.createElement('video');
      video.src = url;
      video.loop = true;
      video.muted = true;
      video.playsInline = true;
      video.autoplay = options.autoplay !== false;
      video.controls = options.controls !== false;
      video.preload = 'metadata';
      video.addEventListener('error', () => {
        container.innerHTML = '<span class="muted">Ce format vidéo n’est pas supporté par ce navigateur.</span>';
      });
      container.appendChild(video);
      if (video.autoplay) video.play().catch(() => { video.controls = true; });
    } else {
      const img = document.createElement('img');
      img.src = url;
      img.alt = media.title || media.fileName || 'Média animé';
      img.loading = options.loading || 'lazy';
      img.addEventListener('error', () => {
        container.innerHTML = '<span class="muted">Image impossible à lire.</span>';
      });
      container.appendChild(img);
    }
  }

  function renderStats() {
    const total = state.allMedia.length;
    const done = state.allMedia.filter(m => m.done).length;
    els.statMedia.textContent = total;
    els.statDone.textContent = done;
    els.statUndone.textContent = Math.max(total - done, 0);
    els.statDraws.textContent = state.history.length;
  }

  async function stageFiles(fileList) {
    const files = Array.from(fileList || []);
    if (!files.length) return;
    const defaultTags = parseTags(els.defaultTags.value);
    let rejected = 0;
    const newItems = files.map(file => {
      if (!isSupportedMedia(file)) { rejected += 1; return null; }
      const id = cryptoRandomId();
      return {
        id,
        file,
        title: file.name.replace(/\.[^.]+$/, ''),
        target: els.defaultTarget.value,
        level: Number(els.defaultLevel.value),
        tags: [...defaultTags],
        note: '',
        kind: detectKind(file.type, file.name),
        mimeType: file.type || inferMimeFromExtension(file.name),
        extension: getExtension(file.name)
      };
    }).filter(Boolean);
    state.staging.push(...newItems);
    renderStaging();
    if (rejected) toast(`${rejected} fichier(s) refusé(s), format non reconnu.`);
  }

  function inferMimeFromExtension(fileName) {
    const ext = getExtension(fileName);
    const map = {
      gif: 'image/gif', webp: 'image/webp', png: 'image/png', apng: 'image/png',
      mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', m4v: 'video/x-m4v'
    };
    return map[ext] || 'application/octet-stream';
  }

  function renderStaging() {
    els.stagingSummary.textContent = state.staging.length
      ? `${state.staging.length} fichier(s) prêts à importer.`
      : 'Aucun fichier sélectionné.';
    els.stagingList.innerHTML = '';
    if (!state.staging.length) return;

    const fragment = document.createDocumentFragment();
    state.staging.slice(0, 300).forEach(item => {
      const row = document.createElement('div');
      row.className = 'staging-item';
      row.dataset.id = item.id;

      const preview = document.createElement('div');
      preview.className = 'staging-preview';
      const url = createUrl(item.file);
      if (item.kind === 'video') {
        const video = document.createElement('video');
        video.src = url;
        video.loop = true;
        video.muted = true;
        video.playsInline = true;
        video.preload = 'metadata';
        preview.appendChild(video);
      } else {
        const img = document.createElement('img');
        img.src = url;
        img.alt = item.title;
        preview.appendChild(img);
      }

      row.append(
        preview,
        createInput(item.title, value => item.title = value, 'Titre'),
        createSelect(item.target, ['lui', 'elle', 'mixte'], value => item.target = value),
        createSelect(String(item.level), ['1', '2', '3', '4', '5'], value => item.level = Number(value)),
        createInput(item.tags.join(', '), value => item.tags = parseTags(value), 'Tags'),
        createRemoveButton(() => {
          state.staging = state.staging.filter(entry => entry.id !== item.id);
          renderStaging();
        })
      );
      fragment.appendChild(row);
    });
    els.stagingList.appendChild(fragment);
    if (state.staging.length > 300) {
      const notice = document.createElement('p');
      notice.className = 'muted';
      notice.textContent = `Aperçu limité aux 300 premiers fichiers pour ne pas transformer ton téléphone en grille-pain. Les ${state.staging.length} fichiers seront bien importés.`;
      els.stagingList.appendChild(notice);
    }
  }

  function createInput(value, onInput, placeholder = '') {
    const input = document.createElement('input');
    input.value = value;
    input.placeholder = placeholder;
    input.addEventListener('input', () => onInput(input.value));
    return input;
  }

  function createSelect(value, options, onChange) {
    const select = document.createElement('select');
    options.forEach(optionValue => {
      const option = document.createElement('option');
      option.value = optionValue;
      option.textContent = optionValue === 'lui' ? 'Lui' : optionValue === 'elle' ? 'Elle' : optionValue === 'mixte' ? 'Mixte' : optionValue;
      select.appendChild(option);
    });
    select.value = value;
    select.addEventListener('change', () => onChange(select.value));
    return select;
  }

  function createRemoveButton(onClick) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'ghost-btn danger';
    button.textContent = 'Retirer';
    button.addEventListener('click', onClick);
    return button;
  }

  function clearStaging() {
    state.staging = [];
    els.fileInput.value = '';
    renderStaging();
  }

  async function saveStagedFiles() {
    if (!state.staging.length) return toast('Aucun fichier à importer. La vacuité, mais en plus cliquable.');
    els.importProgress.classList.remove('hidden');
    const bar = els.importProgress.querySelector('span');
    let saved = 0;

    for (const item of state.staging) {
      const now = new Date().toISOString();
      const meta = {
        id: item.id,
        title: item.title || item.file.name,
        fileName: item.file.name,
        mimeType: item.mimeType || item.file.type || inferMimeFromExtension(item.file.name),
        extension: item.extension || getExtension(item.file.name),
        size: item.file.size,
        target: item.target,
        level: item.level,
        tags: item.tags,
        note: item.note || '',
        done: false,
        kind: item.kind,
        createdAt: now,
        updatedAt: now,
        drawCount: 0,
        lastDrawnAt: null
      };
      await saveMediaWithBlob(meta, item.file);
      saved += 1;
      bar.style.width = `${Math.round(saved / state.staging.length * 100)}%`;
      if (saved % 25 === 0) await wait(0);
    }

    clearStaging();
    els.importProgress.classList.add('hidden');
    bar.style.width = '0%';
    await refreshData();
    toast(`${saved} média(s) importé(s).`);
    switchView('library-view');
  }

  function wait(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

  function saveMediaWithBlob(meta, blob) {
    return new Promise((resolve, reject) => {
      const transaction = tx(['media', 'files'], 'readwrite');
      transaction.objectStore('media').put(meta);
      transaction.objectStore('files').put({ id: meta.id, blob });
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error);
    });
  }

  function deleteMediaWithBlob(id) {
    return new Promise((resolve, reject) => {
      const transaction = tx(['media', 'files', 'draws'], 'readwrite');
      transaction.objectStore('media').delete(id);
      transaction.objectStore('files').delete(id);
      const drawStore = transaction.objectStore('draws');
      const index = drawStore.index('mediaId');
      const request = index.openCursor(IDBKeyRange.only(id));
      request.onsuccess = () => {
        const cursor = request.result;
        if (cursor) { cursor.delete(); cursor.continue(); }
      };
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error);
    });
  }

  function renderLibrary() {
    if (!state.unlocked) return;
    const query = els.searchInput.value.trim().toLowerCase();
    const target = els.filterTarget.value;
    const level = els.filterLevel.value;
    const done = els.filterDone.value;
    const type = els.filterType.value;
    const tagFilter = parseTags(els.filterTags.value);

    let rows = [...state.allMedia].filter(media => {
      const text = `${media.title} ${media.fileName} ${(media.tags || []).join(' ')}`.toLowerCase();
      if (query && !text.includes(query)) return false;
      if (target !== 'all' && media.target !== target) return false;
      if (level !== 'all' && Number(media.level) !== Number(level)) return false;
      if (done === 'done' && !media.done) return false;
      if (done === 'undone' && media.done) return false;
      if (type !== 'all' && getExtension(media.fileName) !== type && media.extension !== type) return false;
      if (tagFilter.length && !tagFilter.every(tag => (media.tags || []).includes(tag))) return false;
      return true;
    });

    rows.sort(sorter(els.sortMedia.value));
    state.filteredMedia = rows;
    const maxPage = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
    if (state.page > maxPage) state.page = maxPage;
    const start = (state.page - 1) * PAGE_SIZE;
    const pageRows = rows.slice(start, start + PAGE_SIZE);

    els.libraryCount.textContent = `${rows.length} média(s) trouvé(s) sur ${state.allMedia.length}.`;
    els.pageLabel.textContent = `Page ${state.page} / ${maxPage}`;
    els.prevPage.disabled = state.page <= 1;
    els.nextPage.disabled = state.page >= maxPage;
    els.mediaGrid.innerHTML = '';

    if (!pageRows.length) {
      els.mediaGrid.innerHTML = `<div class="muted">Aucun média ne correspond. Même le hasard demande un minimum de matière première.</div>`;
      return;
    }

    const fragment = document.createDocumentFragment();
    pageRows.forEach(media => fragment.appendChild(createMediaCard(media)));
    els.mediaGrid.appendChild(fragment);
  }

  function sorter(mode) {
    const map = {
      createdDesc: (a, b) => b.createdAt.localeCompare(a.createdAt),
      createdAsc: (a, b) => a.createdAt.localeCompare(b.createdAt),
      titleAsc: (a, b) => a.title.localeCompare(b.title, 'fr'),
      levelDesc: (a, b) => b.level - a.level,
      levelAsc: (a, b) => a.level - b.level,
      targetAsc: (a, b) => a.target.localeCompare(b.target, 'fr'),
      doneAsc: (a, b) => Number(a.done) - Number(b.done)
    };
    return map[mode] || map.createdDesc;
  }

  function createMediaCard(media) {
    const card = document.createElement('article');
    card.className = 'media-card';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'select-box';
    checkbox.checked = state.selectedIds.has(media.id);
    checkbox.addEventListener('change', () => {
      checkbox.checked ? state.selectedIds.add(media.id) : state.selectedIds.delete(media.id);
    });

    const thumb = document.createElement('div');
    thumb.className = 'media-thumb';
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) {
        renderMediaElement(media, thumb, { controls: false, autoplay: false, loading: 'lazy' });
        observer.disconnect();
      }
    }, { rootMargin: '220px' });
    observer.observe(thumb);

    const body = document.createElement('div');
    body.className = 'media-body';
    body.innerHTML = `
      <h3 title="${escapeHtml(media.title)}">${escapeHtml(media.title)}</h3>
      <div class="media-meta">
        <span>${formatTarget(media.target)}</span>
        <span>Niveau ${media.level}</span>
        <span>${media.done ? 'Fait' : 'Pas fait'}</span>
        <span>${typeLabel(media)}</span>
        <span>${bytes(media.size)}</span>
      </div>
      <div class="tag-list">${(media.tags || []).slice(0, 4).map(tag => `<span>${escapeHtml(tag)}</span>`).join('')}</div>
    `;
    const actions = document.createElement('div');
    actions.className = 'media-actions';
    actions.append(
      actionButton('Modifier', () => openEditDialog(media.id)),
      actionButton(media.done ? 'Pas fait' : 'Fait', () => updateMediaDone(media.id, !media.done)),
      actionButton('Supprimer', () => deleteMedia(media.id), 'danger')
    );
    body.appendChild(actions);
    card.append(checkbox, thumb, body);
    return card;
  }

  function actionButton(label, onClick, extraClass = '') {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `ghost-btn ${extraClass}`.trim();
    button.textContent = label;
    button.addEventListener('click', onClick);
    return button;
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[char]));
  }

  function changePage(delta) {
    const maxPage = Math.max(1, Math.ceil(state.filteredMedia.length / PAGE_SIZE));
    state.page = Math.min(maxPage, Math.max(1, state.page + delta));
    renderLibrary();
  }

  async function updateMediaDone(id, done) {
    const media = state.allMedia.find(item => item.id === id) || await getStoreValue('media', id);
    if (!media) return;
    media.done = done;
    media.updatedAt = new Date().toISOString();
    await putStoreValue('media', media);
    await refreshData();
    toast(done ? 'Marqué comme fait.' : 'Marqué comme pas fait.');
  }

  async function deleteMedia(id) {
    if (!confirm('Supprimer ce média et son fichier ?')) return;
    await deleteMediaWithBlob(id);
    state.selectedIds.delete(id);
    await refreshData();
    toast('Média supprimé.');
  }

  async function bulkUpdateDone(done) {
    const ids = Array.from(state.selectedIds);
    if (!ids.length) return toast('Sélectionne au moins un média. Oui, l’application ne lit pas encore les pensées.');
    for (const id of ids) {
      const media = await getStoreValue('media', id);
      if (media) {
        media.done = done;
        media.updatedAt = new Date().toISOString();
        await putStoreValue('media', media);
      }
    }
    state.selectedIds.clear();
    await refreshData();
    toast(`${ids.length} média(s) mis à jour.`);
  }

  async function bulkDelete() {
    const ids = Array.from(state.selectedIds);
    if (!ids.length) return toast('Aucune sélection.');
    if (!confirm(`Supprimer ${ids.length} média(s) ?`)) return;
    for (const id of ids) await deleteMediaWithBlob(id);
    state.selectedIds.clear();
    await refreshData();
    toast(`${ids.length} média(s) supprimé(s).`);
  }

  async function performDraw() {
    revokeObjectUrls();
    const candidates = getDrawCandidates();
    if (!candidates.length) {
      els.resultCard.classList.add('hidden');
      return toast('Aucun média compatible avec ces filtres. Le hasard est prêt, ton stock non.');
    }

    els.drawBtn.disabled = true;
    els.drawBtn.textContent = 'Tirage...';
    await wait(420);

    const selected = selectCandidate(candidates);
    const targetForDraw = resolveDrawTarget(selected);
    const now = new Date().toISOString();
    selected.drawCount = (selected.drawCount || 0) + 1;
    selected.lastDrawnAt = now;
    selected.updatedAt = now;
    await putStoreValue('media', selected);

    const draw = {
      id: cryptoRandomId(),
      mediaId: selected.id,
      drawnAt: now,
      target: targetForDraw,
      level: selected.level,
      markedDone: selected.done
    };
    await putStoreValue('draws', draw);
    state.currentResult = selected;
    state.currentDraw = draw;
    await refreshData();
    await showResult(selected, targetForDraw);

    els.drawBtn.disabled = false;
    els.drawBtn.textContent = 'Lancer le tirage';
  }

  function getDrawCandidates() {
    const levels = $$('#draw-levels input:checked').map(input => Number(input.value));
    const includeDone = els.includeDone.checked;
    const includeTags = parseTags(els.includeTags.value);
    const excludeTags = parseTags(els.excludeTags.value);
    const target = els.drawTarget.value;

    return state.allMedia.filter(media => {
      if (!levels.includes(Number(media.level))) return false;
      if (!includeDone && media.done) return false;
      const tags = media.tags || [];
      if (includeTags.length && !includeTags.every(tag => tags.includes(tag))) return false;
      if (excludeTags.length && excludeTags.some(tag => tags.includes(tag))) return false;
      if (target === 'all' || target === 'surprise') return true;
      if (target === 'mixte') return media.target === 'mixte';
      return media.target === target || media.target === 'mixte';
    });
  }

  function selectCandidate(candidates) {
    const mode = els.drawMode.value;
    if (mode === 'balanced') {
      const counts = state.history.reduce((acc, draw) => {
        acc[draw.target] = (acc[draw.target] || 0) + 1;
        return acc;
      }, { lui: 0, elle: 0, mixte: 0 });
      const preferred = counts.lui <= counts.elle ? 'lui' : 'elle';
      const filtered = candidates.filter(media => media.target === preferred || media.target === 'mixte');
      return randomItem(filtered.length ? filtered : candidates);
    }
    if (mode === 'level') {
      const weighted = [];
      candidates.forEach(media => {
        const weight = Math.max(1, Number(media.level));
        for (let i = 0; i < weight; i++) weighted.push(media);
      });
      return randomItem(weighted);
    }
    return randomItem(candidates);
  }

  function randomItem(array) {
    return array[Math.floor(Math.random() * array.length)];
  }

  function resolveDrawTarget(media) {
    const mode = els.drawTarget.value;
    if (mode === 'lui') return 'lui';
    if (mode === 'elle') return 'elle';
    if (mode === 'mixte') return 'mixte';
    if (mode === 'surprise') {
      if (media.target === 'mixte') return Math.random() > .5 ? 'lui' : 'elle';
      return media.target;
    }
    return media.target;
  }

  async function showResult(media, targetForDraw) {
    els.resultCard.classList.remove('hidden');
    els.resultTarget.textContent = formatResultTarget(targetForDraw);
    els.resultTitle.textContent = media.title;
    els.resultLevel.textContent = `Niveau ${media.level}`;
    els.resultNote.textContent = media.note || '';
    els.resultTags.innerHTML = (media.tags || []).map(tag => `<span>${escapeHtml(tag)}</span>`).join('');
    await renderMediaElement(media, els.resultMedia, { controls: true, autoplay: true, loading: 'eager' });
    els.resultCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  async function markCurrentResult(done) {
    if (!state.currentResult) return;
    const media = await getStoreValue('media', state.currentResult.id);
    if (media) {
      media.done = done;
      media.updatedAt = new Date().toISOString();
      await putStoreValue('media', media);
      state.currentResult = media;
    }
    if (state.currentDraw) {
      state.currentDraw.markedDone = done;
      await putStoreValue('draws', state.currentDraw);
    }
    await refreshData();
    toast(done ? 'Résultat marqué comme fait.' : 'Résultat marqué comme pas fait.');
  }

  async function openEditDialog(id) {
    const media = state.allMedia.find(item => item.id === id) || await getStoreValue('media', id);
    if (!media) return;
    els.editId.value = media.id;
    els.editTitle.value = media.title;
    els.editTarget.value = media.target;
    els.editLevel.value = String(media.level);
    els.editTags.value = (media.tags || []).join(', ');
    els.editNote.value = media.note || '';
    els.editDone.checked = !!media.done;
    els.editDialog.showModal();
  }

  async function saveEditDialog(event) {
    event.preventDefault();
    const id = els.editId.value;
    const media = await getStoreValue('media', id);
    if (!media) return;
    media.title = els.editTitle.value.trim() || media.fileName;
    media.target = els.editTarget.value;
    media.level = Number(els.editLevel.value);
    media.tags = parseTags(els.editTags.value);
    media.note = els.editNote.value.trim();
    media.done = els.editDone.checked;
    media.updatedAt = new Date().toISOString();
    await putStoreValue('media', media);
    els.editDialog.close();
    if (state.currentResult?.id === id) {
      state.currentResult = media;
      await showResult(media, state.currentDraw?.target || media.target);
    }
    await refreshData();
    toast('Média modifié.');
  }

  function renderHistory() {
    const byId = new Map(state.allMedia.map(media => [media.id, media]));
    const total = state.history.length;
    const done = state.history.filter(draw => draw.markedDone).length;
    const lui = state.history.filter(draw => draw.target === 'lui').length;
    const elle = state.history.filter(draw => draw.target === 'elle').length;
    const never = state.allMedia.filter(media => !media.drawCount).length;
    const levelMax = state.history.reduce((acc, draw) => Math.max(acc, draw.level || 0), 0);
    els.historyStats.innerHTML = [
      ['Tirages', total], ['Faits', done], ['Pas faits', total - done], ['Lui', lui], ['Elle', elle], ['Jamais tirés', never], ['Niveau max', levelMax]
    ].map(([label, value]) => `<div><strong>${value}</strong>${label}</div>`).join('');

    els.historyList.innerHTML = '';
    if (!state.history.length) {
      els.historyList.innerHTML = '<p class="muted">Aucun tirage pour le moment.</p>';
      return;
    }
    const fragment = document.createDocumentFragment();
    state.history.slice(0, 300).forEach(draw => {
      const media = byId.get(draw.mediaId);
      const item = document.createElement('article');
      item.className = 'history-item';
      const thumb = document.createElement('div');
      thumb.className = 'history-thumb';
      if (media) renderMediaElement(media, thumb, { controls: false, autoplay: false });
      else thumb.innerHTML = '<span class="muted">Suppr.</span>';
      const info = document.createElement('div');
      info.innerHTML = `
        <h3>${escapeHtml(media?.title || 'Média supprimé')}</h3>
        <p>${formatDate(draw.drawnAt)} · ${formatResultTarget(draw.target)} · Niveau ${draw.level} · ${draw.markedDone ? 'Fait' : 'Pas fait'}</p>
      `;
      const actions = document.createElement('div');
      actions.className = 'history-actions';
      if (media) actions.append(actionButton('Revoir', () => showHistoryItem(media, draw)));
      actions.append(
        actionButton(draw.markedDone ? 'Pas fait' : 'Fait', () => toggleDrawDone(draw)),
        actionButton('Supprimer', () => deleteDraw(draw.id), 'danger')
      );
      item.append(thumb, info, actions);
      fragment.appendChild(item);
    });
    els.historyList.appendChild(fragment);
  }

  async function showHistoryItem(media, draw) {
    switchView('draw-view');
    state.currentResult = media;
    state.currentDraw = draw;
    await showResult(media, draw.target);
  }

  async function toggleDrawDone(draw) {
    draw.markedDone = !draw.markedDone;
    await putStoreValue('draws', draw);
    await refreshData();
  }

  async function deleteDraw(id) {
    await deleteStoreValue('draws', id);
    await refreshData();
    toast('Entrée d’historique supprimée.');
  }

  async function clearHistory() {
    if (!confirm('Vider tout l’historique ?')) return;
    await clearStore('draws');
    await refreshData();
    toast('Historique vidé.');
  }

  function clearStore(storeName) {
    return new Promise((resolve, reject) => {
      const transaction = tx(storeName, 'readwrite');
      transaction.objectStore(storeName).clear();
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error);
    });
  }

  function toggleTimer() {
    if (state.timer.running) pauseTimer();
    else startTimer();
  }

  function startTimer() {
    state.timer.running = true;
    state.timer.startedAt = Date.now();
    els.timerToggle.textContent = 'Pause';
    clearInterval(state.timer.interval);
    state.timer.interval = setInterval(updateTimerDisplay, 100);
    saveTimerState();
  }

  function pauseTimer() {
    state.timer.elapsed = getTimerElapsed();
    state.timer.running = false;
    state.timer.startedAt = null;
    els.timerToggle.textContent = 'Reprendre';
    clearInterval(state.timer.interval);
    saveTimerState();
    updateTimerDisplay();
  }

  function resetTimer() {
    state.timer.running = false;
    state.timer.startedAt = null;
    state.timer.elapsed = 0;
    state.timer.laps = [];
    clearInterval(state.timer.interval);
    els.timerToggle.textContent = 'Démarrer';
    saveTimerState();
    updateTimerDisplay();
    renderLaps();
  }

  function addLap() {
    const elapsed = getTimerElapsed();
    state.timer.laps.unshift(elapsed);
    state.timer.laps = state.timer.laps.slice(0, 20);
    saveTimerState();
    renderLaps();
  }

  function getTimerElapsed() {
    return state.timer.elapsed + (state.timer.running && state.timer.startedAt ? Date.now() - state.timer.startedAt : 0);
  }

  function updateTimerDisplay() {
    els.timerDisplay.textContent = formatDuration(getTimerElapsed());
  }

  function formatDuration(ms) {
    const totalTenths = Math.floor(ms / 100);
    const tenths = totalTenths % 10;
    const totalSeconds = Math.floor(totalTenths / 10);
    const seconds = totalSeconds % 60;
    const minutes = Math.floor(totalSeconds / 60);
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${tenths}`;
  }

  function saveTimerState() {
    localStorage.setItem('drd_timer', JSON.stringify({
      running: state.timer.running,
      startedAt: state.timer.startedAt,
      elapsed: state.timer.elapsed,
      laps: state.timer.laps
    }));
  }

  function restoreTimer() {
    try {
      const saved = JSON.parse(localStorage.getItem('drd_timer') || '{}');
      state.timer.running = !!saved.running;
      state.timer.startedAt = saved.startedAt || (saved.running ? Date.now() : null);
      state.timer.elapsed = Number(saved.elapsed || 0);
      state.timer.laps = Array.isArray(saved.laps) ? saved.laps : [];
      if (state.timer.running) {
        els.timerToggle.textContent = 'Pause';
        state.timer.interval = setInterval(updateTimerDisplay, 100);
      }
      renderLaps();
    } catch { resetTimer(); }
  }

  function renderLaps() {
    els.lapList.innerHTML = state.timer.laps.map((lap, index) => `<li><span>Tour ${state.timer.laps.length - index}</span><strong>${formatDuration(lap)}</strong></li>`).join('');
  }

  function loadDeezerWidget() {
    const url = els.deezerUrl.value.trim();
    if (!url) return toast('Colle un lien Deezer.');
    const parsed = parseDeezerUrl(url);
    if (!parsed) {
      els.deezerPlayer.innerHTML = `<a class="primary-btn" href="${escapeHtml(url)}" target="_blank" rel="noopener">Ouvrir dans Deezer</a>`;
      return toast('Lien Deezer non reconnu, bouton externe ajouté.');
    }
    const src = `https://widget.deezer.com/widget/dark/${parsed.type}/${parsed.id}`;
    els.deezerPlayer.innerHTML = `
      <iframe title="Lecteur Deezer" src="${src}" allowtransparency="true" allow="encrypted-media; clipboard-write"></iframe>
      <p><a class="ghost-btn" href="${escapeHtml(url)}" target="_blank" rel="noopener">Ouvrir dans Deezer</a></p>
    `;
    localStorage.setItem('drd_deezer_url', url);
  }

  function parseDeezerUrl(url) {
    try {
      const parsed = new URL(url);
      const parts = parsed.pathname.split('/').filter(Boolean);
      const types = ['track', 'album', 'playlist', 'artist'];
      for (let i = 0; i < parts.length; i++) {
        if (types.includes(parts[i]) && /^\d+$/.test(parts[i + 1] || '')) return { type: parts[i], id: parts[i + 1] };
      }
      return null;
    } catch { return null; }
  }

  function loadLocalAudio(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const url = createUrl(file);
    els.localAudio.src = url;
    els.localAudio.loop = els.audioLoop.checked;
    els.localAudio.play().catch(() => {});
  }

  async function loadTheme() {
    const theme = await getSetting('theme', 'dark-romance');
    const animations = await getSetting('animations', true);
    document.documentElement.dataset.theme = theme;
    document.body.classList.toggle('no-motion', !animations);
    if (els.themeSelect) els.themeSelect.value = theme;
    if (els.animationsToggle) els.animationsToggle.checked = !!animations;
    const dz = localStorage.getItem('drd_deezer_url');
    if (dz) els.deezerUrl.value = dz;
  }

  async function saveTheme() {
    const theme = els.themeSelect.value;
    await setSetting('theme', theme);
    document.documentElement.dataset.theme = theme;
  }

  async function saveMotionPreference() {
    const enabled = els.animationsToggle.checked;
    await setSetting('animations', enabled);
    document.body.classList.toggle('no-motion', !enabled);
  }

  async function changePin() {
    const oldPin = els.oldPin.value.trim();
    const newPin = els.newPin.value.trim();
    if (!/^\d{4}$/.test(oldPin) || !/^\d{4}$/.test(newPin)) return toast('Les deux PIN doivent faire 4 chiffres.');
    const salt = await getSetting('pinSalt');
    const hash = await getSetting('pinHash');
    if (await hashPin(oldPin, salt) !== hash) return toast('Ancien PIN incorrect.');
    const newSalt = cryptoRandomId();
    await setSetting('pinSalt', newSalt);
    await setSetting('pinHash', await hashPin(newPin, newSalt));
    els.oldPin.value = '';
    els.newPin.value = '';
    toast('PIN changé.');
  }

  async function exportBackup(includeFiles) {
    const media = await getAll('media');
    const draws = await getAll('draws');
    const theme = await getSetting('theme', 'dark-romance');
    const animations = await getSetting('animations', true);
    const backup = {
      app: 'Dark Romance Draw',
      version: 1,
      exportedAt: new Date().toISOString(),
      includeFiles,
      settings: { theme, animations },
      media,
      draws,
      files: []
    };

    if (includeFiles) {
      toast('Export complet en préparation. Sur 1000 gros fichiers, ça peut peser lourd, quelle révélation.');
      for (const item of media) {
        const row = await getStoreValue('files', item.id);
        if (row?.blob) backup.files.push({ id: item.id, dataUrl: await blobToDataUrl(row.blob) });
      }
    }

    const blob = new Blob([JSON.stringify(backup)], { type: 'application/json' });
    downloadBlob(blob, `dark-romance-draw-${includeFiles ? 'complet' : 'leger'}-${Date.now()}.json`);
  }

  function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  async function dataUrlToBlob(dataUrl) {
    const response = await fetch(dataUrl);
    return response.blob();
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 500);
  }

  async function importBackup(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const backup = JSON.parse(text);
      if (!backup || backup.app !== 'Dark Romance Draw' || !Array.isArray(backup.media)) throw new Error('Format invalide');
      const ok = confirm(`Importer ${backup.media.length} média(s) et ${backup.draws?.length || 0} tirage(s) ? Les doublons par ID seront remplacés.`);
      if (!ok) return;
      for (const media of backup.media) await putStoreValue('media', media);
      if (Array.isArray(backup.draws)) for (const draw of backup.draws) await putStoreValue('draws', draw);
      if (Array.isArray(backup.files)) {
        for (const fileRow of backup.files) {
          const blob = await dataUrlToBlob(fileRow.dataUrl);
          await putStoreValue('files', { id: fileRow.id, blob });
        }
      }
      if (backup.settings?.theme) await setSetting('theme', backup.settings.theme);
      if (typeof backup.settings?.animations === 'boolean') await setSetting('animations', backup.settings.animations);
      await loadTheme();
      await refreshData();
      toast('Sauvegarde importée.');
    } catch (error) {
      console.error(error);
      toast('Sauvegarde invalide ou impossible à importer.');
    } finally {
      els.backupInput.value = '';
    }
  }

  async function resetStatuses() {
    if (!confirm('Remettre tous les médias en “pas fait” ?')) return;
    for (const media of state.allMedia) {
      media.done = false;
      media.updatedAt = new Date().toISOString();
      await putStoreValue('media', media);
    }
    await refreshData();
    toast('Tous les statuts ont été réinitialisés.');
  }

  async function deleteAllData() {
    if (!confirm('Tout supprimer : médias, fichiers, historique et paramètres sauf PIN ?')) return;
    await clearStore('media');
    await clearStore('files');
    await clearStore('draws');
    await refreshData();
    toast('Données supprimées.');
  }

  async function resetEverythingFromLock() {
    const ok = confirm('Réinitialisation totale : code PIN, médias, fichiers, historique et paramètres seront supprimés. Continuer ?');
    if (!ok) return;
    await clearStore('settings');
    await clearStore('media');
    await clearStore('files');
    await clearStore('draws');
    localStorage.removeItem('drd_timer');
    localStorage.removeItem('drd_deezer_url');
    toast('Application réinitialisée.');
    await checkPinState();
  }

  async function updateStorageInfo() {
    if (!navigator.storage?.estimate) {
      els.storageInfo.innerHTML = '<div>Stockage navigateur non estimable.</div>';
      return;
    }
    const estimate = await navigator.storage.estimate();
    els.storageInfo.innerHTML = `
      <div><strong>${bytes(estimate.usage || 0)}</strong>utilisés</div>
      <div><strong>${bytes(estimate.quota || 0)}</strong>quota estimé</div>
      <div><strong>${state.allMedia.length}</strong>médias stockés</div>
    `;
  }
})();
