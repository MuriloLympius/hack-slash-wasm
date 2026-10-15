// Ponte navegador ↔ game.wasm: input, câmera, desenho do buffer de comandos, áudio e vibração.
const RW = 960, RH = 540;
const LABELS = ['ESPADA', 'MACHADO', 'LANÇA', 'PISTOLA', 'RIFLE', 'ESCOPETA', 'SALA LIMPA', 'MINI-BOSS', 'BOSS',
  'VOCÊ MORREU', 'VITÓRIA!', 'toque ou R para jogar de novo', 'RECARREGANDO', 'escolha sua arma',
  'LÂMINA DO ECLIPSE', 'MACHADO TECTÔNICO', 'ESCOPETA DO DRAGÃO', 'BOTAS LIGEIRAS', 'CORAÇÃO DE FERRO', 'LUVA DA FÚRIA',
  '+15% de velocidade', '+1 coração máximo', '+25% de dano', 'golpe forte solta uma onda', '3º golpe racha o chão',
  'tiros incendeiam', 'LOJA', 'TESOURO', 'PASSAGEM ABERTA', 'ANDAR',
  'ESCUDO', 'toque na hora para aparar; aparou, pode de novo', 'FÚRIA!', 'APARADO!', 'GODRUN',
  'ESPADA DE CHOQUE', '3º golpe marca o chão; o próximo liga as marcas com um raio',
  'ADAGAS', '6 golpes rápidos com veneno; o último teleporta e apunhala',
  'MARTELO', 'giro, pancada reta que atordoa e giro que arremessa contra a parede',
  'LUVA DE BOXE', 'soco, jab, soco e um uppercut que avança',
  'FOICE', 'puxão que atordoa; pós-dash arremessa para trás'];  // mesma ordem do enum L_*/D_* em game.c

const { instance } = await WebAssembly.instantiate(await (await fetch('game.wasm')).arrayBuffer());
const g = instance.exports;
g.init((Math.random() * 2 ** 32) >>> 0);
globalThis.game = g;  // acesso pelo console e pelos testes de navegador

const cv = document.getElementById('c');
const ctx = cv.getContext('2d', { alpha: false });
let W = 0, H = 0, dpr = 1;
function resize() {
  dpr = Math.min(devicePixelRatio || 1, 2);
  W = cv.clientWidth; H = cv.clientHeight;
  cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
}
addEventListener('resize', resize);
resize();

// ---------------------------------------------------------------- opções e pausa
// Opções ficam no navegador (localStorage pode falhar em aba privada: aí valem os padrões).
const opts = { vol: 80, tremor: true, vibra: true, contato: false, god: false };
try { Object.assign(opts, JSON.parse(localStorage.getItem('hs-opcoes')) || {}); } catch {}
const saveOpts = () => { try { localStorage.setItem('hs-opcoes', JSON.stringify(opts)); } catch {} };
const $ = id => document.getElementById(id);
let paused = false;
function setPaused(on) {
  paused = on;
  $('menu').classList.toggle('on', on);
  $('pb').style.display = on ? 'none' : '';
  keys.clear(); mouse.l = mouse.r = false; touch.held.clear(); touch.stick = null;
  if (ac) on ? ac.suspend() : ac.resume();
  if (on) $('mContinuar').focus();
}
$('mVol').value = opts.vol; $('mTremor').checked = opts.tremor; $('mVibra').checked = opts.vibra;
$('mVol').oninput = e => { opts.vol = +e.target.value; if (master) master.gain.value = opts.vol / 100; saveOpts(); };
$('mTremor').onchange = e => { opts.tremor = e.target.checked; saveOpts(); };
$('mVibra').onchange = e => { opts.vibra = e.target.checked; saveOpts(); };
$('mContato').checked = opts.contato;
g.opt(0, opts.contato ? 1 : 0);
$('mGod').checked = opts.god;
$('mGod').onchange = e => {  // liga/desliga e recomeça a run para valer
  opts.god = e.target.checked; g.opt(1, opts.god ? 1 : 0); saveOpts();
  g.init((Math.random() * 2 ** 32) >>> 0); setPaused(false);
};
if (opts.god) { g.opt(1, 1); g.init((Math.random() * 2 ** 32) >>> 0); }
$('mContato').onchange = e => { opts.contato = e.target.checked; g.opt(0, opts.contato ? 1 : 0); saveOpts(); };
$('mContinuar').onclick = () => setPaused(false);
$('mRecomecar').onclick = () => { g.init((Math.random() * 2 ** 32) >>> 0); setPaused(false); };
$('pb').onclick = () => setPaused(true);
document.addEventListener('visibilitychange', () => { if (document.hidden) setPaused(true); });

// ---------------------------------------------------------------- input
const keys = new Set();
const mouse = { x: 0, y: 0, l: false, r: false, used: false };
addEventListener('keydown', e => {
  if (e.code === 'Escape' || e.code === 'KeyP') { setPaused(!paused); e.preventDefault(); return; }
  if (paused) return;
  keys.add(e.code);
  if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault();
  unlockAudio();
});
addEventListener('keyup', e => keys.delete(e.code));
addEventListener('blur', () => { keys.clear(); mouse.l = mouse.r = false; });
cv.addEventListener('contextmenu', e => e.preventDefault());

// toque: analógico flutuante à esquerda, botões à direita
const touch = { on: false, stick: null, held: new Map(), tap: false };
const buttons = () => {
  const R = Math.max(34, Math.min(62, Math.min(W, H) * 0.11));
  const escudo = g.get(39, 0) === 9;
  return [
    ...(escudo ? [] : [{ bit: 16, label: 'RECARGA', x: W - R * 3.9, y: H - R * 2.75, r: R * 0.55, col: '#d0c8e0' }]),
    { bit: 1, label: 'GOLPE', x: W - R * 1.5, y: H - R * 1.6, r: R * 1.15, col: '#46e0ff' },
    { bit: 2, label: g.get(39, 0) === 9 ? 'ESCUDO' : 'TIRO', x: W - R * 3.9, y: H - R * 1.1, r: R * 0.9, col: '#ffe066' },
    { bit: 4, label: 'DASH', x: W - R * 1.3, y: H - R * 4.1, r: R * 0.8, col: '#b06cff' },
  ];
};
cv.addEventListener('pointerdown', e => {
  unlockAudio();
  if (e.pointerType === 'mouse') {
    mouse.used = true;
    if (e.button === 0) mouse.l = true;
    if (e.button === 2) mouse.r = true;
    return;
  }
  e.preventDefault();
  if (!touch.on) { touch.on = true; document.documentElement.requestFullscreen?.().catch(() => {}); }
  touch.tap = true;
  cv.setPointerCapture(e.pointerId);
  const b = buttons().find(b => Math.hypot(e.clientX - b.x, e.clientY - b.y) < b.r * 1.3);
  if (b) touch.held.set(e.pointerId, b.bit);
  else if (!touch.stick && e.clientX < W * 0.55)
    touch.stick = { id: e.pointerId, sx: e.clientX, sy: e.clientY, x: e.clientX, y: e.clientY };
});
cv.addEventListener('pointermove', e => {
  if (e.pointerType === 'mouse') { mouse.x = e.clientX; mouse.y = e.clientY; mouse.used = true; return; }
  const s = touch.stick;
  if (!s || s.id !== e.pointerId) return;
  s.x = e.clientX; s.y = e.clientY;
  const max = Math.min(W, H) * 0.12, dx = s.x - s.sx, dy = s.y - s.sy, d = Math.hypot(dx, dy);
  if (d > max) { s.sx = s.x - dx / d * max; s.sy = s.y - dy / d * max; }  // base acompanha o dedo
});
const release = e => {
  if (e.pointerType === 'mouse') {
    if (e.button === 0) mouse.l = false;
    if (e.button === 2) mouse.r = false;
    return;
  }
  touch.held.delete(e.pointerId);
  if (touch.stick?.id === e.pointerId) touch.stick = null;
};
addEventListener('pointerup', release);
addEventListener('pointercancel', release);

// ---------------------------------------------------------------- áudio sintetizado
let ac, noise, master;
function unlockAudio() {
  if (ac) { if (ac.state === 'suspended' && !paused) ac.resume(); return; }
  ac = new AudioContext();
  master = ac.createGain(); master.gain.value = opts.vol / 100; master.connect(ac.destination);
  noise = ac.createBuffer(1, ac.sampleRate * 0.5, ac.sampleRate);
  const d = noise.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
}
function env(vol, dur) {
  const gn = ac.createGain(), t = ac.currentTime;
  gn.gain.setValueAtTime(vol, t);
  gn.gain.exponentialRampToValueAtTime(0.001, t + dur);
  gn.connect(master);
  return gn;
}
function tone(f0, f1, dur, type, vol) {
  const o = ac.createOscillator(), t = ac.currentTime;
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  o.connect(env(vol, dur));
  o.start(t); o.stop(t + dur);
}
function hiss(dur, vol, freq) {
  const s = ac.createBufferSource(), f = ac.createBiquadFilter();
  s.buffer = noise; f.type = 'lowpass'; f.frequency.value = freq;
  s.connect(f); f.connect(env(vol, dur));
  s.start(ac.currentTime, Math.random() * 0.3, dur);
}
const SFX = {
  1: () => { hiss(0.05, 0.2, 3000); tone(260, 120, 0.05, 'square', 0.05); },
  2: () => { hiss(0.14, 0.45, 1400); tone(150, 40, 0.16, 'sawtooth', 0.18); },
  3: () => { hiss(0.09, 0.25, 2200); tone(520, 140, 0.08, 'triangle', 0.1); },
  4: () => { hiss(0.5, 0.6, 900); tone(120, 30, 0.5, 'sawtooth', 0.25); },
  5: () => SWING[g.get(61, 0)]?.(),
  6: () => { hiss(0.06, 0.2, 4000); tone(700, 200, 0.05, 'square', 0.05); },
  7: () => { hiss(0.04, 0.15, 5000); tone(900, 300, 0.03, 'square', 0.03); },
  8: () => { hiss(0.2, 0.45, 1600); tone(200, 50, 0.15, 'sawtooth', 0.12); },
  9: () => hiss(0.12, 0.12, 1200),
  10: () => { tone(300, 60, 0.25, 'sawtooth', 0.2); hiss(0.2, 0.3, 800); },
  11: () => tone(180, 90, 0.12, 'triangle', 0.1),
  12: () => { tone(500, 1000, 0.1, 'triangle', 0.12); tone(750, 1500, 0.14, 'sine', 0.08); },
  13: () => tone(420, 260, 0.08, 'sine', 0.05),
  14: () => { tone(80, 40, 0.9, 'sawtooth', 0.25); hiss(0.6, 0.25, 500); },
  15: () => { tone(400, 800, 0.15, 'triangle', 0.12); tone(600, 1200, 0.25, 'sine', 0.08); },
  16: () => tone(300, 500, 0.1, 'square', 0.04),
  17: () => { hiss(0.2, 0.4, 600); tone(90, 40, 0.2, 'sine', 0.3); },
  18: () => tone(1200, 1800, 0.06, 'triangle', 0.08),
  19: () => { tone(1500, 1500, 0.05, 'square', 0.04); tone(2000, 2000, 0.09, 'square', 0.03); },  // moeda
  20: () => { hiss(0.45, 0.6, 700); tone(140, 35, 0.4, 'sawtooth', 0.22); },  // explosão
  21: () => { tone(220, 110, 0.12, 'square', 0.12); hiss(0.1, 0.25, 2500); },    // bloqueio
  22: () => { tone(1800, 2400, 0.08, 'triangle', 0.14); tone(900, 1800, 0.18, 'sine', 0.1); },  // aparar
  23: () => { tone(60, 30, 1.0, 'sawtooth', 0.3); hiss(0.9, 0.5, 1200); tone(1200, 300, 0.6, 'square', 0.06); },  // fúria
  24: () => tone(500 + Math.random() * 50, 900, 0.06, 'triangle', 0.06),       // nível de carga
  25: () => { hiss(0.25, 0.35, 6000); tone(1400, 200, 0.2, 'sawtooth', 0.08); },  // raio
  26: () => { tone(300, 1500, 0.08, 'sine', 0.1); hiss(0.08, 0.15, 4000); },      // teleporte das adagas
  27: () => tone(220, 520, 0.12, 'triangle', 0.07),                               // antecipação do golpe final
};
// som do golpe pela forma da arma branca (W_SWORD, W_AXE, W_SPEAR, W_DAGGERS=11, W_HAMMER, W_GLOVE, W_SCYTHE)
const SWING = {
  0: () => { hiss(0.08, 0.14, 5500); tone(1400, 700, 0.06, 'sine', 0.03); },        // espada: sibila
  1: () => { hiss(0.14, 0.2, 900); tone(140, 70, 0.12, 'triangle', 0.08); },        // machado: vuum grave
  2: () => hiss(0.05, 0.14, 6500),                                                 // lança: corte seco
  11: () => { hiss(0.04, 0.08, 7000); tone(2400, 1800, 0.04, 'triangle', 0.03); tone(3000, 2500, 0.05, 'sine', 0.02); },  // adagas: tilintam
  12: () => { hiss(0.18, 0.22, 600); tone(90, 50, 0.16, 'sawtooth', 0.07); },       // martelo: peso
  13: () => { hiss(0.06, 0.12, 1800); tone(220, 120, 0.05, 'square', 0.04); },      // luva: estalo abafado
  14: () => { hiss(0.22, 0.14, 3000); tone(900, 400, 0.2, 'sine', 0.03); },         // foice: assobio longo
};
const VIBE = { 2: 18, 4: 70, 10: 60, 17: 25, 20: 40, 21: 30, 22: 25, 23: 160 };  // forte, morte grande, dano, investida na parede

function handleEvents() {
  const n = g.ev_count();
  if (!n) return;
  const evs = new Int32Array(instance.exports.memory.buffer, g.ev_ptr(), n);
  const seen = new Set(evs);
  let vibe = 0;
  for (const e of seen) {
    if (ac) SFX[e]?.();
    vibe = Math.max(vibe, VIBE[e] || 0);
  }
  if (vibe && touch.on && opts.vibra) navigator.vibrate?.(vibe);
}

// ---------------------------------------------------------------- desenho
const colors = new Map();
const css = c => colors.get(c) ?? (colors.set(c, '#' + c.toString(16).padStart(6, '0')), colors.get(c));
const TAU = Math.PI * 2;

function camera() {
  let s = Math.min(W / RW, H / RH);
  if (H > W) s = Math.max(s, W / 620);  // retrato: aproxima e a câmera segue o jogador
  const vw = W / s, vh = H / s, px = g.get(16, 0), py = g.get(17, 0);
  const cx = vw >= RW ? RW / 2 : Math.min(Math.max(px, vw / 2), RW - vw / 2);
  const cy = vh >= RH ? RH / 2 : Math.min(Math.max(py, vh / 2), RH - vh / 2);
  const sh = opts.tremor ? 1 : 0;
  return { s, cx: cx + g.get(19, 0) * sh, cy: cy + g.get(20, 0) * sh };
}

function draw(cam) {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = '#0e0c13';
  ctx.fillRect(0, 0, W, H);
  ctx.setTransform(dpr * cam.s, 0, 0, dpr * cam.s, dpr * (W / 2 - cam.cx * cam.s), dpr * (H / 2 - cam.cy * cam.s));
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineCap = 'round';
  const n = g.cmd_count(), f = new Float32Array(instance.exports.memory.buffer, g.cmd_ptr(), n * 9);
  for (let o = 0; o < n * 9; o += 9) {
    const t = f[o], x = f[o + 1], y = f[o + 2], a = f[o + 3], b = f[o + 4], c = f[o + 5], d = f[o + 6];
    const col = css(f[o + 7]);
    ctx.globalAlpha = f[o + 8];
    switch (t) {
      case 0: ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(x, y, Math.max(a, 0), Math.max(b, 0), c, 0, TAU); ctx.fill(); break;
      case 1:
        ctx.fillStyle = col;
        if (c === 0) { ctx.fillRect(x - a / 2, y - b / 2, a, b); break; }
        ctx.save(); ctx.translate(x, y); ctx.rotate(c); ctx.fillRect(-a / 2, -b / 2, a, b); ctx.restore();
        break;
      case 2: ctx.strokeStyle = col; ctx.lineWidth = c; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(a, b); ctx.stroke(); break;
      case 3: ctx.strokeStyle = col; ctx.lineWidth = b; ctx.lineCap = 'butt'; ctx.beginPath(); ctx.arc(x, y, Math.max(a, 0), c, d); ctx.stroke(); ctx.lineCap = 'round'; break;
      case 4: case 6: {
        const txt = t === 4 ? String(Math.round(a * 10) / 10) : LABELS[a];
        ctx.font = `800 ${b}px system-ui, sans-serif`;
        ctx.strokeStyle = '#0b0910'; ctx.lineWidth = b * 0.22; ctx.lineCap = 'round';
        ctx.strokeText(txt, x, y);
        ctx.fillStyle = col; ctx.fillText(txt, x, y);
        break;
      }
      case 5: ctx.setTransform(dpr, 0, 0, dpr, 0, 0); break;
      case 7: {  // vinheta: transparente no centro, cor nas bordas (a = raio interno relativo)
        const r = Math.hypot(W, H) / 2, gr = ctx.createRadialGradient(x, y, r * a, x, y, r);
        gr.addColorStop(0, col + '00'); gr.addColorStop(1, col);
        ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H);
        break;
      }
    }
  }
  ctx.globalAlpha = 1;
  if (touch.on) drawTouch();
}

function drawTouch() {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const s = touch.stick;
  if (s) {
    const max = Math.min(W, H) * 0.12;
    ctx.globalAlpha = 0.25; ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(s.sx, s.sy, max, 0, TAU); ctx.fill();
    ctx.globalAlpha = 0.6;
    ctx.beginPath(); ctx.arc(s.x, s.y, max * 0.45, 0, TAU); ctx.fill();
  }
  const held = new Set(touch.held.values());
  for (const b of buttons()) {
    ctx.globalAlpha = held.has(b.bit) ? 0.55 : 0.28;
    ctx.fillStyle = b.col;
    ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, TAU); ctx.fill();
    ctx.globalAlpha = 0.9; ctx.fillStyle = '#0b0910';
    ctx.font = `800 ${b.r * 0.32}px system-ui, sans-serif`;
    ctx.fillText(b.label, b.x, b.y);
  }
  ctx.globalAlpha = 1;
}

// ---------------------------------------------------------------- laço
let last = performance.now(), cam = camera();
function loop(now) {
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;
  const k = c => keys.has(c);
  let mx = (k('KeyD') || k('ArrowRight')) - (k('KeyA') || k('ArrowLeft'));
  let my = (k('KeyS') || k('ArrowDown')) - (k('KeyW') || k('ArrowUp'));
  const s = touch.stick;
  if (s) {
    const max = Math.min(W, H) * 0.12;
    mx = (s.x - s.sx) / max; my = (s.y - s.sy) / max;
  }
  let ax = 0, ay = 0;  // 0,0 = mira automática no inimigo mais próximo
  if (mouse.used && !touch.on) {
    ax = (mouse.x - W / 2) / cam.s + cam.cx - g.get(16, 0);
    ay = (mouse.y - H / 2) / cam.s + cam.cy - g.get(17, 0);
  }
  let btn = (mouse.l || k('KeyJ')) | ((mouse.r || k('KeyK')) << 1) | ((k('Space') || k('ShiftLeft') || k('KeyL')) << 2)
    | (touch.tap << 3) | (k('KeyR') << 4);
  for (const bit of touch.held.values()) btn |= bit;
  touch.tap = false;
  if (!paused) { g.frame(dt, W, H, mx, my, ax, ay, btn); handleEvents(); }
  cam = camera();
  draw(cam);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
