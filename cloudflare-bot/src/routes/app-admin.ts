/**
 * Admin WebApp route — serves the admin prompt editor HTML page.
 * Separate from user editor, shows all 9 skill types with language toggle and push-to-users.
 * No X-Frame-Options header so Telegram can load it in an iframe.
 */

export function handleAdminPromptEditorPage(): Response {
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
<title>System Prompts (Admin)</title>
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
  h1 { font-size: 20px; margin-bottom: 12px; }

  .prompt-select-wrap {
    margin-bottom: 10px;
  }
  .prompt-select {
    width: 100%; padding: 10px 12px;
    border: 1px solid var(--hint); border-radius: 10px;
    background: var(--secondary-bg); color: var(--text);
    font-family: inherit; font-size: 14px; font-weight: 500;
    appearance: none; -webkit-appearance: none;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23999' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: right 12px center;
    cursor: pointer; outline: none;
  }
  .prompt-select:focus { border-color: var(--btn); }

  .lang-toggle {
    display: flex; gap: 8px; margin-bottom: 12px;
  }
  .lang-btn {
    flex: 1; padding: 8px; text-align: center;
    font-size: 14px; font-weight: 600;
    cursor: pointer; border: none; border-radius: 8px;
    transition: all 0.2s;
  }
  .lang-btn.active {
    background: var(--btn); color: var(--btn-text);
  }
  .lang-btn:not(.active) {
    background: var(--secondary-bg); color: var(--hint);
  }

  .badge {
    display: inline-block; padding: 3px 10px; border-radius: 12px;
    font-size: 12px; font-weight: 600; margin-bottom: 10px;
  }
  .badge.custom { background: #34c75922; color: #34c759; }
  .badge.default { background: var(--secondary-bg); color: var(--hint); }

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
    flex-direction: column;
  }
  .btn {
    padding: 12px 20px; border-radius: 10px;
    font-size: 14px; font-weight: 600; cursor: pointer;
    border: none; transition: opacity 0.2s;
    width: 100%; text-align: center;
  }
  .btn:disabled { opacity: 0.5; cursor: not-allowed; }
  .btn-primary { background: var(--btn); color: var(--btn-text); }
  .btn-push { background: #ff9f0a; color: #fff; }

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

  .admin-error {
    display: none; flex-direction: column; align-items: center;
    justify-content: center; min-height: 60vh; text-align: center;
    color: var(--hint); gap: 12px;
  }
  .admin-error-icon { font-size: 48px; }
</style>
</head>
<body>
<div id="app">
  <div class="blocked" id="blocked" style="display:none;">
    <div class="blocked-icon">🔒</div>
    <div>Please open this from the bot settings in Telegram</div>
  </div>

  <div class="admin-error" id="adminError">
    <div class="admin-error-icon">🚫</div>
    <div>Admin access required</div>
  </div>

  <div id="editor" style="display:none;">
    <h1>📝 System Prompts (Admin)</h1>
    <div class="prompt-select-wrap">
      <select class="prompt-select" id="promptSelect">
        <option value="work-progress">/work-progress — Tweet generation from commits</option>
        <option value="refine">/refine — Refine existing tweets</option>
        <option value="quote">/quote — Quote tweet responses</option>
        <option value="video">/video — AI avatar script writing</option>
        <option value="know-my-project">/know-my-project — Repo analysis &amp; summary</option>
        <option value="persona">/persona — Twitter account research</option>
        <option value="what-i-like">/what-i-like — Tweet relevance scoring</option>
        <option value="who-am-i">/who-am-i — Identity analysis skill</option>
        <option value="identity">/identity — Default identity skeleton</option>
        <option value="image-gen">/image-gen — Visual direction module</option>
      </select>
    </div>
    <div class="lang-toggle">
      <button class="lang-btn active" id="langEn" data-lang="en">EN 🇺🇸</button>
      <button class="lang-btn" id="langHe" data-lang="he">HE 🇮🇱</button>
    </div>
    <div><span class="badge default" id="badge">Default</span></div>
    <textarea id="textarea" placeholder="Loading..."></textarea>
    <div class="actions">
      <button class="btn btn-primary" id="saveBtn">Save</button>
      <button class="btn btn-push" id="pushBtn">Save &amp; Push to Users</button>
    </div>
    <div class="status" id="status"></div>
  </div>
</div>

<script>
(function() {
  var tg = window.Telegram && window.Telegram.WebApp;
  if (!tg || !tg.initData) {
    document.getElementById('blocked').style.display = 'flex';
    return;
  }

  tg.ready();
  tg.expand();

  var textarea = document.getElementById('textarea');
  var badge = document.getElementById('badge');
  var status = document.getElementById('status');
  var saveBtn = document.getElementById('saveBtn');
  var pushBtn = document.getElementById('pushBtn');
  var langEn = document.getElementById('langEn');
  var langHe = document.getElementById('langHe');
  var editor = document.getElementById('editor');
  var adminError = document.getElementById('adminError');
  var promptSelect = document.getElementById('promptSelect');
  var currentType = 'work-progress';
  var currentLang = 'en';
  var apiBase = location.origin;
  var isAdminVerified = false;

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

  function authHeaders() {
    return { 'Authorization': 'tma ' + tg.initData, 'Content-Type': 'application/json' };
  }

  function showAdminError() {
    adminError.style.display = 'flex';
    editor.style.display = 'none';
  }

  async function loadPrompt(type, lang) {
    currentType = type;
    currentLang = lang;
    textarea.value = '';
    textarea.placeholder = 'Loading...';
    setStatus('Loading...', 'loading');
    saveBtn.disabled = true;
    pushBtn.disabled = true;

    try {
      var res = await fetch(apiBase + '/api/admin/prompt?type=' + type + '&lang=' + lang, {
        headers: authHeaders()
      });
      if (res.status === 403) {
        showAdminError();
        return;
      }
      if (!res.ok) throw new Error('Failed to load');
      isAdminVerified = true;
      var data = await res.json();
      textarea.value = data.content || '';
      setBadge(data.isCustom);
      textarea.placeholder = 'Enter prompt...';
      setStatus('', '');
      autoResize();
    } catch (e) {
      setStatus('Failed to load prompt', 'error');
      textarea.placeholder = 'Error loading prompt';
    }
    saveBtn.disabled = false;
    pushBtn.disabled = false;
  }

  // Prompt type switching
  promptSelect.addEventListener('change', function() {
    loadPrompt(promptSelect.value, currentLang);
  });

  // Language toggle
  langEn.addEventListener('click', function() {
    langEn.classList.add('active');
    langHe.classList.remove('active');
    loadPrompt(currentType, 'en');
  });
  langHe.addEventListener('click', function() {
    langHe.classList.add('active');
    langEn.classList.remove('active');
    loadPrompt(currentType, 'he');
  });

  // Save (personal only)
  saveBtn.addEventListener('click', async function() {
    var content = textarea.value.trim();
    if (!content) { setStatus('Content cannot be empty', 'error'); return; }

    saveBtn.disabled = true;
    setStatus('Saving...', 'loading');

    try {
      var res = await fetch(apiBase + '/api/admin/prompt', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ type: currentType, lang: currentLang, content: content })
      });
      if (res.status === 403) { showAdminError(); return; }
      if (!res.ok) {
        var err = await res.json();
        throw new Error(err.error || 'Save failed');
      }
      setBadge(true);
      setStatus('Saved (personal)!', 'success');
    } catch (e) {
      setStatus(e.message || 'Save failed', 'error');
    }
    saveBtn.disabled = false;
  });

  // Save & Push to Users
  pushBtn.addEventListener('click', async function() {
    if (!confirm('This will become the new default for all users who haven\\'t customized. Continue?')) return;

    var content = textarea.value.trim();
    if (!content) { setStatus('Content cannot be empty', 'error'); return; }

    pushBtn.disabled = true;
    setStatus('Pushing...', 'loading');

    try {
      var res = await fetch(apiBase + '/api/admin/prompt/push', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ type: currentType, lang: currentLang, content: content })
      });
      if (res.status === 403) { showAdminError(); return; }
      if (!res.ok) {
        var err = await res.json();
        throw new Error(err.error || 'Push failed');
      }
      var data = await res.json();
      setBadge(true);
      setStatus('Pushed! New version: v' + data.newVersion, 'success');
    } catch (e) {
      setStatus(e.message || 'Push failed', 'error');
    }
    pushBtn.disabled = false;
  });

  // Show editor and load initial prompt
  editor.style.display = 'block';
  loadPrompt('work-progress', 'en');
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
