// ============================================================================
// DaSiWa WAN2.2 I2V Lightspeed v10 - Cloudflare Worker v9.0
// 過去 v6.5 + 今回の DaSiWa Lightspeed v10 ワークフロー融合版
// ----------------------------------------------------------------------------
// v9.0 変更:
//  + workflow に PathchSageAttentionKJ ノード(200, 201) を High/Low 各KSampler直前に挿入
//  + sage_attention: "auto" (sageattention 1.0.6 / 2.x 両対応)
//  + 起動引数 --use-sage-attention は使わない (Wan黒画面回避)
//  既存機能継承:
//   - DaSiWa Lightspeed v10 ワークフロー (4 steps High+Low)
//   - Load failed 対策 (3回連続失敗まで耐える)
//   - Google Drive 自動保存 (folder指定 1ib6iQUTidpdYM7mDuwRCfwXcE0uwOAnw)
//   - Endpoint Ping
//   - Status可視化 (Worker ID / Queue / Exec表示)
//   - キャンセルボタン
// ============================================================================

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

const HTML = `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<title>DaSiWa Lightspeed v10 - I2V v9.0</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Space+Mono:wght@400;700&display=swap');
  :root {
    --bg:#0a0a0c; --surface:#141418; --surface2:#1c1c22;
    --border:#2a2a33; --text:#e8e8ed; --dim:#6b6b7b;
    --accent:#6366f1; --accent2:#818cf8;
    --green:#22c55e; --amber:#f59e0b; --red:#ef4444; --blue:#3b82f6;
    --radius:10px;
  }
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family:'DM Sans',sans-serif; background:var(--bg); color:var(--text); min-height:100vh; }
  .app { max-width:900px; margin:0 auto; padding:20px 16px 80px; }
  .header { text-align:center; padding:24px 0 20px; }
  .header h1 { font-family:'Space Mono',monospace; font-size:22px; font-weight:700; letter-spacing:-0.5px; }
  .header h1 span { color:var(--accent2); }
  .header p { color:var(--dim); font-size:12px; margin-top:6px; font-family:'Space Mono',monospace; }
  .card { background:var(--surface); border:1px solid var(--border); border-radius:var(--radius); padding:18px; margin-bottom:14px; }
  .card h2 { font-size:12px; font-weight:600; color:var(--dim); text-transform:uppercase; letter-spacing:0.5px; margin-bottom:12px; }
  .row { display:flex; gap:10px; align-items:center; flex-wrap:wrap; }
  label { display:block; font-size:12px; color:var(--dim); margin-bottom:6px; font-weight:500; }
  input[type=text], input[type=password], input[type=number], textarea, select {
    width:100%; background:var(--surface2); border:1px solid var(--border); border-radius:8px;
    padding:10px 12px; color:var(--text); font-family:inherit; font-size:13px;
    transition:border-color 0.15s;
  }
  input:focus, textarea:focus, select:focus { outline:none; border-color:var(--accent); }
  textarea { resize:vertical; min-height:60px; font-family:inherit; }
  .check-row { display:flex; align-items:center; gap:8px; margin-top:10px; font-size:13px; color:var(--text); }
  .check-row input[type=checkbox] { width:18px; height:18px; accent-color:var(--accent); cursor:pointer; }
  button { background:var(--accent); color:white; border:none; border-radius:8px;
    padding:11px 18px; font-family:inherit; font-weight:600; font-size:13px;
    cursor:pointer; transition:all 0.15s; }
  button:hover { background:var(--accent2); }
  button:disabled { opacity:0.4; cursor:not-allowed; }
  .btn-secondary { background:var(--surface2); color:var(--text); border:1px solid var(--border); }
  .btn-secondary:hover { background:var(--border); }
  .btn-danger { background:var(--red); color:white; }
  .btn-large { width:100%; padding:14px; font-size:14px; }
  .drop { background:var(--surface2); border:2px dashed var(--border); border-radius:var(--radius); padding:28px 20px; text-align:center; cursor:pointer; transition:all 0.15s; }
  .drop:hover, .drop.drag { border-color:var(--accent); background:var(--surface); }
  .drop p { color:var(--dim); font-size:12px; }
  .drop strong { color:var(--text); }
  .preview { max-width:100%; max-height:280px; border-radius:8px; display:block; margin:0 auto; }
  .status { display:inline-flex; align-items:center; gap:6px; padding:5px 12px; border-radius:6px; font-size:12px; font-weight:700; font-family:'Space Mono',monospace; }
  .status::before { content:''; width:8px; height:8px; border-radius:50%; background:currentColor; }
  .status.idle { background:#2a2a33; color:var(--dim); }
  .status.queue { background:rgba(59,130,246,0.15); color:var(--blue); }
  .status.queue::before { animation:pulse 1.2s infinite; }
  .status.running { background:rgba(245,158,11,0.15); color:var(--amber); }
  .status.running::before { animation:pulse 0.8s infinite; }
  .status.done { background:rgba(34,197,94,0.15); color:var(--green); }
  .status.error { background:rgba(239,68,68,0.15); color:var(--red); }
  .status.cancel { background:rgba(107,107,123,0.2); color:var(--dim); }
  @keyframes pulse { 0%,100%{opacity:1;transform:scale(1);} 50%{opacity:0.4;transform:scale(1.4);} }
  .status-detail { margin-top:12px; padding:12px; background:var(--surface2); border-radius:8px; font-size:12px; }
  .status-detail .det-row { display:flex; justify-content:space-between; align-items:center; padding:5px 0; border-bottom:1px solid var(--border); gap:10px; }
  .status-detail .det-row:last-child { border:none; }
  .status-detail .label { color:var(--dim); flex-shrink:0; font-weight:500; }
  .status-detail .value { font-family:'Space Mono',monospace; color:var(--text); font-size:11px; word-break:break-all; text-align:right; }
  .status-detail .value.highlight { color:var(--accent2); font-weight:700; }
  .progress-msg { margin-top:10px; padding:10px 14px; background:rgba(99,102,241,0.1); border-left:3px solid var(--accent); border-radius:4px; font-size:12px; color:var(--text); display:flex; align-items:center; gap:8px; }
  .progress-msg .spinner { display:inline-block; width:12px; height:12px; border:2px solid var(--accent); border-top-color:transparent; border-radius:50%; animation:spin 0.8s linear infinite; flex-shrink:0; }
  @keyframes spin { to { transform:rotate(360deg); } }
  .video-wrap { background:var(--surface2); border-radius:var(--radius); padding:14px; margin-top:14px; }
  .video-wrap video { width:100%; border-radius:8px; display:block; }
  .video-wrap .meta { display:flex; justify-content:space-between; align-items:center; margin-top:10px; font-size:11px; color:var(--dim); flex-wrap:wrap; gap:8px; }
  .video-wrap .actions { display:flex; gap:8px; flex-wrap:wrap; margin-top:10px; }
  .drive-status { margin-top:8px; font-size:12px; padding:6px 10px; border-radius:6px; }
  .drive-status.ok { background:rgba(34,197,94,0.15); color:var(--green); }
  .drive-status.err { background:rgba(239,68,68,0.15); color:var(--red); }
  .drive-status.busy { background:rgba(245,158,11,0.15); color:var(--amber); }
  .drive-status a { color:var(--accent2); text-decoration:none; font-weight:600; }
  .grid-3 { display:grid; grid-template-columns:repeat(3,1fr); gap:10px; }
  .grid-2 { display:grid; grid-template-columns:repeat(2,1fr); gap:10px; }
  @media (max-width:540px) { .grid-3, .grid-2 { grid-template-columns:1fr 1fr; } }
  details { background:var(--surface2); border:1px solid var(--border); border-radius:8px; padding:10px 14px; margin-top:10px; }
  details summary { cursor:pointer; font-size:11px; color:var(--dim); font-weight:600; }
  details[open] summary { margin-bottom:10px; }
  .log { font-family:'Space Mono',monospace; font-size:10px; color:var(--dim); background:var(--bg); padding:10px; border-radius:6px; max-height:160px; overflow-y:auto; white-space:pre-wrap; word-break:break-all; }
  .footer { text-align:center; color:var(--dim); font-size:10px; font-family:'Space Mono',monospace; margin-top:24px; }
  .ping-msg { font-size:11px; padding:4px 10px; border-radius:6px; display:inline-block; margin-left:8px; font-family:'Space Mono',monospace; }
  .ping-msg.ok { background:rgba(34,197,94,0.15); color:var(--green); }
  .ping-msg.err { background:rgba(239,68,68,0.15); color:var(--red); }
</style>
</head>
<body>
<div class="app">
  <div class="header">
    <h1>DaSiWa <span>Lightspeed v10</span></h1>
    <p>WAN 2.2 I2V / RTX 4090 / KJNodes Sage / v9.0</p>
  </div>

  <div class="card">
    <h2>Settings</h2>
    <label>RunPod API Key</label>
    <input type="password" id="apiKey" placeholder="rpa_xxxxxxxxxxxx">
    <div style="height:8px"></div>
    <label>Endpoint ID</label>
    <input type="text" id="endpointId" placeholder="xxxxxxxxxxxxxx">
    <div style="height:10px"></div>
    <div class="row">
      <button class="btn-secondary" id="saveBtn" style="flex:0 0 auto">Save</button>
      <button class="btn-secondary" id="pingBtn" style="flex:0 0 auto">Ping</button>
      <span id="pingMsg"></span>
    </div>
  </div>

  <div class="card">
    <h2>First Frame Image</h2>
    <div class="drop" id="drop">
      <p><strong>Drop / Click / Paste (Cmd+V)</strong></p>
      <p style="margin-top:6px">JPG / PNG / WebP</p>
    </div>
    <input type="file" id="fileInput" accept="image/*" style="display:none">
    <div id="previewWrap" style="margin-top:12px; display:none">
      <img id="preview" class="preview">
    </div>
  </div>

  <div class="card">
    <h2>Prompts</h2>
    <label>Positive</label>
    <textarea id="positive" placeholder="例: a young woman walking on the beach at sunset"></textarea>
    <div style="height:8px"></div>
    <label>Negative</label>
    <textarea id="negative">woman with penis, girl with cock, penis from pussy, bad anatomy, deformed anatomy, extra limbs, extra fingers, mutated hands, fused fingers, bad hands, poorly drawn hands, low quality, worst quality, jpeg artifacts, blurry, watermark, text, signature</textarea>
  </div>

  <div class="card">
    <h2>Parameters</h2>
    <div class="grid-3">
      <div><label>Width</label><input type="number" id="width" value="720" step="16"></div>
      <div><label>Height</label><input type="number" id="height" value="1280" step="16"></div>
      <div><label>Frames</label><input type="number" id="frames" value="81" step="4"></div>
    </div>
    <div style="height:10px"></div>
    <div class="grid-3">
      <div><label>FPS</label><input type="number" id="fps" value="16" min="8" max="30"></div>
      <div><label>CRF</label><input type="number" id="crf" value="19" min="14" max="30"></div>
      <div><label>Shift</label><input type="number" id="shift" value="5" step="0.5"></div>
    </div>
    <div style="height:10px"></div>
    <div class="grid-2">
      <div><label>Seed (-1 = random)</label><input type="number" id="seed" value="-1"></div>
      <div><label>Low Seed (固定推奨)</label><input type="number" id="lowSeed" value="42"></div>
    </div>
    <details style="margin-top:10px">
      <summary>LoRA strengths</summary>
      <div class="grid-2" style="margin-top:8px">
        <div><label>DR34ML4Y_HIGH</label><input type="number" id="loraHigh" value="0.5" step="0.05" min="0" max="2"></div>
        <div><label>DR34ML4Y_LOW</label><input type="number" id="loraLow" value="0.6" step="0.05" min="0" max="2"></div>
      </div>
    </details>
  </div>

  <div class="card">
    <h2>Google Drive</h2>
    <div class="check-row">
      <input type="checkbox" id="driveAutoSave">
      <label for="driveAutoSave" style="margin:0;color:var(--text);cursor:pointer">完成時に自動でDriveへ保存</label>
    </div>
    <div id="driveAuthMsg" style="margin-top:8px;font-size:11px;color:var(--dim)"></div>
    <div style="height:8px"></div>
    <button class="btn-secondary" id="driveLoginBtn" style="font-size:11px;padding:6px 12px">Drive 接続/再接続</button>
    <button class="btn-secondary" id="driveLogoutBtn" style="font-size:11px;padding:6px 12px;margin-left:6px">切断</button>
    <div style="margin-top:8px;font-size:10px;color:var(--dim)">Folder ID: 1ib6iQUTidpdYM7mDuwRCfwXcE0uwOAnw</div>
  </div>

  <button class="btn-large" id="runBtn">Generate Video</button>

  <div class="card" id="statusCard" style="display:none">
    <h2>Status <span id="statusBadge" class="status idle">IDLE</span></h2>
    <div id="statusDetail"></div>
    <div id="progressMsg"></div>
    <div id="cancelArea" style="margin-top:12px; display:none">
      <button class="btn-danger" id="cancelBtn">⛔ キャンセル</button>
    </div>
    <div id="resultWrap" style="margin-top:14px"></div>
    <details style="margin-top:10px"><summary>Log</summary><div class="log" id="log"></div></details>
  </div>

  <div class="footer">v9.0 / KJNodes PathchSageAttentionKJ / Drive AutoSave</div>
</div>

<script>
const $ = id => document.getElementById(id);
const log = msg => {
  const l = $('log');
  l.textContent += '['+new Date().toTimeString().slice(0,8)+'] '+msg+'\\n';
  l.scrollTop = l.scrollHeight;
};

const STATUS_LABELS = {
  idle:    { label: 'IDLE',           cls: 'idle',    jp: '待機中' },
  submit:  { label: 'SUBMITTING',     cls: 'queue',   jp: '送信中' },
  queue:   { label: 'IN_QUEUE',       cls: 'queue',   jp: 'キュー待機中' },
  running: { label: 'IN_PROGRESS',    cls: 'running', jp: '処理中' },
  done:    { label: 'COMPLETED',      cls: 'done',    jp: '完了' },
  failed:  { label: 'FAILED',         cls: 'error',   jp: '失敗' },
  cancel:  { label: 'CANCELLED',      cls: 'cancel',  jp: 'キャンセル' },
  error:   { label: 'ERROR',          cls: 'error',   jp: 'エラー' }
};

let currentJobId = null;

function setStatusBadge(key) {
  const s = STATUS_LABELS[key] || STATUS_LABELS.idle;
  const b = $('statusBadge');
  b.textContent = s.label + ' (' + s.jp + ')';
  b.className = 'status ' + s.cls;
  $('statusCard').style.display = 'block';
}

function updateStatusDetail(info) {
  const rows = [];
  if (info.jobId) {
    const short = info.jobId.length > 30 ? info.jobId.slice(0, 28) + '...' : info.jobId;
    rows.push('<div class="det-row"><span class="label">Job ID</span><span class="value">' + short + '</span></div>');
  }
  if (info.workerId) {
    rows.push('<div class="det-row"><span class="label">Worker ID</span><span class="value highlight">' + info.workerId + '</span></div>');
  } else if (info.status === 'running' || info.status === 'queue') {
    rows.push('<div class="det-row"><span class="label">Worker ID</span><span class="value" style="color:var(--dim)">割当待機中...</span></div>');
  }
  if (info.queueTime != null) rows.push('<div class="det-row"><span class="label">Queue待機</span><span class="value">' + info.queueTime.toFixed(1) + 's</span></div>');
  if (info.execTime != null) rows.push('<div class="det-row"><span class="label">実行時間</span><span class="value highlight">' + info.execTime.toFixed(1) + 's</span></div>');
  if (info.totalElapsed != null) rows.push('<div class="det-row"><span class="label">合計経過</span><span class="value">' + info.totalElapsed.toFixed(1) + 's</span></div>');
  $('statusDetail').innerHTML = rows.length ? '<div class="status-detail">' + rows.join('') + '</div>' : '';
}

function setProgressMsg(msg) {
  if (!msg) { $('progressMsg').innerHTML = ''; return; }
  $('progressMsg').innerHTML = '<div class="progress-msg"><span class="spinner"></span><span>' + msg + '</span></div>';
}

function estimateProgressPhase(execSec, status) {
  if (status === 'queue') return 'キュー待機中';
  if (status === 'running') {
    if (execSec < 10) return 'Cold Start中';
    if (execSec < 30) return 'モデルロード中';
    if (execSec < 70) return 'High側サンプリング中';
    if (execSec < 110) return 'Low側サンプリング中';
    if (execSec < 130) return 'VAE Decode中';
    return '動画エンコード中';
  }
  return '';
}

['apiKey','endpointId'].forEach(k => { $(k).value = localStorage.getItem(k) || ''; });
$('driveAutoSave').checked = localStorage.getItem('driveAutoSave') === '1';
$('driveAutoSave').onchange = () => { localStorage.setItem('driveAutoSave', $('driveAutoSave').checked ? '1' : '0'); };
$('saveBtn').onclick = () => {
  ['apiKey','endpointId'].forEach(k => localStorage.setItem(k, $(k).value));
  $('saveBtn').textContent = 'Saved';
  setTimeout(() => $('saveBtn').textContent = 'Save', 1500);
};

$('pingBtn').onclick = async () => {
  const apiKey = $('apiKey').value.trim();
  const endpointId = $('endpointId').value.trim();
  const msg = $('pingMsg');
  if (!apiKey || !endpointId) { msg.textContent='API Key/Endpoint ID 必須'; msg.className='ping-msg err'; return; }
  msg.textContent = '...'; msg.className = 'ping-msg';
  try {
    const r = await fetch('/v2/' + endpointId + '/health', { headers: { 'Authorization': 'Bearer ' + apiKey }});
    const d = await r.json();
    const w = d.workers || {}; const j = d.jobs || {};
    msg.textContent = 'OK | ready=' + (w.ready||0) + ' running=' + (w.running||0) + ' idle=' + (w.idle||0) + ' throttled=' + (w.throttled||0) + ' | queue=' + (j.inQueue||0) + ' progress=' + (j.inProgress||0);
    msg.className = 'ping-msg ok';
  } catch (e) {
    msg.textContent = 'NG: ' + e.message; msg.className = 'ping-msg err';
  }
};

$('cancelBtn').onclick = async () => {
  if (!currentJobId) return;
  if (!confirm('キャンセルしますか?')) return;
  const apiKey = $('apiKey').value.trim();
  const endpointId = $('endpointId').value.trim();
  try {
    await fetch('/v2/' + endpointId + '/cancel/' + currentJobId, { method: 'POST', headers: { 'Authorization': 'Bearer ' + apiKey }});
    setStatusBadge('cancel'); setProgressMsg(null);
    $('cancelArea').style.display = 'none';
    $('runBtn').disabled = false;
  } catch (e) { log('Cancel error: ' + e.message); }
};

let imageB64 = null, imageName = null;
const drop = $('drop'), fileInput = $('fileInput');
drop.onclick = () => fileInput.click();
drop.ondragover = e => { e.preventDefault(); drop.classList.add('drag'); };
drop.ondragleave = () => drop.classList.remove('drag');
drop.ondrop = e => { e.preventDefault(); drop.classList.remove('drag'); handleFile(e.dataTransfer.files[0]); };
fileInput.onchange = e => handleFile(e.target.files[0]);
window.addEventListener('paste', e => {
  for (const item of e.clipboardData.items) {
    if (item.type.startsWith('image/')) handleFile(item.getAsFile());
  }
});
function handleFile(file) {
  if (!file || !file.type.startsWith('image/')) return;
  imageName = 'input_' + Date.now() + '.' + (file.type.split('/')[1] || 'jpg');
  const reader = new FileReader();
  reader.onload = e => {
    imageB64 = e.target.result.split(',')[1];
    $('preview').src = e.target.result;
    $('previewWrap').style.display = 'block';
    drop.style.display = 'none';
  };
  reader.readAsDataURL(file);
}

// === [v9.0] workflow with PathchSageAttentionKJ injection ===
function buildWorkflow(p) {
  const seedHigh = p.seed === -1 ? Math.floor(Math.random() * 1e15) : p.seed;
  return {
    "1": { class_type: "LoadImage", inputs: { image: imageName, upload: "image" } },
    "2": { class_type: "CLIPLoader", inputs: { clip_name: "umt5_xxl_fp8_e4m3fn_scaled.safetensors", type: "wan", device: "default" } },
    "3": { class_type: "CLIPTextEncode", inputs: { text: p.positive, clip: ["2", 0] } },
    "4": { class_type: "CLIPTextEncode", inputs: { text: p.negative, clip: ["2", 0] } },
    "5": { class_type: "VAELoader", inputs: { vae_name: "wan_2.1_vae.safetensors" } },
    "6": { class_type: "UNETLoader", inputs: { unet_name: "Dasiwa_Lightspeedboundbitev10High.safetensors", weight_dtype: "default" } },
    "7": { class_type: "UNETLoader", inputs: { unet_name: "Dasiwa_Lightspeedboundbitev10Low.safetensors", weight_dtype: "default" } },
    "10": { class_type: "ModelSamplingSD3", inputs: { shift: p.shift, model: ["6", 0] } },
    "11": { class_type: "ModelSamplingSD3", inputs: { shift: p.shift, model: ["7", 0] } },
    "8":  { class_type: "LoraLoaderModelOnly", inputs: { lora_name: "DR34ML4Y_HIGH.safetensors", strength_model: p.loraHigh, model: ["10", 0] } },
    "9":  { class_type: "LoraLoaderModelOnly", inputs: { lora_name: "DR34ML4Y_LOW.safetensors",  strength_model: p.loraLow,  model: ["11", 0] } },
    // === v9.0 NEW: PathchSageAttentionKJ ノード (High側 / Low側) ===
    "200": { class_type: "PathchSageAttentionKJ", inputs: { model: ["8", 0], sage_attention: "auto" } },
    "201": { class_type: "PathchSageAttentionKJ", inputs: { model: ["9", 0], sage_attention: "auto" } },
    "12": { class_type: "WanImageToVideo", inputs: {
      width: p.width, height: p.height, length: p.frames, batch_size: 1,
      positive: ["3", 0], negative: ["4", 0], vae: ["5", 0], start_image: ["1", 0]
    } },
    "13": { class_type: "KSamplerAdvanced", inputs: {
      add_noise: "enable", noise_seed: seedHigh, steps: 4, cfg: 1,
      sampler_name: "euler", scheduler: "simple",
      start_at_step: 0, end_at_step: 2, return_with_leftover_noise: "enable",
      model: ["200", 0],  // ← Sage Patch経由
      positive: ["12", 0], negative: ["12", 1], latent_image: ["12", 2]
    } },
    "14": { class_type: "KSamplerAdvanced", inputs: {
      add_noise: "disable", noise_seed: p.lowSeed, steps: 4, cfg: 1,
      sampler_name: "euler", scheduler: "simple",
      start_at_step: 2, end_at_step: 10000, return_with_leftover_noise: "disable",
      model: ["201", 0],  // ← Sage Patch経由
      positive: ["12", 0], negative: ["12", 1], latent_image: ["13", 0]
    } },
    "15": { class_type: "VAEDecode", inputs: { samples: ["14", 0], vae: ["5", 0] } },
    "16": { class_type: "VHS_VideoCombine", inputs: {
      images: ["15", 0],
      frame_rate: p.fps, loop_count: 0, filename_prefix: "wan22_dasiwa",
      format: "video/h264-mp4", pix_fmt: "yuv420p", crf: p.crf,
      save_metadata: true, trim_to_audio: false, pingpong: false, save_output: true
    } }
  };
}

async function pollWithRetry(endpointId, jobId, apiKey, onTick) {
  const startTime = Date.now();
  const MAX_TIME = 600000;
  let consecutiveFails = 0;
  const MAX_FAILS = 3;
  let interval = 3000;
  let lastWorkerId = null;

  while (true) {
    if (Date.now() - startTime > MAX_TIME) throw new Error('Timeout (10min)');
    await new Promise(r => setTimeout(r, interval));
    const totalElapsed = (Date.now() - startTime) / 1000;
    try {
      const res = await fetch('/v2/' + endpointId + '/status/' + jobId, { headers: { 'Authorization': 'Bearer ' + apiKey }});
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      consecutiveFails = 0; interval = 3000;
      if (data.workerId) lastWorkerId = data.workerId;
      const queueSec = data.delayTime != null ? data.delayTime / 1000 : null;
      const execSec = data.executionTime != null ? data.executionTime / 1000 : null;
      onTick({ status: data.status, jobId: jobId, workerId: lastWorkerId, queueTime: queueSec, execTime: execSec, totalElapsed: totalElapsed });
      if (data.status === 'COMPLETED') return { ok: true, data, elapsed: totalElapsed.toFixed(0), workerId: lastWorkerId };
      if (data.status === 'FAILED' || data.status === 'CANCELLED') return { ok: false, data, elapsed: totalElapsed.toFixed(0), workerId: lastWorkerId };
    } catch (e) {
      consecutiveFails++;
      log('Poll fail #' + consecutiveFails + ' (' + e.message + ')');
      if (consecutiveFails >= MAX_FAILS) throw new Error('Network failed: ' + e.message);
      interval = Math.min(interval * 2, 15000);
    }
  }
}

$('runBtn').onclick = async () => {
  const apiKey = $('apiKey').value.trim();
  const endpointId = $('endpointId').value.trim();
  if (!apiKey || !endpointId) { alert('API Key と Endpoint ID を設定してください'); return; }
  if (!imageB64) { alert('画像をアップロードしてください'); return; }
  if (!$('positive').value.trim()) { alert('Positive プロンプトを入力してください'); return; }

  const params = {
    positive: $('positive').value.trim(),
    negative: $('negative').value.trim(),
    width: +$('width').value, height: +$('height').value,
    frames: +$('frames').value, fps: +$('fps').value,
    crf: +$('crf').value, shift: +$('shift').value,
    seed: +$('seed').value, lowSeed: +$('lowSeed').value,
    loraHigh: +$('loraHigh').value, loraLow: +$('loraLow').value,
  };

  $('runBtn').disabled = true;
  $('resultWrap').innerHTML = ''; $('log').textContent = ''; $('statusDetail').innerHTML = '';
  setStatusBadge('submit');
  setProgressMsg('ジョブをRunPodに送信中...');

  const workflow = buildWorkflow(params);
  const payload = { input: { workflow: workflow, images: [{ name: imageName, image: imageB64 }] } };

  try {
    const submit = await fetch('/v2/' + endpointId + '/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey },
      body: JSON.stringify(payload)
    });
    const submitData = await submit.json();
    if (!submitData.id) throw new Error('No job id: ' + JSON.stringify(submitData));
    currentJobId = submitData.id;
    log('Job ID: ' + currentJobId);
    setStatusBadge('queue');
    updateStatusDetail({ jobId: currentJobId, status: 'queue' });
    setProgressMsg('キュー待機中');
    $('cancelArea').style.display = 'block';

    const result = await pollWithRetry(endpointId, currentJobId, apiKey, info => {
      const k = info.status === 'IN_QUEUE' ? 'queue' : info.status === 'IN_PROGRESS' ? 'running' : info.status === 'COMPLETED' ? 'done' : info.status === 'FAILED' ? 'failed' : info.status === 'CANCELLED' ? 'cancel' : 'running';
      setStatusBadge(k);
      updateStatusDetail({ jobId: info.jobId, workerId: info.workerId, queueTime: info.queueTime, execTime: info.execTime, totalElapsed: info.totalElapsed, status: k });
      setProgressMsg(estimateProgressPhase(info.execTime || 0, k));
      log(info.status + ' | exec=' + (info.execTime||0).toFixed(1) + 's | worker=' + (info.workerId||'-'));
    });

    $('cancelArea').style.display = 'none';

    if (result.ok) {
      setStatusBadge('done'); setProgressMsg(null);
      const finalExec = result.data.executionTime != null ? result.data.executionTime / 1000 : null;
      const finalQueue = result.data.delayTime != null ? result.data.delayTime / 1000 : null;
      updateStatusDetail({ jobId: currentJobId, workerId: result.workerId, queueTime: finalQueue, execTime: finalExec, totalElapsed: parseFloat(result.elapsed), status: 'done' });
      await renderResult(result.data, result.elapsed);
    } else {
      setStatusBadge('failed'); setProgressMsg(null);
      log('Error: ' + JSON.stringify(result.data));
    }
  } catch (e) {
    setStatusBadge('error'); setProgressMsg(null);
    $('cancelArea').style.display = 'none';
    log('Exception: ' + e.message);
  } finally {
    $('runBtn').disabled = false;
    currentJobId = null;
  }
};

let currentVideoBlob = null;
let currentFileName = null;

async function renderResult(data, elapsed) {
  const out = data.output;
  if (!out) { $('resultWrap').innerHTML = '<p style="color:var(--dim)">No output</p>'; return; }
  let videoSrc = null;
  currentFileName = 'wan22_dasiwa_' + new Date().toISOString().replace(/[:.]/g,'-').slice(0,19) + '.mp4';
  if (out.videos && out.videos.length) {
    const v = out.videos[0];
    videoSrc = v.data ? 'data:video/mp4;base64,' + v.data : v.url;
    if (v.filename) currentFileName = v.filename;
  } else if (out.message) videoSrc = 'data:video/mp4;base64,' + out.message;
  else if (Array.isArray(out)) {
    const v = out.find(x => x.type === 'video' || (x.filename||'').endsWith('.mp4'));
    if (v) videoSrc = v.data ? 'data:video/mp4;base64,' + v.data : v.url;
  }
  if (!videoSrc) {
    $('resultWrap').innerHTML = '<p style="color:var(--red)">Cannot parse output</p>';
    log('Output: ' + JSON.stringify(out).slice(0, 500));
    return;
  }

  if (videoSrc.startsWith('data:')) {
    const [meta, b64] = videoSrc.split(',');
    const bin = atob(b64);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    currentVideoBlob = new Blob([arr], { type: 'video/mp4' });
  } else {
    try { const r = await fetch(videoSrc); currentVideoBlob = await r.blob(); } catch (e) { log('Blob fetch fail: ' + e.message); }
  }

  $('resultWrap').innerHTML =
    '<div class="video-wrap">' +
    '<video controls autoplay loop muted playsinline src="' + videoSrc + '"></video>' +
    '<div class="meta"><span>' + elapsed + 's | ' + currentFileName + '</span></div>' +
    '<div class="actions">' +
      '<a href="' + videoSrc + '" download="' + currentFileName + '"><button>💾 PC保存</button></a>' +
      '<button class="btn-secondary" id="driveSaveBtn">☁ Driveに保存</button>' +
    '</div>' +
    '<div class="drive-status" id="driveStatus" style="display:none"></div>' +
    '</div>';

  $('driveSaveBtn').onclick = () => uploadToDrive(false);
  if ($('driveAutoSave').checked) { log('Auto Drive save'); uploadToDrive(true); }
}

const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive';
const DRIVE_FOLDER_ID = '1ib6iQUTidpdYM7mDuwRCfwXcE0uwOAnw';
let driveAccessToken = localStorage.getItem('drive_access_token') || '';
let driveTokenExpiry = parseInt(localStorage.getItem('drive_token_expiry') || '0', 10);

function updateDriveAuthMsg() {
  const m = $('driveAuthMsg');
  const now = Date.now();
  const cid = localStorage.getItem('drive_client_id') || '';
  if (!cid) { m.textContent = '未設定'; m.style.color = 'var(--dim)'; return; }
  if (driveAccessToken && driveTokenExpiry > now) {
    const mins = Math.floor((driveTokenExpiry - now) / 60000);
    m.textContent = '✓ 接続中 (残り約' + mins + '分)'; m.style.color = 'var(--green)';
  } else {
    m.textContent = '! 認証期限切れ'; m.style.color = 'var(--amber)';
  }
}
updateDriveAuthMsg();

$('driveLoginBtn').onclick = async () => { await ensureDriveAuth(true); updateDriveAuthMsg(); };
$('driveLogoutBtn').onclick = () => {
  localStorage.removeItem('drive_access_token');
  localStorage.removeItem('drive_token_expiry');
  driveAccessToken = ''; driveTokenExpiry = 0;
  updateDriveAuthMsg();
};

async function ensureDriveAuth(forceReauth) {
  const now = Date.now();
  if (!forceReauth && driveAccessToken && driveTokenExpiry > now + 60000) return true;
  let clientId = localStorage.getItem('drive_client_id') || '';
  if (!clientId) {
    clientId = prompt('Google Cloud Console の OAuth 2.0 クライアントID を入力\\n承認済み生成元: ' + window.location.origin + '\\n承認済みリダイレクト: ' + window.location.origin + '/oauth_callback');
    if (!clientId) return false;
    localStorage.setItem('drive_client_id', clientId.trim());
  }
  return new Promise(resolve => {
    const redirectUri = window.location.origin + '/oauth_callback';
    const url = 'https://accounts.google.com/o/oauth2/v2/auth?client_id=' + encodeURIComponent(clientId) + '&redirect_uri=' + encodeURIComponent(redirectUri) + '&response_type=token&scope=' + encodeURIComponent(DRIVE_SCOPE) + '&prompt=consent';
    const popup = window.open(url, 'drive_auth', 'width=500,height=600');
    if (!popup) { alert('ポップアップブロック'); resolve(false); return; }
    const handler = ev => {
      if (ev.origin !== window.location.origin) return;
      if (!ev.data || ev.data.type !== 'drive_oauth') return;
      window.removeEventListener('message', handler);
      if (popup && !popup.closed) popup.close();
      if (ev.data.access_token) {
        driveAccessToken = ev.data.access_token;
        driveTokenExpiry = Date.now() + (parseInt(ev.data.expires_in||'3600',10) * 1000);
        localStorage.setItem('drive_access_token', driveAccessToken);
        localStorage.setItem('drive_token_expiry', driveTokenExpiry.toString());
        updateDriveAuthMsg();
        resolve(true);
      } else resolve(false);
    };
    window.addEventListener('message', handler);
    setTimeout(() => { window.removeEventListener('message', handler); resolve(false); }, 120000);
  });
}

async function uploadToDrive(silent) {
  const status = $('driveStatus');
  if (!status) return;
  status.style.display = 'block';
  if (!currentVideoBlob) { status.className = 'drive-status err'; status.textContent = '動画データなし'; return; }
  status.className = 'drive-status busy';
  status.textContent = '☁ 認証確認中...';
  const ok = await ensureDriveAuth(false);
  if (!ok) { status.className = 'drive-status err'; status.textContent = '認証失敗'; return; }
  status.textContent = '☁ Drive アップロード中... (' + Math.round(currentVideoBlob.size/1024) + ' KB)';
  try {
    const metadata = { name: currentFileName, mimeType: 'video/mp4', parents: [DRIVE_FOLDER_ID] };
    const boundary = '-------DaSiWaBoundary' + Date.now();
    const delim = '\\r\\n--' + boundary + '\\r\\n';
    const closeDelim = '\\r\\n--' + boundary + '--';
    const metaPart = delim + 'Content-Type: application/json; charset=UTF-8\\r\\n\\r\\n' + JSON.stringify(metadata);
    const dataPart = delim + 'Content-Type: video/mp4\\r\\n\\r\\n';
    const blobBuf = await currentVideoBlob.arrayBuffer();
    const head = new TextEncoder().encode(metaPart + dataPart);
    const tail = new TextEncoder().encode(closeDelim);
    const body = new Uint8Array(head.length + blobBuf.byteLength + tail.length);
    body.set(head, 0); body.set(new Uint8Array(blobBuf), head.length); body.set(tail, head.length + blobBuf.byteLength);
    const r = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + driveAccessToken, 'Content-Type': 'multipart/related; boundary=' + boundary },
      body: body
    });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error?.message || ('HTTP '+r.status));
    status.className = 'drive-status ok';
    status.innerHTML = '✅ 保存できた! ' + j.name + ' <a href="' + j.webViewLink + '" target="_blank">Driveで開く</a>';
    log('Drive uploaded: ' + j.id);
  } catch (e) {
    status.className = 'drive-status err';
    status.textContent = '❌ Drive保存失敗: ' + e.message;
    log('Drive error: ' + e.message);
  }
}

document.addEventListener('visibilitychange', () => {
  if (!document.hidden) log('Tab visible');
});
</script>
</body>
</html>`;

const OAUTH_CALLBACK_HTML = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>OAuth Callback</title></head>
<body style="background:#0a0a0c;color:#e8e8ed;font-family:sans-serif;padding:40px;text-align:center">
<h2>認証処理中...</h2>
<script>
(function() {
  const hash = window.location.hash.slice(1);
  const params = new URLSearchParams(hash);
  const access_token = params.get('access_token');
  const expires_in = params.get('expires_in');
  if (window.opener && access_token) {
    window.opener.postMessage({ type: 'drive_oauth', access_token, expires_in }, window.location.origin);
    setTimeout(() => window.close(), 500);
  } else {
    document.body.innerHTML += '<p style="color:#ef4444">認証失敗</p>';
  }
})();
</script>
</body></html>`;

export default {
  async fetch(request) {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
    if (url.pathname === '/oauth_callback') {
      return new Response(OAUTH_CALLBACK_HTML, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
    }
    if (url.pathname.startsWith('/v2/')) {
      const target = 'https://api.runpod.ai' + url.pathname + url.search;
      const init = {
        method: request.method,
        headers: request.headers,
        body: request.method === 'GET' || request.method === 'HEAD' ? null : await request.arrayBuffer(),
      };
      const upstream = await fetch(target, init);
      const resp = new Response(upstream.body, upstream);
      Object.entries(CORS).forEach(([k, v]) => resp.headers.set(k, v));
      return resp;
    }
    return new Response(HTML, { headers: { 'Content-Type': 'text/html; charset=utf-8', ...CORS } });
  }
};
