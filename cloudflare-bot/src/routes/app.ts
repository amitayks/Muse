/**
 * WebApp route — serves the Telegram Mini App prompt editor HTML page.
 * No X-Frame-Options header so Telegram can load it in an iframe.
 */

export function handlePromptEditorPage(): Response {
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
<title>System Prompts</title>
<script src="https://telegram.org/js/telegram-web-app.js"></script>
<style>
  :root {
    --bg: var(--tg-theme-bg-color, #ffffff);
    --text: var(--tg-theme-text-color, #000000);
    --hint: var(--tg-theme-hint-color, #999999);
    --link: var(--tg-theme-link-color, #2481cc);
    --btn: var(--tg-theme-button-color, #2481cc);
    --btn-text: var(--tg-theme-button-text-color, #ffffff);
    --secondary-bg: var(--tg-theme-secondary-bg-color, #f0f0f0);
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    background: var(--bg);
    color: var(--text);
    padding: 16px;
    min-height: 100vh;
  }
  h1 { font-size: 20px; margin-bottom: 16px; }

  .tabs {
    display: flex; gap: 0; margin-bottom: 12px;
    border-radius: 10px; overflow: hidden;
    background: var(--secondary-bg);
  }
  .tab {
    flex: 1; padding: 10px 0; text-align: center;
    font-size: 14px; font-weight: 500;
    cursor: pointer; border: none; background: transparent;
    color: var(--hint); transition: all 0.2s;
  }
  .tab.active {
    background: var(--btn); color: var(--btn-text);
  }

  .badge {
    display: inline-block; padding: 3px 10px; border-radius: 12px;
    font-size: 12px; font-weight: 600; margin-bottom: 10px;
  }
  .badge.custom { background: #34c75922; color: #34c759; }
  .badge.default { background: var(--secondary-bg); color: var(--hint); }

  .stale-banner {
    background: #ff9f0a22; border: 1px solid #ff9f0a55;
    border-radius: 10px; padding: 12px; margin-bottom: 12px;
    display: none;
  }
  .stale-banner .stale-text {
    font-size: 13px; font-weight: 600; margin-bottom: 8px; color: #ff9f0a;
  }
  .stale-banner .stale-actions {
    display: flex; gap: 8px; flex-wrap: wrap;
  }
  .stale-banner .stale-btn {
    padding: 6px 12px; border-radius: 8px; font-size: 12px;
    font-weight: 600; cursor: pointer; border: none;
  }
  .stale-btn.view-default { background: var(--secondary-bg); color: var(--text); }
  .stale-btn.update-new { background: var(--btn); color: var(--btn-text); }
  .stale-btn.keep-mine { background: transparent; color: var(--hint); border: 1px solid var(--hint); }

  .default-overlay {
    display: none; background: var(--secondary-bg); border-radius: 10px;
    padding: 12px; margin-bottom: 12px; max-height: 200px; overflow-y: auto;
    font-size: 13px; line-height: 1.5; white-space: pre-wrap;
    border: 1px solid var(--hint);
  }
  .default-overlay-header {
    display: none; font-size: 12px; font-weight: 600;
    color: var(--hint); margin-bottom: 6px;
  }

  textarea {
    width: 100%; min-height: 200px; padding: 12px;
    border: 1px solid var(--hint); border-radius: 10px;
    background: var(--secondary-bg); color: var(--text);
    font-family: inherit; font-size: 14px; line-height: 1.5;
    resize: none; outline: none;
  }
  textarea:focus { border-color: var(--btn); }

  .actions {
    display: flex; gap: 10px; margin-top: 14px;
    justify-content: space-between;
  }
  .btn {
    padding: 10px 20px; border-radius: 10px;
    font-size: 14px; font-weight: 600; cursor: pointer;
    border: none; transition: opacity 0.2s;
  }
  .btn:disabled { opacity: 0.5; cursor: not-allowed; }
  .btn-primary { background: var(--btn); color: var(--btn-text); }
  .btn-secondary { background: var(--secondary-bg); color: var(--text); }

  .status {
    margin-top: 10px; font-size: 13px; min-height: 20px;
    text-align: center;
  }
  .status.success { color: #34c759; }
  .status.error { color: #ff3b30; }
  .status.loading { color: var(--hint); }

  .blocked {
    display: flex; flex-direction: column; align-items: center;
    justify-content: center; min-height: 60vh; text-align: center;
    color: var(--hint); gap: 12px;
  }
  .blocked-icon { font-size: 48px; }
</style>
</head>
<body>
<div id="app">
  <div class="blocked" id="blocked" style="display:none;">
    <div class="blocked-icon">🔒</div>
    <div>Please open this from the bot settings in Telegram</div>
  </div>

  <div id="editor" style="display:none;">
    <h1>📝 System Prompts</h1>
    <div class="tabs">
      <button class="tab active" data-type="content">Content</button>
      <button class="tab" data-type="edit">Edit</button>
      <button class="tab" data-type="repost">Repost</button>
    </div>
    <div><span class="badge default" id="badge">Default</span></div>
    <div class="stale-banner" id="staleBanner">
      <div class="stale-text">⚠️ New default available</div>
      <div class="stale-actions">
        <button class="stale-btn view-default" id="viewDefaultBtn">View Default</button>
        <button class="stale-btn update-new" id="updateNewBtn">Update to New</button>
        <button class="stale-btn keep-mine" id="keepMineBtn">Keep Mine</button>
      </div>
    </div>
    <div class="default-overlay-header" id="defaultOverlayHeader">Current Default:</div>
    <div class="default-overlay" id="defaultOverlay"></div>
    <textarea id="textarea" placeholder="Loading..."></textarea>
    <div class="actions">
      <button class="btn btn-secondary" id="resetBtn">Reset to Default</button>
      <button class="btn btn-primary" id="saveBtn">Save</button>
    </div>
    <div class="status" id="status"></div>
  </div>
</div>

<script>
(function() {
  // Detect Telegram WebApp
  var tg = window.Telegram && window.Telegram.WebApp;
  if (!tg || !tg.initData) {
    document.getElementById('blocked').style.display = 'flex';
    return;
  }

  tg.ready();
  tg.expand();

  document.getElementById('editor').style.display = 'block';

  var textarea = document.getElementById('textarea');
  var badge = document.getElementById('badge');
  var status = document.getElementById('status');
  var saveBtn = document.getElementById('saveBtn');
  var resetBtn = document.getElementById('resetBtn');
  var staleBanner = document.getElementById('staleBanner');
  var viewDefaultBtn = document.getElementById('viewDefaultBtn');
  var updateNewBtn = document.getElementById('updateNewBtn');
  var keepMineBtn = document.getElementById('keepMineBtn');
  var defaultOverlay = document.getElementById('defaultOverlay');
  var defaultOverlayHeader = document.getElementById('defaultOverlayHeader');
  var tabs = document.querySelectorAll('.tab');
  var currentType = 'content';
  var currentIsStale = false;
  var userLang = null;
  var apiBase = location.origin;

  function autoResize() {
    textarea.style.height = 'auto';
    textarea.style.height = textarea.scrollHeight + 'px';
  }
  textarea.addEventListener('input', autoResize);

  function setStatus(text, cls) {
    status.textContent = text;
    status.className = 'status' + (cls ? ' ' + cls : '');
    if (cls === 'success') {
      setTimeout(function() { status.textContent = ''; status.className = 'status'; }, 2500);
    }
  }

  function setBadge(isCustom) {
    badge.textContent = isCustom ? 'Custom' : 'Default';
    badge.className = 'badge ' + (isCustom ? 'custom' : 'default');
  }

  function showStaleBanner(show) {
    staleBanner.style.display = show ? 'block' : 'none';
    currentIsStale = show;
    if (!show) {
      defaultOverlay.style.display = 'none';
      defaultOverlayHeader.style.display = 'none';
    }
  }

  function authHeaders() {
    return { 'Authorization': 'tma ' + tg.initData, 'Content-Type': 'application/json' };
  }

  async function loadPrompt(type) {
    currentType = type;
    textarea.value = '';
    textarea.placeholder = 'Loading...';
    setStatus('Loading...', 'loading');
    saveBtn.disabled = true;
    resetBtn.disabled = true;
    showStaleBanner(false);

    try {
      var lang = userLang || 'en';
      var res = await fetch(apiBase + '/api/prompt?type=' + type + '&lang=' + lang, {
        headers: authHeaders()
      });
      if (!res.ok) throw new Error('Failed to load');
      var data = await res.json();
      textarea.value = data.content || '';
      setBadge(data.isCustom);
      if (data.isCustom && data.isStale) {
        showStaleBanner(true);
      }
      textarea.placeholder = 'Enter your prompt...';
      setStatus('', '');
      autoResize();
    } catch (e) {
      setStatus('Failed to load prompt', 'error');
      textarea.placeholder = 'Error loading prompt';
    }
    saveBtn.disabled = false;
    resetBtn.disabled = false;
  }

  // View Default — fetch and show default prompt in overlay
  viewDefaultBtn.addEventListener('click', async function() {
    var lang = userLang || 'en';
    try {
      var res = await fetch(apiBase + '/api/prompt?type=' + currentType + '&lang=' + lang + '&default=true', {
        headers: authHeaders()
      });
      if (!res.ok) throw new Error('Failed to load default');
      var data = await res.json();
      defaultOverlay.textContent = data.content || '';
      defaultOverlay.style.display = 'block';
      defaultOverlayHeader.style.display = 'block';
    } catch (e) {
      setStatus('Failed to load default', 'error');
    }
  });

  // Update to New — delete custom prompt to reset to default
  updateNewBtn.addEventListener('click', async function() {
    var lang = userLang || 'en';
    try {
      setStatus('Updating...', 'loading');

      // Delete custom prompt to reset to default
      var delRes = await fetch(apiBase + '/api/prompt?type=' + currentType + '&lang=' + lang, {
        method: 'DELETE',
        headers: authHeaders()
      });
      if (!delRes.ok) throw new Error('Reset failed');
      var data = await delRes.json();
      textarea.value = data.content || '';
      autoResize();

      setBadge(false);
      showStaleBanner(false);
      setStatus('Updated to new default!', 'success');
    } catch (e) {
      setStatus(e.message || 'Update failed', 'error');
    }
  });

  // Keep Mine — acknowledge stale, dismiss banner
  keepMineBtn.addEventListener('click', async function() {
    var lang = userLang || 'en';
    try {
      setStatus('Acknowledging...', 'loading');
      var res = await fetch(apiBase + '/api/prompt/acknowledge', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ type: currentType, lang: lang })
      });
      if (!res.ok) throw new Error('Failed');
      showStaleBanner(false);
      setStatus('Keeping your version', 'success');
    } catch (e) {
      setStatus('Failed to acknowledge', 'error');
    }
  });

  // Tab switching
  tabs.forEach(function(tab) {
    tab.addEventListener('click', function() {
      tabs.forEach(function(t) { t.classList.remove('active'); });
      tab.classList.add('active');
      loadPrompt(tab.dataset.type);
    });
  });

  // Save
  saveBtn.addEventListener('click', async function() {
    var content = textarea.value.trim();
    if (!content) { setStatus('Content cannot be empty', 'error'); return; }

    saveBtn.disabled = true;
    setStatus('Saving...', 'loading');

    try {
      var lang = userLang || 'en';
      var res = await fetch(apiBase + '/api/prompt', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ type: currentType, lang: lang, content: content })
      });
      if (!res.ok) {
        var err = await res.json();
        throw new Error(err.error || 'Save failed');
      }
      setBadge(true);
      setStatus('Saved!', 'success');
    } catch (e) {
      setStatus(e.message || 'Save failed', 'error');
    }
    saveBtn.disabled = false;
  });

  // Reset to Default
  resetBtn.addEventListener('click', async function() {
    if (!confirm('Reset to default prompt? Your custom version will be deleted.')) return;

    resetBtn.disabled = true;
    setStatus('Resetting...', 'loading');

    try {
      var lang = userLang || 'en';
      var res = await fetch(apiBase + '/api/prompt?type=' + currentType + '&lang=' + lang, {
        method: 'DELETE',
        headers: authHeaders()
      });
      if (!res.ok) throw new Error('Reset failed');
      var data = await res.json();
      textarea.value = data.content || '';
      setBadge(false);
      showStaleBanner(false);
      setStatus('Reset to default', 'success');
      autoResize();
    } catch (e) {
      setStatus('Reset failed', 'error');
    }
    resetBtn.disabled = false;
  });

  // Read user's bot language from URL query param (set by the settings view)
  try {
    var urlParams = new URLSearchParams(location.search);
    var langParam = urlParams.get('lang');
    userLang = (langParam === 'he') ? 'he' : 'en';
  } catch(e) { userLang = 'en'; }

  // Load initial tab
  loadPrompt('content');
})();
</script>
</body>
</html>`;

    return new Response(html, {
        headers: {
            'Content-Type': 'text/html; charset=utf-8',
            // NO X-Frame-Options — Telegram needs iframe access
        },
    });
}
