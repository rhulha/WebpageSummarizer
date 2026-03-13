import { extractPageText, summarizeText, generateTitleFromText, chatAboutText } from './summarizer-api.js';

const STORAGE_KEY = 'openai_api_key';
let articleText = '';

const $ = (id) => document.getElementById(id);
const ga = (el, n, cb) => $(el).addEventListener(n, cb);

ga('summarizeBtn', 'click', summarize);
ga('chatSendBtn', 'click', sendChat);
ga('chatInput', 'keydown', (e) => { if (e.key === 'Enter') sendChat(); });
ga('saveKeyBtn', 'click', saveApiKey);
ga('clearKeyBtn', 'click', clearApiKey);
ga('generateTitleBtn', 'click', generateTitle);

ga('copyBtn', 'click', () => {
  navigator.clipboard.writeText(''+$('summary').textContent);
});

function loadApiKeyToUI() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) $('apiKey').value = saved;
}

function saveApiKey() {
  const k = $('apiKey').value.trim();
  if (!k) { setStatus('No key to save.', true); return; }
  localStorage.setItem(STORAGE_KEY, k);
  setStatus('API key saved.');
}

function clearApiKey() {
  localStorage.removeItem(STORAGE_KEY);
  $('apiKey').value = '';
  setStatus('API key cleared.');
}

function setStatus(msg, isError = false) {
  const el = $('status');
  el.textContent = msg;
  el.style.color = isError ? '#b21f2d' : '#666';
  setTimeout(() => { if (el.textContent === msg) el.textContent = ''; }, 3500);
}

loadApiKeyToUI();

async function generateTitle() {
  const apiKey = $('apiKey').value.trim();
  if (!apiKey) { setStatus('Please enter your OpenAI API key.', true); return; }
  const summaryText = $('summary').textContent.trim();
  if (!summaryText) { setStatus('No summary text to generate a title from.', true); return; }
  const titleEl = $('titleOutput');
  titleEl.textContent = 'Generating title...';
  try {
    titleEl.textContent = await generateTitleFromText(apiKey, summaryText);
  } catch (error) {
    titleEl.textContent = `Error: ${error.message}`;
  }
}

async function sendChat() {
  const apiKey = $('apiKey').value.trim();
  if (!apiKey) { setStatus('Please enter your OpenAI API key.', true); return; }
  if (!articleText) { articleText = await extractPageText(); }

  const input = $('chatInput');
  const question = input.value.trim();
  if (!question) return;

  const messagesEl = $('chat-messages');
  const userEl = document.createElement('div');
  userEl.className = 'chat-msg-user';
  userEl.textContent = 'You: ' + question;
  messagesEl.appendChild(userEl);
  input.value = '';

  const btn = $('chatSendBtn');
  btn.disabled = true;

  const replyEl = document.createElement('div');
  replyEl.className = 'chat-msg-assistant';
  replyEl.textContent = '…';
  messagesEl.appendChild(replyEl);
  messagesEl.scrollTop = messagesEl.scrollHeight;

  try {
    replyEl.textContent = await chatAboutText(apiKey, articleText, question);
  } catch (err) {
    replyEl.textContent = 'Error: ' + err.message;
  }

  btn.disabled = false;
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

async function summarize() {
  const apiKey = $('apiKey').value.trim();
  if (!apiKey) { $('summary').textContent = 'Please enter your OpenAI API key.'; return; }
  try { localStorage.setItem(STORAGE_KEY, apiKey); } catch (e) { /* ignore */ }

  $('summary').textContent = 'Summarizing... Please wait.';
  try {
    articleText = await extractPageText();
    $('summary').textContent = await summarizeText(apiKey, articleText);
  } catch (error) {
    $('summary').textContent = `Error: ${error.message}`;
  }
}
