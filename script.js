/**
 * PDFnox – script.js
 * ilovepdf API + Supabase Auth + Payments
 */

// ============================================================
// CONFIG
// ============================================================
const SUPABASE_URL = 'https://gjifjpftundsstvtytdx.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_TknQVJw3rxxD3NLfO4D6sw_ooEOr4vd';
const ILOVEPDF_PUBLIC_KEY = 'project_public_1504bba3ceb07d8e5dc665a0b0557e68_sRN-G9e5d733d8ba9be051a16ecfd1eb1e4c2';
const ILOVEPDF_SECRET_KEY = 'secret_key_834bb374a7eada78bc0932a9540911f2_Yn-sJ6f9a3445bb2efc763b0f216d21491c6e';
const ILOVEPDF_API = 'https://api.ilovepdf.com/v1';

// ============================================================
// STATE
// ============================================================
const MAX_FREE = 3;

let state = {
  user: null,
  profile: null,
  currentTool: null,
  currentFile: null,
  processing: false,
  paymentPolling: null,
};

let selectedPlan = null;
let paymentSessionId = localStorage.getItem('pn_payment_session') || null;

// Tool config
const TOOLS = {
  'compress': { name: 'Compress PDF', accept: '.pdf', task: 'compress', icon: '🗜️', desc: 'Reduce PDF file size' },
  'merge': { name: 'Merge PDF', accept: '.pdf', task: 'merge', icon: '🔗', desc: 'Combine multiple PDFs', multiple: true },
  'split': { name: 'Split PDF', accept: '.pdf', task: 'split', icon: '✂️', desc: 'Split PDF into pages' },
  'pdf-to-word': { name: 'PDF to Word', accept: '.pdf', task: 'pdfoffice', icon: '📝', desc: 'Convert PDF to Word' },
  'word-to-pdf': { name: 'Word to PDF', accept: '.doc,.docx', task: 'officepdf', icon: '📄', desc: 'Convert Word to PDF' },
  'pdf-to-jpg': { name: 'PDF to JPG', accept: '.pdf', task: 'pdfjpg', icon: '🖼️', desc: 'Convert PDF to images' },
  'jpg-to-pdf': { name: 'JPG to PDF', accept: '.jpg,.jpeg,.png,.webp', task: 'imagepdf', icon: '📸', desc: 'Convert images to PDF' },
  'watermark': { name: 'Add Watermark', accept: '.pdf', task: 'watermark', icon: '💧', desc: 'Add watermark to PDF' },
};

const PLANS = {
  starter: { credits: 50, price: '$3.95/mo', name: 'Starter' },
  pro: { credits: 999999, price: '$9.95/mo', name: 'Pro' },
  annual: { credits: 999999, price: '$18.95/yr', name: 'Annual' },
};

// Lemon Squeezy checkout URLs (replace with your actual URLs)
const LEMON_URLS = {
  starter: 'https://snipix-ai.lemonsqueezy.com/checkout/buy/4137f749-c825-4bda-8677-1d9712b153fa',
  pro: 'https://snipix-ai.lemonsqueezy.com/checkout/buy/d48db757-a0c4-4496-8d58-f3ff09f0e105',
  annual: 'https://snipix-ai.lemonsqueezy.com/checkout/buy/d16faf71-bfb9-4764-9ff0-4fe19254bc79',
};

// Binance Pay URLs (replace with your actual URLs)
const BINANCE_URLS = {
  starter: 'https://s.binance.com/v0XyMSYn',
  pro: 'https://s.binance.com/ijOIf03a',
  annual: 'https://s.binance.com/mipu4n6N',
};

const { createClient } = window.supabase;
const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
// ============================================================
// INIT
// ============================================================
async function init() {
  const { data: { session } } = await db.auth.getSession();
  if (session?.user) {
    state.user = session.user;
    await loadProfile();
  }

  updateAuthUI();
  checkCookieBanner();

  db.auth.onAuthStateChange(async (event, session) => {
    if (event === 'SIGNED_IN' && session?.user) {
      state.user = session.user;
      await loadProfile();
      if (!state.profile) await createProfile(session.user);
      updateAuthUI();
    } else if (event === 'SIGNED_OUT') {
      state.user = null;
      state.profile = null;
      updateAuthUI();
    }
  });
}

// ============================================================
// PROFILE
// ============================================================
async function loadProfile() {
  if (!state.user) return;
  const { data } = await db.from('profiles').select('*').eq('id', state.user.id).single();
  state.profile = data;
}

async function createProfile(user) {
  const { data } = await db.from('profiles').insert({
    id: user.id,
    email: user.email,
    credits: MAX_FREE,
    free_used: 0,
    created_at: new Date().toISOString()
  }).select().single();
  state.profile = data;
}

async function saveProfile() {
  if (!state.user || !state.profile) return;
  await db.from('profiles').update({
    credits: state.profile.credits,
  }).eq('id', state.user.id);
}

// ============================================================
// AUTH UI
// ============================================================
function updateAuthUI() {
  const authBtn = document.getElementById('authNavBtn');
  const authBtnMobile = document.getElementById('authNavBtnMobile');

  if (state.user) {
    const initial = (state.user.email || 'U').charAt(0).toUpperCase();
    if (authBtn) authBtn.innerHTML = `<div class="user-avatar" onclick="toggleUserMenu()">${initial}</div>`;
    if (authBtnMobile) authBtnMobile.innerHTML = `<button class="btn-nav-cta" style="width:100%;margin-top:8px" onclick="doSignOut()">🚪 Sign Out</button>`;
  } else {
    if (authBtn) authBtn.innerHTML = `
      <button class="btn-nav-cta" onclick="showAuthModal('signin')">Sign In</button>
      <button class="btn-nav-cta" style="background:transparent;border:1px solid var(--gold);color:var(--gold);margin-left:8px;" onclick="showAuthModal('signup')">Sign Up</button>
    `;
    if (authBtnMobile) authBtnMobile.innerHTML = `
      <button class="btn-nav-cta" style="width:100%;margin-top:8px" onclick="showAuthModal('signin')">Sign In</button>
      <button class="btn-nav-cta" style="width:100%;margin-top:8px;background:transparent;border:1px solid var(--gold);color:var(--gold);" onclick="showAuthModal('signup')">Sign Up</button>
    `;
  }
}

function showAuthModal(mode) {
  const modal = document.getElementById('authModal');
  const content = document.getElementById('authModalContent');
  modal.classList.remove('hidden');

  if (mode === 'signin') {
    content.innerHTML = `
      <h2 class="modal-title">Welcome back</h2>
      <p class="modal-desc">Sign in to your PDFnox account</p>
      <div class="contact-form">
        <input type="email" placeholder="Email" id="authEmail" class="form-input" />
        <input type="password" placeholder="Password" id="authPassword" class="form-input" />
        <button class="btn-primary" onclick="doSignIn()">Sign In</button>
        <button class="btn-secondary" onclick="doGoogleAuth()">🔑 Continue with Google</button>
        <p style="text-align:center;font-size:0.85rem;color:var(--mid);margin-top:8px">
          No account? <a href="#" onclick="showAuthModal('signup')" style="color:var(--gold)">Sign Up</a>
        </p>
      </div>
    `;
  } else {
    content.innerHTML = `
      <h2 class="modal-title">Create account</h2>
      <p class="modal-desc">Get 3 free PDF operations</p>
      <div class="contact-form">
        <input type="email" placeholder="Email" id="authEmail" class="form-input" />
        <input type="password" placeholder="Password" id="authPassword" class="form-input" />
        <button class="btn-primary" onclick="doSignUp()">Create Account</button>
        <button class="btn-secondary" onclick="doGoogleAuth()">🔑 Continue with Google</button>
        <p style="text-align:center;font-size:0.85rem;color:var(--mid);margin-top:8px">
          Already have an account? <a href="#" onclick="showAuthModal('signin')" style="color:var(--gold)">Sign In</a>
        </p>
      </div>
    `;
  }
}

async function doSignIn() {
  const email = document.getElementById('authEmail').value;
  const password = document.getElementById('authPassword').value;
  const { error } = await db.auth.signInWithPassword({ email, password });
  if (error) return showToast(error.message, 'error');
  document.getElementById('authModal').classList.add('hidden');
  showToast('Welcome back!', 'success');
}

async function doSignUp() {
  const email = document.getElementById('authEmail').value;
  const password = document.getElementById('authPassword').value;
  const { error } = await db.auth.signUp({ email, password });
  if (error) return showToast(error.message, 'error');
  showToast('Check your email to confirm your account!', 'success');
  document.getElementById('authModal').classList.add('hidden');
}

async function doGoogleAuth() {
  const { error } = await db.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: 'https://pdfnox.github.io/' }
  });
  if (error) showToast(error.message, 'error');
}

function toggleUserMenu() {
  const existing = document.getElementById('userDropdown');
  if (existing) { existing.remove(); return; }

  const email = state.user?.email || '';
  const initial = email.charAt(0).toUpperCase();
  const credits = getCreditsDisplay();

  const menu = document.createElement('div');
  menu.id = 'userDropdown';
  menu.className = 'user-dropdown';
  menu.innerHTML = `
    <div class="user-dropdown-header">
      <div class="user-dropdown-avatar">${initial}</div>
      <div class="user-dropdown-info">
        <div class="user-dropdown-name">${email.split('@')[0]}</div>
        <div class="user-dropdown-email">${email}</div>
      </div>
    </div>
    <div class="user-dropdown-credits">⚡ ${credits} operations remaining</div>
    <hr/>
    <button class="user-dropdown-logout" onclick="doSignOut()">🚪 Sign Out</button>
  `;
  document.body.appendChild(menu);

  const avatar = document.querySelector('.user-avatar');
  if (avatar) {
    const rect = avatar.getBoundingClientRect();
    menu.style.position = 'fixed';
    menu.style.top = (rect.bottom + 8) + 'px';
    menu.style.right = '20px';
    menu.style.zIndex = '9999';
  }

  setTimeout(() => {
    document.addEventListener('click', function handler(e) {
      if (!menu.contains(e.target) && !e.target.closest('.user-avatar')) {
        menu.remove();
        document.removeEventListener('click', handler);
      }
    });
  }, 100);
}

async function doSignOut() {
  await db.auth.signOut();
  document.getElementById('userDropdown')?.remove();
  showToast('Signed out', 'info');
}

// ============================================================
// CREDITS
// ============================================================
function getCreditsDisplay() {
  if (!state.user) {
    const freeUsed = parseInt(localStorage.getItem('pn_free_used') || '0');
    return Math.max(0, MAX_FREE - freeUsed);
  }
  return state.profile?.credits ?? 0;
}

function canProcess() {
  if (!state.user) {
    const freeUsed = parseInt(localStorage.getItem('pn_free_used') || '0');
    return freeUsed < MAX_FREE;
  }
  return (state.profile?.credits ?? 0) > 0;
}

async function deductCredit() {
  if (state.user && state.profile) {
    state.profile.credits = Math.max(0, (state.profile.credits || 0) - 1);
    await saveProfile();
  } else {
    const freeUsed = parseInt(localStorage.getItem('pn_free_used') || '0');
    localStorage.setItem('pn_free_used', freeUsed + 1);
  }
}

// ============================================================
// TOOL MODAL
// ============================================================
function openTool(toolKey) {
  const tool = TOOLS[toolKey];
  if (!tool) return;
  state.currentTool = toolKey;
  state.currentFile = null;

  const modal = document.getElementById('toolModal');
  const content = document.getElementById('toolModalContent');
  modal.classList.remove('hidden');

  let optionsHTML = '';
  if (toolKey === 'compress') {
    optionsHTML = `
      <div class="tool-options">
        <div>
          <div class="tool-option-label">Compression Level</div>
          <select class="tool-select" id="compressLevel">
            <option value="recommended">Recommended</option>
            <option value="extreme">Extreme (smaller size)</option>
            <option value="low">Low (better quality)</option>
          </select>
        </div>
      </div>
    `;
  }
  if (toolKey === 'watermark') {
    optionsHTML = `
      <div class="tool-options">
        <div>
          <div class="tool-option-label">Watermark Text</div>
          <input type="text" class="form-input" id="watermarkText" placeholder="e.g. CONFIDENTIAL" value="CONFIDENTIAL" />
        </div>
        <div>
          <div class="tool-option-label">Opacity</div>
          <select class="tool-select" id="watermarkOpacity">
            <option value="0.2">20%</option>
            <option value="0.4" selected>40%</option>
            <option value="0.6">60%</option>
          </select>
        </div>
      </div>
    `;
  }

  const multipleAttr = tool.multiple ? 'multiple' : '';

  content.innerHTML = `
    <h2 class="modal-title">${tool.icon} ${tool.name}</h2>
    <p class="modal-desc">${tool.desc}</p>
    
    <div class="tool-upload-zone" id="toolUploadZone"
         ondragover="handleToolDragOver(event)"
         ondragleave="handleToolDragLeave(event)"
         ondrop="handleToolDrop(event)"
         onclick="document.getElementById('toolFileInput').click()">
      <div class="upload-icon">📂</div>
      <h3>Drop your file here</h3>
      <p>or click to browse</p>
    </div>
    <input type="file" id="toolFileInput" accept="${tool.accept}" ${multipleAttr} style="display:none" onchange="handleToolFileSelect(event)" />
    
    ${optionsHTML}
    
    <div class="tool-progress hidden" id="toolProgress">
      <div class="tool-option-label" id="toolProgressLabel">Processing...</div>
      <div class="tool-progress-bar">
        <div class="tool-progress-fill" id="toolProgressFill"></div>
      </div>
    </div>
    
    <div id="toolResult" style="display:none"></div>
    
    <button class="btn-primary" id="toolProcessBtn" onclick="processTool()" style="width:100%;margin-top:16px;display:none">
      Process →
    </button>
  `;
}

function closeTool() {
  document.getElementById('toolModal').classList.add('hidden');
  state.currentTool = null;
  state.currentFile = null;
  state.processing = false;
}

function handleToolDragOver(e) {
  e.preventDefault();
  document.getElementById('toolUploadZone').classList.add('drag-over');
}

function handleToolDragLeave(e) {
  document.getElementById('toolUploadZone').classList.remove('drag-over');
}

function handleToolDrop(e) {
  e.preventDefault();
  document.getElementById('toolUploadZone').classList.remove('drag-over');
  const file = e.dataTransfer.files[0];
  if (file) selectToolFile(file);
}

function handleToolFileSelect(e) {
  const files = e.target.files;
  if (files.length === 0) return;
  if (TOOLS[state.currentTool]?.multiple) {
    state.currentFile = Array.from(files);
    updateUploadZone(`${files.length} files selected`);
  } else {
    selectToolFile(files[0]);
  }
  e.target.value = '';
}

function selectToolFile(file) {
  state.currentFile = file;
  updateUploadZone(file.name + ' · ' + (file.size / 1024 / 1024).toFixed(2) + 'MB');
}

function updateUploadZone(text) {
  const zone = document.getElementById('toolUploadZone');
  zone.innerHTML = `
    <div class="upload-icon">✅</div>
    <h3>${text}</h3>
    <p style="color:var(--gold)">Click to change file</p>
  `;
  const btn = document.getElementById('toolProcessBtn');
  if (btn) btn.style.display = 'block';
}

// ============================================================
// ILOVEPDF API
// ============================================================
async function getIlovePDFToken() {
  const res = await fetch(`${ILOVEPDF_API}/auth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ public_key: ILOVEPDF_PUBLIC_KEY })
  });
  const data = await res.json();
  return data.token;
}

async function processTool() {
  if (!state.currentFile || state.processing) return;

  if (!canProcess()) {
    if (!state.user) {
      showToast('Please sign in to continue', 'warning');
      setTimeout(() => showAuthModal('signup'), 1200);
    } else {
      showToast('No credits remaining. Please upgrade.', 'warning');
      document.getElementById('toolModal').classList.add('hidden');
      document.getElementById('pricing').scrollIntoView({ behavior: 'smooth' });
    }
    return;
  }

  state.processing = true;
  const progressEl = document.getElementById('toolProgress');
  const progressFill = document.getElementById('toolProgressFill');
  const progressLabel = document.getElementById('toolProgressLabel');
  const resultEl = document.getElementById('toolResult');
  const processBtn = document.getElementById('toolProcessBtn');

  progressEl.classList.remove('hidden');
  if (processBtn) processBtn.disabled = true;

  try {
    progressLabel.textContent = 'Connecting to server...';
    progressFill.style.width = '10%';

    const token = await getIlovePDFToken();

    progressLabel.textContent = 'Starting task...';
    progressFill.style.width = '20%';

    const tool = TOOLS[state.currentTool];

    // Start task
    const startRes = await fetch(`${ILOVEPDF_API}/start/${tool.task}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const taskData = await startRes.json();
    const { server, task } = taskData;

    progressLabel.textContent = 'Uploading file...';
    progressFill.style.width = '40%';

    // Upload file(s)
    const files = Array.isArray(state.currentFile) ? state.currentFile : [state.currentFile];
    let serverFilenames = [];

    for (const file of files) {
      const formData = new FormData();
      formData.append('task', task);
      formData.append('file', file);

      const uploadRes = await fetch(`https://${server}/v1/upload`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData
      });
      const uploadData = await uploadRes.json();
      serverFilenames.push({ server_filename: uploadData.server_filename, filename: file.name });
    }

    progressLabel.textContent = 'Processing...';
    progressFill.style.width = '60%';

    // Build process body
    let processBody = {
      task,
      tool: tool.task,
      files: serverFilenames
    };

    // Add tool-specific options
    if (state.currentTool === 'compress') {
      const level = document.getElementById('compressLevel')?.value || 'recommended';
      processBody.compression_level = level;
    }
    if (state.currentTool === 'watermark') {
      const text = document.getElementById('watermarkText')?.value || 'CONFIDENTIAL';
      const opacity = parseFloat(document.getElementById('watermarkOpacity')?.value || '0.4');
      processBody.text = text;
      processBody.pages = 'all';
      processBody.vertical_position = 'middle';
      processBody.horizontal_position = 'center';
      processBody.transparency = opacity;
      processBody.font_size = 40;
      processBody.font_color = '#C9A84C';
      processBody.rotation = -45;
    }

    // Process
    const processRes = await fetch(`https://${server}/v1/process`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(processBody)
    });
    await processRes.json();

    progressLabel.textContent = 'Downloading result...';
    progressFill.style.width = '80%';

    // Download
    const downloadRes = await fetch(`https://${server}/v1/download/${task}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    const blob = await downloadRes.blob();
    progressFill.style.width = '100%';
    progressLabel.textContent = 'Done!';

    // Deduct credit
    await deductCredit();

    // Show download button
    const url = URL.createObjectURL(blob);
    const originalName = Array.isArray(state.currentFile) ? 'result' : state.currentFile.name.replace(/\.[^.]+$/, '');
    const ext = getOutputExt(state.currentTool);

    resultEl.style.display = 'block';
    resultEl.innerHTML = `
      <div class="tool-result">
        <div class="tool-result-info">✅ <strong>${originalName}${ext}</strong> is ready!</div>
        <a href="${url}" download="${originalName}${ext}" class="btn-download">⬇ Download</a>
      </div>
    `;

    showToast('File processed successfully! ✨', 'success');

  } catch (err) {
    console.error(err);
    showToast('Processing failed. Please try again.', 'error');
    progressEl.classList.add('hidden');
  } finally {
    state.processing = false;
    if (processBtn) processBtn.disabled = false;
  }
}

function getOutputExt(toolKey) {
  const exts = {
    'compress': '.pdf',
    'merge': '.pdf',
    'split': '.zip',
    'pdf-to-word': '.docx',
    'word-to-pdf': '.pdf',
    'pdf-to-jpg': '.zip',
    'jpg-to-pdf': '.pdf',
    'watermark': '.pdf',
  };
  return exts[toolKey] || '.pdf';
}

// ============================================================
// NAVIGATION
// ============================================================
function scrollToTools() {
  document.getElementById('tools').scrollIntoView({ behavior: 'smooth' });
}

function toggleMobileMenu() {
  document.getElementById('mobileMenu').classList.toggle('open');
}

// ============================================================
// PAYMENT
// ============================================================
function openPaymentModal(plan) {
  if (!state.user) {
    showToast('Please sign in first', 'warning');
    setTimeout(() => showAuthModal('signup'), 1200);
    return;
  }
  selectedPlan = plan;
  document.getElementById('paymentModal').classList.remove('hidden');
  document.getElementById('ivedPaidSection').style.display = 'none';
  document.getElementById('ivePaidBtn').onclick = showIvePaid;
}

function closePaymentModal() {
  document.getElementById('paymentModal').classList.add('hidden');
  stopPaymentPolling();
}

function payBinance() {
  const url = BINANCE_URLS[selectedPlan] || BINANCE_URLS.pro;
  window.open(url, '_blank');
  document.getElementById('ivedPaidSection').style.display = 'block';
}

function payLemon() {
  const url = LEMON_URLS[selectedPlan] || LEMON_URLS.pro;
  const email = state.user?.email || '';
  window.open(url + '?checkout[email]=' + encodeURIComponent(email), '_blank');
  showToast('Complete payment in the opened tab', 'info');
  closePaymentModal();
}

async function showIvePaid() {
  if (!state.user) return;
  paymentSessionId = 'ps_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  localStorage.setItem('pn_payment_session', paymentSessionId);
  const plan = PLANS[selectedPlan];
  const { error } = await db.from('payment_sessions').insert({
    id: paymentSessionId,
    user_id: state.user.id,
    plan: selectedPlan,
    credits: plan.credits,
    status: 'user_confirmed',
    confirmed_at: new Date().toISOString(),
    created_at: new Date().toISOString()
  });
  if (error) { showToast('Error: ' + error.message, 'error'); return; }
  closePaymentModal();
  showToast('Payment submitted! Waiting for verification...', 'info');
  startPaymentPolling();
}

function startPaymentPolling() {
  stopPaymentPolling();
  if (!paymentSessionId || !state.user) return;

  let attempts = 0;
  state.paymentPolling = setInterval(async () => {
    attempts++;
    if (attempts > 72) { stopPaymentPolling(); return; }

    const { data } = await db
      .from('payment_sessions')
      .select('status, credits')
      .eq('id', paymentSessionId)
      .single();

    if (data?.status === 'confirmed') {
      stopPaymentPolling();
      await grantCredits(data.credits);
    }
  }, 5000);
}

function stopPaymentPolling() {
  if (state.paymentPolling) {
    clearInterval(state.paymentPolling);
    state.paymentPolling = null;
  }
}

async function grantCredits(credits) {
  if (!state.user) return;

  await loadProfile();
  if (!state.profile) await createProfile(state.user);

  state.profile.credits = (state.profile.credits || 0) + credits;
  await saveProfile();

  localStorage.removeItem('pn_payment_session');
  paymentSessionId = null;

  updateAuthUI();
  showToast(`🎉 Plan activated! Credits added.`, 'success');
}

// ============================================================
// LEGAL MODALS
// ============================================================
const legalContent = {
  tos: `<h2 style="font-family:var(--font-display);font-size:1.5rem;font-weight:800;margin-bottom:16px;">Terms of Service</h2>
    <p style="color:var(--mid);font-size:0.85rem;margin-bottom:20px;">Last updated: 2025</p>
    <h3 style="margin-bottom:8px;">1. Acceptance</h3><p>By using PDFnox, you agree to these terms.</p>
    <h3 style="margin:16px 0 8px;">2. Service</h3><p>PDF processing via ilovepdf API. Files deleted after 1 hour.</p>
    <h3 style="margin:16px 0 8px;">3. Payments</h3><p>Monthly/annual payments. 30-day refund guarantee.</p>
    <h3 style="margin:16px 0 8px;">4. Privacy</h3><p>Files are processed securely and deleted automatically.</p>`,
  privacy: `<h2 style="font-family:var(--font-display);font-size:1.5rem;font-weight:800;margin-bottom:16px;">Privacy Policy</h2>
    <p style="color:var(--mid);font-size:0.85rem;margin-bottom:20px;">GDPR Compliant</p>
    <h3 style="margin-bottom:8px;">Your Files</h3><p>Files are processed via ilovepdf API and automatically deleted after 1 hour.</p>
    <h3 style="margin:16px 0 8px;">Data We Store</h3><p>Email and credit balance only. No file contents stored.</p>`,
  refund: `<h2 style="font-family:var(--font-display);font-size:1.5rem;font-weight:800;margin-bottom:16px;">Refund Policy</h2>
    <h3 style="margin-bottom:8px;">30-Day Money Back</h3><p>Not satisfied? Email support@pdfnox.com within 30 days for a full refund.</p>`,
  contact: null,
};

function showModal(type, event) {
  event?.preventDefault();
  if (type === 'contact') {
    document.getElementById('contactModal').classList.remove('hidden');
    return;
  }
  const content = legalContent[type];
  if (!content) return;
  document.getElementById('infoModalContent').innerHTML = content;
  document.getElementById('infoModal').classList.remove('hidden');
}

function closeInfoModal() {
  document.getElementById('infoModal').classList.add('hidden');
}

// ============================================================
// FAQ
// ============================================================
function toggleFaq(index) {
  const item = document.querySelectorAll('.faq-item')[index];
  if (item) item.classList.toggle('open');
}

// ============================================================
// TOAST
// ============================================================
function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100%)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

// ============================================================
// COOKIE BANNER
// ============================================================
function checkCookieBanner() {
  if (localStorage.getItem('pn_cookieConsent')) {
    const banner = document.getElementById('cookieBanner');
    if (banner) banner.style.display = 'none';
  }
}

function acceptCookies() {
  localStorage.setItem('pn_cookieConsent', 'accepted');
  document.getElementById('cookieBanner').style.display = 'none';
}

function declineCookies() {
  localStorage.setItem('pn_cookieConsent', 'declined');
  document.getElementById('cookieBanner').style.display = 'none';
}

// ============================================================
// CONTACT
// ============================================================
function submitContact() {
  const name = document.getElementById('contactName').value.trim();
  const email = document.getElementById('contactEmail').value.trim();
  const msg = document.getElementById('contactMsg').value.trim();

  if (!name || !email || !msg) return showToast('Please fill in all fields', 'warning');
  if (!email.includes('@')) return showToast('Please enter a valid email', 'error');

  document.getElementById('contactModal').classList.add('hidden');
  showToast("Message sent! We'll get back to you soon.", 'success');
  document.getElementById('contactName').value = '';
  document.getElementById('contactEmail').value = '';
  document.getElementById('contactMsg').value = '';
}

// ============================================================
// KEYBOARD SHORTCUTS
// ============================================================
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closeTool();
    closePaymentModal();
    closeInfoModal();
    document.getElementById('contactModal')?.classList.add('hidden');
    document.getElementById('authModal')?.classList.add('hidden');
  }
});

// ============================================================
// START
// ============================================================
document.addEventListener('DOMContentLoaded', init);
