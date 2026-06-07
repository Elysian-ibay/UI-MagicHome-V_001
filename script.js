/*
 * ============================================================
 *  ✦ ELYSIAN MAGIC HOME ✦ — V0.0.1
 *  Frontend Logic (API Communication & UI Updates)
 * ============================================================
 *  QA Fixes applied:
 *   - DOM queries moved inside DOMContentLoaded (safe init)
 *   - stopPolling() called before startPolling() to prevent stacking
 *   - Null-safe DOM access with optional chaining
 *   - Ambient ring visualizer synced with state
 *   - Particle background generator
 *   - ESP badge live status in header
 * ============================================================
 */

// ==================== KONFIGURASI ====================
// URL Backend Vercel — ISI INI setelah deploy backend ke Vercel!
// Contoh: 'https://backend-magic-home-v001.vercel.app'
const VERCEL_BACKEND_URL = 'https://backend-magic-home-v001.vercel.app';

// Auto-detect: jika localhost → relative URL, jika deployed → pakai Vercel URL
const isLocalhost = ['localhost', '127.0.0.1'].includes(window.location.hostname);
const API_BASE = isLocalhost ? '' : VERCEL_BACKEND_URL;
const API_KEY  = 'SECRET_IOT_123';

// Interval polling status (ms)
const POLL_INTERVAL = 2000;

// ==================== STATE ====================
let currentState = {
  power: false,
  color: 0,
  espConnected: false,
  lastUpdate: null
};
let isRequestPending = false;   // Prevent double-click
let pollTimer = null;           // setInterval reference
let serverOnline = false;       // Track if backend is reachable

// ==================== COLOR CONFIG ====================
const COLOR_LABELS  = ['Warna 1', 'Warna 2', 'Warna 1 + 2'];
const COLOR_CLASSES = ['color-0', 'color-1', 'color-2'];

// ==================== DOM REFERENCES ====================
// Initialized in init() after DOMContentLoaded to guarantee elements exist
let dom = {};

/**
 * Initialize all DOM references safely after page load
 */
function initDOM() {
  dom = {
    btnPower:       document.getElementById('btnPower'),
    btnColor:       document.getElementById('btnColor'),
    powerLabel:     document.getElementById('powerLabel'),
    colorLabel:     document.getElementById('colorLabel'),
    espStatusText:  document.getElementById('espStatusText'),
    lampStatusText: document.getElementById('lampStatusText'),
    activeColorText:document.getElementById('activeColorText'),
    lastUpdate:     document.getElementById('lastUpdate'),
    btnSchedule:    document.getElementById('btnSchedule'),
    scheduleLabel:  document.getElementById('scheduleLabel'),
    statusItemSchedule: document.getElementById('statusItemSchedule'),
    scheduleInfo:   document.getElementById('scheduleInfo'),
    espBadge:       document.getElementById('espBadge'),
    ambientRing:    document.getElementById('ambientRing'),
    colorIndicator: document.getElementById('colorIndicator'),
    serverIndicator:document.getElementById('serverIndicator'),
    toastContainer: document.getElementById('toastContainer'),
    particles:      document.getElementById('particles'),

    // Queried elements (could be null if HTML changes)
    espStatusDot:   document.querySelector('#espStatus .status-dot'),
    lampStatusDot:  document.querySelector('#lampStatus .status-dot'),
    serverDot:      null  // will be set after serverIndicator is found
  };

  // Get the server indicator dot
  if (dom.serverIndicator) {
    dom.serverDot = dom.serverIndicator.querySelector('.status-dot');
  }
}

// ==================== API FUNCTIONS ====================

/**
 * Fetch status dari Backend (GET /api/status)
 * Dipanggil secara berkala (polling)
 */
async function fetchStatus() {
  try {
    const response = await fetch(`${API_BASE}/api/status`, {
      method: 'GET',
      headers: { 'x-api-key': API_KEY }
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const result = await response.json();

    if (result.success && result.data) {
      setServerOnline(true);
      updateUI(result.data);
    }
  } catch (error) {
    console.error('[POLL] Error:', error.message);
    setServerOnline(false);
    setOfflineUI();
  }
}

/**
 * Kirim perintah kontrol ke Backend (POST /api/control)
 * @param {string} action - "toggle" atau "color"
 */
async function sendControl(action) {
  if (isRequestPending) return;  // Cegah double-click

  isRequestPending = true;

  // Tambah loading state pada tombol yang ditekan
  const targetBtn = action === 'toggle' ? dom.btnPower : dom.btnColor;
  if (targetBtn) targetBtn.classList.add('is-loading');

  try {
    const response = await fetch(`${API_BASE}/api/control`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': API_KEY
      },
      body: JSON.stringify({ action })
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const result = await response.json();

    if (result.success && result.data) {
      updateUI(result.data);
    } else {
      showToast(result.error || 'Gagal mengubah status', 'error');
    }
  } catch (error) {
    console.error('[CONTROL] Error:', error.message);
    showToast('Koneksi terputus', 'error');
  } finally {
    isRequestPending = false;
    if (targetBtn) targetBtn.classList.remove('is-loading');
  }
}

/**
 * Kirim jadwal ke Backend (POST /api/schedule)
 */
async function sendSchedule(onTime, offTime) {
  try {
    const response = await fetch(`${API_BASE}/api/schedule`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': API_KEY
      },
      body: JSON.stringify({ 
        on_time: onTime, 
        off_time: offTime, 
        timezone_offset: new Date().getTimezoneOffset()
      })
    });

    const result = await response.json();
    if (result.success) {
      showToast(result.message, 'success');
      if (result.data) updateUI(result.data);
    } else {
      showToast(result.error || 'Gagal mengatur jadwal', 'error');
    }
  } catch (error) {
    showToast('Koneksi terputus', 'error');
  }
}

// ==================== UI UPDATE FUNCTIONS ====================

/**
 * Update seluruh UI berdasarkan data dari server
 * @param {Object} data - State data dari API response
 */
function updateUI(data) {
  currentState = {
    power: data.power,
    color: data.color,
    espConnected: data.espConnected,
    lastUpdate: data.lastUpdate
  };

  const colorIndex = Math.min(Math.max(data.color || 0, 0), 2);

  // === Power Button State ===
  if (dom.btnPower) {
    if (data.power) {
      dom.btnPower.classList.add('is-on');
    } else {
      dom.btnPower.classList.remove('is-on');
    }
  }

  if (dom.powerLabel) {
    dom.powerLabel.textContent = data.power ? 'POWER ON' : 'POWER OFF';
    dom.powerLabel.style.color = data.power ? 'var(--neon-cyan)' : '';
  }

  if (dom.lampStatusText) {
    dom.lampStatusText.textContent = data.power ? 'ON' : 'OFF';
  }

  if (dom.lampStatusDot) {
    dom.lampStatusDot.className = data.power
      ? 'status-dot status-dot--online'
      : 'status-dot status-dot--offline';
  }

  // === Color Button State ===
  if (dom.btnColor) {
    COLOR_CLASSES.forEach(cls => dom.btnColor.classList.remove(cls));
    dom.btnColor.classList.add(COLOR_CLASSES[colorIndex]);
  }

  if (dom.colorLabel) {
    dom.colorLabel.textContent = COLOR_LABELS[colorIndex];
  }

  if (dom.activeColorText) {
    dom.activeColorText.textContent = COLOR_LABELS[colorIndex];
  }

  // === Color Indicator ===
  if (dom.colorIndicator) {
    COLOR_CLASSES.forEach(cls => dom.colorIndicator.classList.remove(cls));
    dom.colorIndicator.classList.add(COLOR_CLASSES[colorIndex]);
  }

  // === ESP32 Connection Status ===
  if (dom.espStatusText) {
    dom.espStatusText.textContent = data.espConnected ? 'Online' : 'Offline';
  }

  if (dom.espStatusDot) {
    dom.espStatusDot.className = data.espConnected
      ? 'status-dot status-dot--online'
      : 'status-dot status-dot--offline';
  }

  // === ESP Badge in Header ===
  if (dom.espBadge) {
    if (data.espConnected) {
      dom.espBadge.classList.add('is-online');
    } else {
      dom.espBadge.classList.remove('is-online');
    }
  }

  // === Ambient Light Ring ===
  updateAmbientRing(data.power, colorIndex);

  // === Timestamp ===
  if (dom.lastUpdate) {
    dom.lastUpdate.textContent = data.lastUpdate
      ? formatTimestamp(new Date(data.lastUpdate))
      : '—';
  }

  // === Schedule Info ===
  if (dom.statusItemSchedule && dom.scheduleInfo) {
    if (data.schedule) {
      dom.statusItemSchedule.style.display = 'flex';
      let info = [];
      if (data.schedule.on_time) info.push(`ON: ${data.schedule.on_time}`);
      if (data.schedule.off_time) info.push(`OFF: ${data.schedule.off_time}`);
      dom.scheduleInfo.textContent = info.join(' | ');
      currentState.schedule = data.schedule;
    } else {
      dom.statusItemSchedule.style.display = 'none';
      currentState.schedule = null;
    }
  }
}

/**
 * Update ambient ring visualizer berdasarkan power & color state
 */
function updateAmbientRing(power, colorIndex) {
  if (!dom.ambientRing) return;

  // Remove all state classes
  dom.ambientRing.classList.remove('is-on', 'color-0', 'color-1', 'color-2');

  if (power) {
    dom.ambientRing.classList.add('is-on');
    dom.ambientRing.classList.add(COLOR_CLASSES[colorIndex]);
  }
}

/**
 * Update server connection indicator
 */
function setServerOnline(online) {
  serverOnline = online;
  if (dom.serverDot) {
    dom.serverDot.className = online
      ? 'status-dot status-dot--online'
      : 'status-dot status-dot--offline';
  }
}

/**
 * Set UI ke state offline (ketika backend tidak bisa dihubungi)
 */
function setOfflineUI() {
  if (dom.espStatusText)  dom.espStatusText.textContent = 'Offline';
  if (dom.espStatusDot)   dom.espStatusDot.className = 'status-dot status-dot--offline';
  if (dom.lampStatusText) dom.lampStatusText.textContent = 'N/A';
  if (dom.lampStatusDot)  dom.lampStatusDot.className = 'status-dot status-dot--offline';
  if (dom.lastUpdate)     dom.lastUpdate.textContent = 'Server tidak terhubung';

  if (dom.espBadge)       dom.espBadge.classList.remove('is-online');
}

/**
 * Format timestamp ke format lokal yang readable
 * @param {Date} date
 * @returns {string}
 */
function formatTimestamp(date) {
  if (isNaN(date.getTime())) return '—';

  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

// ==================== TOAST NOTIFICATION ====================

/**
 * Tampilkan toast notification
 * @param {string} message - Pesan yang ditampilkan
 * @param {string} type - "success" atau "error"
 */
function showToast(message, type = 'success') {
  const container = dom.toastContainer;
  if (!container) return;

  // Buat toast baru
  const toast = document.createElement('div');
  toast.className = `toast toast--${type}`;
  toast.textContent = message;
  container.appendChild(toast);

  // Trigger entrance animation (next frame agar transition berjalan)
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      toast.classList.add('show');
    });
  });

  // Auto-hide setelah 2.5 detik
  setTimeout(() => {
    toast.classList.remove('show');
    // Hapus element setelah transition selesai
    setTimeout(() => {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, 350);
  }, 2500);
}

// ==================== PARTICLE GENERATOR ====================

function createParticles() {
  if (!dom.particles) return;
  dom.particles.innerHTML = '';
  
  const colors = ['var(--neon-cyan)', 'var(--neon-magenta)', 'var(--neon-amber)'];
  const count = 15;
  
  for (let i = 0; i < count; i++) {
    const p = document.createElement('div');
    p.className = 'particle';
    
    // Randomize
    const size = Math.random() * 4 + 2;
    const x = Math.random() * 100;
    const y = Math.random() * 100;
    const duration = Math.random() * 20 + 10;
    const delay = Math.random() * 5;
    const color = colors[Math.floor(Math.random() * colors.length)];
    
    p.style.width = `${size}px`;
    p.style.height = `${size}px`;
    p.style.left = `${x}%`;
    p.style.top = `${y}%`;
    p.style.backgroundColor = color;
    p.style.boxShadow = `0 0 ${size * 2}px ${color}`;
    p.style.animationDuration = `${duration}s`;
    p.style.animationDelay = `${delay}s`;
    
    dom.particles.appendChild(p);
  }
}

// ==================== EVENT HANDLERS ====================

function handleScheduleClick() {
  if (!serverOnline) {
    showToast('Server offline', 'error');
    return;
  }
  
  const onTime = prompt('Jam berapa lampu NYALA otomatis?\nFormat: HH:MM (contoh: 18:00)\nKosongkan jika tidak perlu.', currentState.schedule?.on_time || '');
  if (onTime === null) return; // Cancelled

  const offTime = prompt('Jam berapa lampu MATI otomatis?\nFormat: HH:MM (contoh: 06:00)\nKosongkan jika tidak perlu.', currentState.schedule?.off_time || '');
  if (offTime === null) return; // Cancelled
  
  if (onTime === '' && offTime === '') {
    sendSchedule(null, null);
    return;
  }

  const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
  if (onTime && !timeRegex.test(onTime)) return alert('Format waktu NYALA salah. Gunakan HH:MM (contoh: 18:00)');
  if (offTime && !timeRegex.test(offTime)) return alert('Format waktu MATI salah. Gunakan HH:MM (contoh: 06:00)');

  sendSchedule(onTime, offTime);
}

// ==================== POLLING ====================

/**
 * Mulai polling status dari server
 * FIX: Selalu clear timer yang ada sebelum membuat baru
 *      untuk mencegah interval stacking
 */
function startPolling() {
  // Clear existing timer dulu (prevent stacking!)
  stopPolling();

  // Fetch status pertama kali
  fetchStatus();

  // Polling berkala
  pollTimer = setInterval(fetchStatus, POLL_INTERVAL);
}

/**
 * Hentikan polling
 */
function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

// ==================== INITIALIZATION ====================

document.addEventListener('DOMContentLoaded', () => {
  console.log('╔════════════════════════════════════╗');
  console.log('║  ✦ ELYSIAN MAGIC HOME ✦ — V0.0.1  ║');
  console.log('╚════════════════════════════════════╝');
  console.log(`[INIT] API Base: ${API_BASE}`);

  // Initialize DOM references (safe — all elements exist now)
  initDOM();

  // Attach event listeners (instead of inline onclick)
  if (dom.btnPower) {
    dom.btnPower.addEventListener('click', () => sendControl('toggle'));
  }
  if (dom.btnColor) {
    dom.btnColor.addEventListener('click', () => sendControl('color'));
  }
  
  if (dom.btnSchedule) {
    dom.btnSchedule.addEventListener('click', handleScheduleClick);
  }

  // Generate background particles
  createParticles();

  // Handle visibility API (pause polling saat tab hidden)
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      stopPolling();
    } else {
      // Langsung fetch sekali saat user kembali ke tab, lalu lanjut polling
      fetchStatus();
      startPolling();
    }
  });

  // Init PWA Service Worker
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(err => {
        console.log('[PWA] SW registration failed:', err);
      });
    });
  }

  // Initial fetch
  fetchStatus();
  // Start polling
  startPolling();
});

// Hentikan polling saat halaman ditutup
window.addEventListener('beforeunload', () => {
  stopPolling();
});
