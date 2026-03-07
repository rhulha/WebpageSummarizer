const STORAGE_KEY = 'openai_api_key';

document.getElementById('summarizeBtn').addEventListener('click', summarize);
document.getElementById('saveKeyBtn').addEventListener('click', saveApiKey);
document.getElementById('clearKeyBtn').addEventListener('click', clearApiKey);
document.getElementById('generateTitleBtn').addEventListener('click', generateTitle);
document.getElementById('copyBtn').addEventListener('click', () => {
  const text = document.getElementById('summary').textContent;
  if (text) navigator.clipboard.writeText(text);
});

// Load key on open
function loadApiKeyToUI() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    document.getElementById('apiKey').value = saved;
    setStatus('Loaded saved API key.');
  }
}

function saveApiKey() {
  const k = document.getElementById('apiKey').value.trim();
  if (!k) {
    setStatus('No key to save.', true);
    return;
  }
  localStorage.setItem(STORAGE_KEY, k);
  setStatus('API key saved.');
}

function clearApiKey() {
  localStorage.removeItem(STORAGE_KEY);
  document.getElementById('apiKey').value = '';
  setStatus('API key cleared.');
}

function setStatus(msg, isError = false) {
  const el = document.getElementById('status');
  el.textContent = msg;
  el.style.color = isError ? '#b21f2d' : '#666';
  setTimeout(() => { if (el.textContent === msg) el.textContent = ''; }, 3500);
}

loadApiKeyToUI();

async function generateTitle() {
  const apiKey = document.getElementById('apiKey').value.trim();
  if (!apiKey) {
    setStatus('Please enter your OpenAI API key.', true);
    return;
  }
  const summaryText = document.getElementById('summary').textContent.trim();
  if (!summaryText) {
    setStatus('No summary text to generate a title from.', true);
    return;
  }
  const titleEl = document.getElementById('titleOutput');
  titleEl.textContent = 'Generating title...';
  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: "gpt-3.5-turbo",
        messages: [{ role: "user", content: "Generate a single short polemic and provocative title for the following text. Reply with only the title, no quotes or extra text. Use the same language as the following text:\n" + summaryText }]
      })
    });
    if (!response.ok) throw new Error(`API request failed: ${response.status} ${response.statusText}`);
    const data = await response.json();
    titleEl.textContent = data.choices[0].message.content.trim();
  } catch (error) {
    titleEl.textContent = `Error: ${error.message}`;
  }
}

async function summarize() {
  const apiKey = document.getElementById('apiKey').value.trim();
  if (!apiKey) {
    document.getElementById('summary').textContent = 'Please enter your OpenAI API key.';
    return;
  }

  // auto-save to localStorage for convenience
  try { localStorage.setItem(STORAGE_KEY, apiKey); } catch (e) { /* ignore */ }

  document.getElementById('summary').textContent = 'Summarizing... Please wait.';
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || typeof tab.id !== 'number') {
      throw new Error('No active tab found or tab does not have an id. Make sure a normal web page is active (not chrome:// or the Web Store).');
    }

    // Helper: run a function in the page context with compatibility fallback
    async function runInTab(tabId, func) {
      // Preferred: MV3 scripting API
      if (chrome.scripting && chrome.scripting.executeScript) {
        return await chrome.scripting.executeScript({ target: { tabId }, func });
      }

      // Fallback: older chrome.tabs.executeScript (serialized function)
      if (chrome.tabs && chrome.tabs.executeScript) {
        return await new Promise((resolve, reject) => {
          try {
            const code = '(' + func.toString() + ')();';
            chrome.tabs.executeScript(tabId, { code }, (results) => {
              if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
              // normalize to scripting.executeScript shape
              resolve([{ result: results && results[0] }]);
            });
          } catch (err) { reject(err); }
        });
      }

      throw new Error('No supported executeScript API available in this environment.');
    }

    const result = await runInTab(tab.id, async () => {
      // Load Readability if needed (best-effort; may be blocked by page CSP)
      await new Promise((resolve) => {
        try {
          if (window.Readability) return resolve();
          const s = document.createElement('script');
          s.src = 'https://unpkg.com/@mozilla/readability/Readability.js';
          s.onload = () => resolve();
          s.onerror = () => resolve(); // proceed without Readability on failure
          (document.head || document.documentElement).appendChild(s);
        } catch (e) { resolve(); }
      });

      // Try Readability, else fallback to body text
      try {
        const doc = document.cloneNode(true);
        const article = (window.Readability) ? new Readability(doc).parse() : null;
        const mainText = (article && article.textContent) ? article.textContent : document.body.innerText;
        return mainText.slice(0, 4000);
      } catch (e) {
        return document.body.innerText.slice(0, 4000);
      }
    });

    if (!result || !result[0] || typeof result[0].result !== 'string') {
      throw new Error('Failed to extract page text (executeScript returned no result).');
    }
    const text = result[0].result;
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify({
    // Use a stable model name by default
    model: "gpt-3.5-turbo",
        messages: [{ role: "user", content: "Summarize this:\n" + text }]
      })
    });
    if (!response.ok) {
      throw new Error(`API request failed: ${response.status} ${response.statusText}`);
    }
    const data = await response.json();
    document.getElementById('summary').textContent = data.choices[0].message.content;
  } catch (error) {
    document.getElementById('summary').textContent = `Error: ${error.message}`;
  }
}
