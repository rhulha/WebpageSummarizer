const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
const MODEL = "gpt-3.5-turbo";

async function runInTab(tabId, func) {
  if (chrome.scripting && chrome.scripting.executeScript) {
    return await chrome.scripting.executeScript({ target: { tabId }, func });
  }
  if (chrome.tabs && chrome.tabs.executeScript) {
    return await new Promise((resolve, reject) => {
      try {
        chrome.tabs.executeScript(tabId, { code: '(' + func.toString() + ')();' }, (results) => {
          if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
          resolve([{ result: results && results[0] }]);
        });
      } catch (err) { reject(err); }
    });
  }
  throw new Error('No supported executeScript API available in this environment.');
}

export async function extractPageText() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || typeof tab.id !== 'number') {
    throw new Error('No active tab found. Make sure a normal web page is active (not chrome:// or the Web Store).');
  }
  const result = await runInTab(tab.id, async () => {
    await new Promise((resolve) => {
      try {
        if (window.Readability) return resolve();
        const s = document.createElement('script');
        s.src = 'https://unpkg.com/@mozilla/readability/Readability.js';
        s.onload = () => resolve();
        s.onerror = () => resolve();
        (document.head || document.documentElement).appendChild(s);
      } catch (e) { resolve(); }
    });
    try {
      const doc = document.cloneNode(true);
      const article = window.Readability ? new Readability(doc).parse() : null;
      const mainText = (article && article.textContent) ? article.textContent : document.body.innerText;
      return mainText.slice(0, 4000);
    } catch (e) {
      return document.body.innerText.slice(0, 4000);
    }
  });
  if (!result || !result[0] || typeof result[0].result !== 'string') {
    throw new Error('Failed to extract page text.');
  }
  return result[0].result;
}

async function callOpenAI(apiKey, messages) {
  const response = await fetch(OPENAI_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
    body: JSON.stringify({ model: MODEL, messages })
  });
  if (!response.ok) throw new Error(`API request failed: ${response.status} ${response.statusText}`);
  const data = await response.json();
  return data.choices[0].message.content.trim();
}

export async function summarizeText(apiKey, text) {
  return callOpenAI(apiKey, [{ role: "user", content: "Summarize this in the same language as the following text. Use around 5 sentences:\n" + text }]);
}

export async function generateTitleFromText(apiKey, text) {
  return callOpenAI(apiKey, [{
    role: "user",
    content: "Generate a single short polemic and provocative title for the following text. Reply with only the title, no quotes or extra text. Use the same language as the following text:\n" + text
  }]);
}

export async function chatAboutText(apiKey, articleText, question) {
  return callOpenAI(apiKey, [
    { role: "system", content: "Answer questions about the following article in the same language as the question is:\n\n" + articleText },
    { role: "user", content: question }
  ]);
}
