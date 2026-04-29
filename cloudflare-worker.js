// ============================================================================
// DaSiWa WAN2.2 I2V Lightspeed v10 - Cloudflare Worker
// HTMLアプリ + RunPod API CORSプロキシ 統合版
// ============================================================================
// デプロイ: Cloudflare Dashboard -> Workers -> Edit Code -> 全削除 -> 貼付 -> Deploy
// アクセス: ブラウザで Worker URL を開き、API Key と Endpoint ID を入力
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
<title>DaSiWa Lightspeed v10 - I2V Studio</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Space+Mono:wght@400;700&display=swap');
  :root {
    --bg:#0a0a0c; --surface:#141418; --surface2:#1c1c22;
    --border:#2a2a33; --text:#e8e8ed; --dim:#6b6b7b;
    --accent:#6366f1; --accent2:#818cf8;
    --green:#22c55e; --amber:#f59e0b; --red:#ef4444;
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
  textarea { resize:vertical; min-height:60px; font-size:13px; font-family:inherit; }
  button { background:var(--accent); color:white; border:none; border-radius:8px;
    padding:11px 18px; font-family:inherit; font-weight:600; font-size:13px;
    cursor:pointer; transition:all 0.15s; }
  button:hover { background:var(--accent2); }
  button:disabled { opacity:0.4; cursor:not-allowed; }
  .btn-secondary { background:var(--surface2); color:var(--text); border:1px solid var(--border); }
  .btn-large { width:100%; padding:14px; font-size:14px; }
  .drop { background:var(--surface2); border:2px dashed var(--border); border-radius:var(--radius);
    padding:28px 20px; text-align:center; cursor:pointer; transition:all 0.15s; }
  .drop:hover, .drop.drag { border-color:var(--accent); background:var(--surface); }
  .drop p { color:var(--dim); font-size:12px; }
  .drop strong { color:var(--text); }
  .preview { max-width:100%; max-height:280px; border-radius:8px; display:block; margin:0 auto; }
  .status { display:inline-flex; align-items:center; gap:6px; padding:4px 10px; border-radius:6px;
    font-size:11px; font-weight:600; font-family:'Space Mono',monospace; }
  .status.idle { background:#2a2a33; color:var(--dim); }
  .status.running { background:rgba(245,158,11,0.15); color:var(--amber); }
  .status.done { background:rgba(34,197,94,0.15); color:var(--green); }
  .status.error { background:rgba(239,68,68,0.15); color:var(--red); }
  .video-wrap { background:var(--surface2); border-radius:var(--radius); padding:14px; margin-top:14px; }
  .video-wrap video { width:100%; border-radius:8px; display:block; }
  .video-wrap .meta { display:flex; justify-content:space-between; align-items:center; margin-top:10px;
    font-size:11px; color:var(--dim); }
  .video-wrap a { color:var(--accent2); text-decoration:none; font-weight:600; }
  .grid-3 { display:grid; grid-template-columns:repeat(3,1fr); gap:10px; }
  .grid-2 { display:grid; grid-template-columns:repeat(2,1fr); gap:10px; }
  @media (max-width:540px) { .grid-3, .grid-2 { grid-template-columns:1fr 1fr; } }
  details { background:var(--surface2); border:1px solid var(--border); border-radius:8px; padding:10px 14px; margin-top:10px; }
  details summary { cursor:pointer; font-size:11px; color:var(--dim); font-weight:600; }
  details[open] summary { margin-bottom:10px; }
  .log { font-family:'Space Mono',monospace; font-size:10px; color:var(--dim);
    background:var(--bg); padding:10px; border-radius:6px; max-height:140px;
    overflow-y:auto; white-space:pre-wrap; word-break:break-all; }
  .footer { text-align:center; color:var(--dim); font-size:10px; font-family:'Space Mono',monospace; margin-top:24px; }
</style>
</head>
<body>
<div class="app">
  <div class="header">
    <h1>DaSiWa <span>Lightspeed v10</span></h1>
    <p>WAN 2.2 I2V Studio / SageAttn 2.2 + Sparge</p>
  </div>

  <div class="card">
    <h2>Settings</h2>
    <label>RunPod API Key</label>
    <input type="password" id="apiKey" placeholder="rpa_xxxxxxxxxxxx">
    <div style="height:8px"></div>
    <label>Endpoint ID</label>
    <input type="text" id="endpointId" placeholder="xxxxxxxxxxxxxx">
    <div style="height:10px"></div>
    <button class="btn-secondary" id="saveBtn">Save</button>
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
    <label>Positive (シーン描写)</label>
    <textarea id="positive" placeholder="例: a young woman walking on the beach at sunset, gentle wind blowing her hair"></textarea>
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
        <div><label>DR34ML4Y_HIGH strength</label><input type="number" id="loraHigh" value="0.5" step="0.05" min="0" max="2"></div>
        <div><label>DR34ML4Y_LOW strength</label><input type="number" id="loraLow" value="0.6" step="0.05" min="0" max="2"></div>
      </div>
    </details>
  </div>

  <button class="btn-large" id="runBtn">Generate Video</button>

  <div class="card" id="statusCard" style="display:none">
    <h2>Status <span id="statusBadge" class="status idle">IDLE</span></h2>
    <div id="resultWrap"></div>
    <details style="margin-top:10px"><summary>Log</summary><div class="log" id="log"></div></details>
  </div>

  <div class="footer">SageAttention 2.2 + SpargeAttention / Network Volume</div>
</div>

<script>
const $ = id => document.getElementById(id);
const log = msg => { const l=$('log'); l.textContent += '['+new Date().toTimeString().slice(0,8)+'] '+msg+'\\n'; l.scrollTop=l.scrollHeight; };
const setStatus = (label, cls) => { const b=$('statusBadge'); b.textContent=label; b.className='status '+cls; $('statusCard').style.display='block'; };

// Settings persistence
['apiKey','endpointId'].forEach(k => { $(k).value = localStorage.getItem(k) || ''; });
$('saveBtn').onclick = () => {
  ['apiKey','endpointId'].forEach(k => localStorage.setItem(k, $(k).value));
  $('saveBtn').textContent = 'Saved'; setTimeout(() => $('saveBtn').textContent='Save', 1500);
};

// Image upload
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

// Build API workflow JSON
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
    "8": { class_type: "LoraLoaderModelOnly", inputs: { lora_name: "DR34ML4Y_HIGH.safetensors", strength_model: p.loraHigh, model: ["10", 0] } },
    "9": { class_type: "LoraLoaderModelOnly", inputs: { lora_name: "DR34ML4Y_LOW.safetensors", strength_model: p.loraLow, model: ["11", 0] } },
    "12": { class_type: "WanImageToVideo", inputs: {
      width: p.width, height: p.height, length: p.frames, batch_size: 1,
      positive: ["3", 0], negative: ["4", 0], vae: ["5", 0], start_image: ["1", 0]
    } },
    "13": { class_type: "KSamplerAdvanced", inputs: {
      add_noise: "enable", noise_seed: seedHigh, steps: 4, cfg: 1,
      sampler_name: "euler", scheduler: "simple",
      start_at_step: 0, end_at_step: 2, return_with_leftover_noise: "enable",
      model: ["8", 0], positive: ["12", 0], negative: ["12", 1], latent_image: ["12", 2]
    } },
    "14": { class_type: "KSamplerAdvanced", inputs: {
      add_noise: "disable", noise_seed: p.lowSeed, steps: 4, cfg: 1,
      sampler_name: "euler", scheduler: "simple",
      start_at_step: 2, end_at_step: 10000, return_with_leftover_noise: "disable",
      model: ["9", 0], positive: ["12", 0], negative: ["12", 1], latent_image: ["13", 0]
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

// Generate
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
  $('resultWrap').innerHTML = '';
  $('log').textContent = '';
  setStatus('SUBMITTING', 'running');
  log('Building workflow...');

  const workflow = buildWorkflow(params);
  const payload = {
    input: {
      workflow: workflow,
      images: [{ name: imageName, image: imageB64 }]
    }
  };

  try {
    log('POST /v2/' + endpointId + '/run');
    const submit = await fetch('/v2/' + endpointId + '/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey },
      body: JSON.stringify(payload)
    });
    const submitData = await submit.json();
    if (!submitData.id) throw new Error('No job id: ' + JSON.stringify(submitData));
    const jobId = submitData.id;
    log('Job ID: ' + jobId);
    setStatus('RUNNING', 'running');

    // Poll
    const start = Date.now();
    while (true) {
      await new Promise(r => setTimeout(r, 3000));
      const elapsed = ((Date.now() - start) / 1000).toFixed(0);
      log('Polling... ' + elapsed + 's');
      const res = await fetch('/v2/' + endpointId + '/status/' + jobId, {
        headers: { 'Authorization': 'Bearer ' + apiKey }
      });
      const data = await res.json();
      log('Status: ' + data.status);
      if (data.status === 'COMPLETED') {
        setStatus('DONE (' + elapsed + 's)', 'done');
        renderResult(data, elapsed);
        break;
      } else if (data.status === 'FAILED' || data.status === 'CANCELLED') {
        setStatus('FAILED', 'error');
        log('Error: ' + JSON.stringify(data));
        break;
      }
      if (Date.now() - start > 600000) { setStatus('TIMEOUT', 'error'); break; }
    }
  } catch (e) {
    setStatus('ERROR', 'error');
    log('Exception: ' + e.message);
  } finally {
    $('runBtn').disabled = false;
  }
};

function renderResult(data, elapsed) {
  const out = data.output;
  if (!out) { $('resultWrap').innerHTML = '<p style="color:var(--dim)">No output</p>'; return; }
  let videoSrc = null, fileName = 'wan22_' + Date.now() + '.mp4';
  // RunPod worker-comfyui returns videos in output.videos or output.message
  if (out.videos && out.videos.length) {
    const v = out.videos[0];
    videoSrc = v.data ? 'data:video/mp4;base64,' + v.data : v.url;
    if (v.filename) fileName = v.filename;
  } else if (out.message) {
    videoSrc = 'data:video/mp4;base64,' + out.message;
  } else if (Array.isArray(out)) {
    const v = out.find(x => x.type === 'video' || x.filename?.endsWith('.mp4'));
    if (v) videoSrc = v.data ? 'data:video/mp4;base64,' + v.data : v.url;
  }
  if (!videoSrc) {
    $('resultWrap').innerHTML = '<p style="color:var(--red)">Cannot parse output. See log.</p>';
    log('Output: ' + JSON.stringify(out).slice(0, 500));
    return;
  }
  $('resultWrap').innerHTML =
    '<div class="video-wrap">' +
    '<video controls autoplay loop muted playsinline src="' + videoSrc + '"></video>' +
    '<div class="meta"><span>' + elapsed + 's</span>' +
    '<a href="' + videoSrc + '" download="' + fileName + '">Download</a></div></div>';
}
</script>
</body>
</html>`;

export default {
  async fetch(request) {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });

    // RunPod API proxy
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

    // HTML serve
    return new Response(HTML, { headers: { 'Content-Type': 'text/html; charset=utf-8', ...CORS } });
  }
};
