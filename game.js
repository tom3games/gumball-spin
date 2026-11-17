// ぐるぐるガムボール 本体
// 物理は台の座標で計算する。台が回ると、台から見た重力の向きが回る（ガムはいつも画面の下へ転がる）
;(function () {
  'use strict'
  window.__jsUp = true
  const T = 40                    // 1マスの大きさ（台の座標）
  const G = 820                   // 重力（人が回して操れる速さ。1500 だと門を通り過ぎた）
  const R0 = 12, RSTEP = 2.6, RMAX = 22   // ガムの半径: 元 12、1つ太るごとに +2.6。幅1マス（40）の門は3つ（19.8）まで通れ、4つ（22）で通れない
  const ROT_MAX = 6.5             // 台が回る速さの上限（rad/秒）
  const SWIPE = 2.6               // 画面の幅ぶんスワイプした時に回る角度（rad）
  const STEP = 1 / 60, SUB = 3
  const $ = id => document.getElementById(id)
  const STAGES = window.GB_STAGES, TXT = window.GB_TXT
  const store = { get(k, d) { try { const v = localStorage.getItem('gb_' + k); return v == null ? d : JSON.parse(v) } catch (e) { return d } }, set(k, v) { try { localStorage.setItem('gb_' + k, JSON.stringify(v)) } catch (e) {} } }
  const qs = new URLSearchParams(location.search)
  let lang = qs.get('lang') || store.get('lang', null) || ((navigator.language || 'ja').startsWith('ja') ? 'ja' : 'en')
  if (lang !== 'ja' && lang !== 'en') lang = 'ja'
  const L = () => TXT[lang]
  const touchDev = matchMedia('(pointer:coarse)').matches || 'ontouchstart' in window

  // ---------- 音 ----------
  Snd.def({
    coin: 'snd/coin.mp3', pop: ['snd/pop1.mp3', 'snd/pop2.mp3', 'snd/pop3.mp3'],
    hit: ['snd/hit1.mp3', 'snd/hit2.mp3', 'snd/hit3.mp3'], chute: 'snd/chute.mp3',
    chip: ['snd/chip1.mp3', 'snd/chip2.mp3'], squeak: 'snd/squeak.mp3',
    clear: 'snd/clear.mp3', final: 'snd/final.mp3', fail: 'snd/fail.mp3', goo: ['snd/goo1.mp3', 'snd/goo2.mp3'],
  })
  let muted = store.get('mute', false)
  Snd.setMute(muted)
  const SVG_ON = '<svg viewBox="0 0 24 24"><path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/></svg>'
  const SVG_OFF = '<svg viewBox="0 0 24 24"><path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M17 9l5 6M22 9l-5 6"/></svg>'
  function drawMute() { $('bMute').innerHTML = $('bMute2').innerHTML = muted ? SVG_OFF : SVG_ON }
  function toggleMute() { muted = !muted; store.set('mute', muted); Snd.init(); Snd.setMute(muted); drawMute() }
  function beds(on) {
    if (on) { Snd.loop('amb', 'snd/crowd.mp3', 0.13); Snd.loop('bgm', 'snd/bgm.mp3', 0.2); Snd.loop('hum', 'snd/hum.mp3', 0.06) }
    else { Snd.loop('hum', null) }
  }

  // ---------- 画面 ----------
  const views = ['vTitle', 'vPlay', 'vRes']
  function show(id) { for (const v of views) $(v).hidden = v !== id; S.view = id }

  function applyLang() {
    const t = L()
    document.documentElement.lang = lang
    $('tT1').textContent = t.title1; $('tT2').textContent = t.title2; $('tSub').textContent = t.sub
    $('tCoin').textContent = t.coin; $('bHow').textContent = t.how; $('bLang').textContent = t.lang
    $('bRetry').textContent = t.retry; $('bAgain').textContent = t.again; $('bPost').textContent = t.post; $('bSave').textContent = t.save
    $('howT').textContent = t.howTitle; $('bHowClose').textContent = t.close; $('loadTxt').textContent = t.loading
    const rows = t.howBody.slice(); if (!touchDev) rows[0] = t.howPC
    $('howList').innerHTML = rows.map(r => `<div><b>${r[0]}</b><span>${r[1]}</span></div>`).join('')
    $('howCred').textContent = t.credits
    const b = store.get('best', 0); $('tBest').textContent = b ? `${t.best} ${b}${lang === 'ja' ? '枚' : ''}` : ''
    if (S.view === 'vPlay') hudName()
  }

  // ---------- 状態 ----------
  const S = {
    view: 'vTitle', stage: 0, lives: 3, score: 0, stageScore: 0,
    grid: null, W: 0, H: 0, items: [],
    p: { x: 0, y: 0 }, v: { x: 0, y: 0 }, n: 0, r: R0, rv: R0, roll: 0,
    th: 0, tht: 0, thv: 0, spin: 0, cam: { x: 0, y: 0 },
    mode: 'idle', mt: 0, t: 0, eaten: 0, stuckT: 0, hintFat: false, nearSpike: 0, onGum: 0,
    tutDone: store.get('tut', 0), lastHit: 0, paused: false, bot: null, log: [],
  }
  window.__soundCalls = () => Snd.played

  function loadStage(i) {
    const st = STAGES[i]
    S.stage = i; S.grid = st.map.map(r => r.split('')); S.H = S.grid.length; S.W = S.grid[0].length
    S.items = []
    for (let y = 0; y < S.H; y++) for (let x = 0; x < S.W; x++) {
      const c = S.grid[y][x]
      if (c === 'S') { S.start = { x: (x + 0.5) * T, y: (y + 0.5) * T }; S.grid[y][x] = '.' }
      if (c === 'G') S.goal = { x: (x + 0.5) * T, y: (y + 0.5) * T, gx: x, gy: y }
      if (c === 'c' || c === 'm') { S.items.push({ k: c, x: (x + 0.5) * T, y: (y + 0.5) * T, on: true, ph: Math.random() * 6 }); S.grid[y][x] = '.' }
      if (c === 'w') S.items.push({ k: 'w', x: (x + 0.5) * T, y: (y + 0.5) * T, on: true, gx: x, gy: y })
    }
    resetBall()
    buildBoard()
    hudName()
  }
  function resetBall() {
    S.p.x = S.start.x; S.p.y = S.start.y; S.v.x = S.v.y = 0; S.n = 0; S.r = S.rv = R0; S.roll = 0
    S.th = S.tht = 0; S.thv = 0; S.spin = 0; S.cam.x = S.p.x; S.cam.y = S.p.y
    S.t = 0; S.eaten = 0; S.stuckT = 0; S.hintFat = false; S.onGum = 0
    for (const it of S.items) it.on = true
    // 床のガムを戻す
    for (const it of S.items) if (it.k === 'w') S.grid[it.gy][it.gx] = 'w'
  }
  const cell = (x, y) => (x < 0 || y < 0 || x >= S.W || y >= S.H) ? '#' : S.grid[y][x]
  const solid = c => c === '#' || c === '^'

  // ---------- 盤の絵（台の座標で1回だけ描いて使い回す） ----------
  let board = null, boardQ = 2
  function buildBoard() {
    boardQ = Math.min(2, Math.max(1, (window.devicePixelRatio || 1) * viewScale()))
    const pad = T
    const c = document.createElement('canvas'); c.width = Math.ceil((S.W * T + pad * 2) * boardQ); c.height = Math.ceil((S.H * T + pad * 2) * boardQ)
    const g = c.getContext('2d'); g.scale(boardQ, boardQ); g.translate(pad, pad)
    // 外側（筐体の中の暗がり）
    g.fillStyle = '#2b1712'; g.fillRect(-pad, -pad, S.W * T + pad * 2, S.H * T + pad * 2)
    // 奥の板: 有孔ボード
    g.fillStyle = '#efe3c8'; g.fillRect(0, 0, S.W * T, S.H * T)
    g.fillStyle = 'rgba(120,90,50,.22)'
    for (let y = 10; y < S.H * T; y += 20) for (let x = 10; x < S.W * T; x += 20) { g.beginPath(); g.arc(x, y, 2.2, 0, 7); g.fill() }
    // 取り出し口
    const gl = S.goal
    const gr = g.createRadialGradient(gl.x, gl.y, 2, gl.x, gl.y, 19)
    gr.addColorStop(0, '#050505'); gr.addColorStop(.7, '#1d1d1d'); gr.addColorStop(1, '#8d8f8c')
    g.fillStyle = gr; g.beginPath(); g.arc(gl.x, gl.y, 18, 0, 7); g.fill()
    g.strokeStyle = '#d9d9d4'; g.lineWidth = 3; g.beginPath(); g.arc(gl.x, gl.y, 18, 0, 7); g.stroke()
    // 壁: 赤い塗装の鉄。つながった塊として塗る
    g.fillStyle = '#a8261f'
    for (let y = 0; y < S.H; y++) for (let x = 0; x < S.W; x++) if (S.grid[y][x] === '#') g.fillRect(x * T - .5, y * T - .5, T + 1, T + 1)
    // 空きに面した辺に縁取りと照り
    for (let y = 0; y < S.H; y++) for (let x = 0; x < S.W; x++) {
      if (S.grid[y][x] !== '#') continue
      const X = x * T, Y = y * T
      const open = (dx, dy) => { const c2 = cell(x + dx, y + dy); return c2 !== '#' && !(x + dx < 0 || y + dy < 0 || x + dx >= S.W || y + dy >= S.H) }
      g.lineWidth = 3
      if (open(0, -1)) { g.strokeStyle = '#e0604f'; line(g, X, Y + 1.5, X + T, Y + 1.5) }
      if (open(0, 1)) { g.strokeStyle = '#5f120f'; line(g, X, Y + T - 1.5, X + T, Y + T - 1.5) }
      if (open(-1, 0)) { g.strokeStyle = '#c23f32'; line(g, X + 1.5, Y, X + 1.5, Y + T) }
      if (open(1, 0)) { g.strokeStyle = '#7d1d18'; line(g, X + T - 1.5, Y, X + T - 1.5, Y + T) }
    }
    // ねじ（ところどころ）
    g.fillStyle = '#d9d9d4'
    for (let y = 0; y < S.H; y++) for (let x = 0; x < S.W; x++) if (S.grid[y][x] === '#' && (x * 7 + y * 13) % 9 === 0) { g.beginPath(); g.arc(x * T + T / 2, y * T + T / 2, 2.6, 0, 7); g.fill() }
    // 画鋲の板
    for (let y = 0; y < S.H; y++) for (let x = 0; x < S.W; x++) if (S.grid[y][x] === '^') drawPins(g, x, y)
    board = { c, pad }
  }
  function line(g, a, b, c, d) { g.beginPath(); g.moveTo(a, b); g.lineTo(c, d); g.stroke() }
  function drawPins(g, x, y) {
    const X = x * T, Y = y * T
    g.fillStyle = '#3d3f3d'; g.fillRect(X + 5, Y + 5, T - 10, T - 10)
    g.fillStyle = '#8c8f8b'; g.fillRect(X + 7, Y + 7, T - 14, T - 14)
    // 空きに向けて針を出す
    const dirs = [[0, -1], [0, 1], [-1, 0], [1, 0]]
    for (const [dx, dy] of dirs) {
      if (solid(cell(x + dx, y + dy)) && cell(x + dx, y + dy) !== '^') continue
      for (let k = 0; k < 3; k++) {
        const t = (k + 0.5) / 3
        let bx, by, tx, ty, px, py
        if (dy) { bx = X + 7 + t * (T - 14); by = dy < 0 ? Y + 5 : Y + T - 5; tx = bx; ty = by + dy * 9; px = 4.5; py = 0 }
        else { by = Y + 7 + t * (T - 14); bx = dx < 0 ? X + 5 : X + T - 5; tx = bx + dx * 9; ty = by; px = 0; py = 4.5 }
        g.beginPath(); g.moveTo(bx - px, by - py); g.lineTo(tx, ty); g.lineTo(bx + px, by + py); g.closePath()
        g.fillStyle = '#f2f3ef'; g.fill(); g.strokeStyle = '#2b2c2a'; g.lineWidth = 1.4; g.stroke()
      }
    }
    // 画鋲の頭
    g.fillStyle = '#d23a2f'; g.beginPath(); g.arc(X + T / 2, Y + T / 2, 7, 0, 7); g.fill()
    g.fillStyle = 'rgba(255,255,255,.55)'; g.beginPath(); g.arc(X + T / 2 - 2, Y + T / 2 - 2, 2.5, 0, 7); g.fill()
  }

  // ---------- 物理 ----------
  function targetR() { return Math.min(RMAX, R0 + RSTEP * S.n) }
  function physStep(dt) {
    const sx = Math.sin(S.th), sy = Math.cos(S.th)
    let gm = G
    // 床のガムの上: ねばって進みにくい
    const gx = Math.floor(S.p.x / T), gy = Math.floor(S.p.y / T)
    const onGum = cell(gx, gy) === 'w'
    S.v.x += sx * gm * dt; S.v.y += sy * gm * dt
    const drag = onGum ? 6 : 0.7
    S.v.x *= 1 - drag * dt; S.v.y *= 1 - drag * dt
    const sp = Math.hypot(S.v.x, S.v.y); if (sp > 460) { S.v.x *= 460 / sp; S.v.y *= 460 / sp }
    S.p.x += S.v.x * dt; S.p.y += S.v.y * dt
    // 半径を少しずつ太らせる（ぐっと膨らむ）
    S.r += (S.rv - S.r) * Math.min(1, dt * 10)
    collide()
  }
  function collide() {
    const r = S.r
    const x0 = Math.floor((S.p.x - r) / T), x1 = Math.floor((S.p.x + r) / T)
    const y0 = Math.floor((S.p.y - r) / T), y1 = Math.floor((S.p.y + r) / T)
    for (let it = 0; it < 2; it++) for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const c = cell(x, y); if (!solid(c)) continue
      const ins = c === '^' ? 4 : 0
      const rx0 = x * T + ins, ry0 = y * T + ins, rx1 = (x + 1) * T - ins, ry1 = (y + 1) * T - ins
      const qx = Math.max(rx0, Math.min(S.p.x, rx1)), qy = Math.max(ry0, Math.min(S.p.y, ry1))
      let dx = S.p.x - qx, dy = S.p.y - qy, d = Math.hypot(dx, dy)
      if (d >= r) continue
      if (c === '^') { if (d < r - 1.5) { die(); return } continue }
      let nx, ny
      if (d > 1e-6) { nx = dx / d; ny = dy / d }
      else { // 中心が壁の中: 一番近い辺へ
        const l = S.p.x - rx0, rr = rx1 - S.p.x, u = S.p.y - ry0, b = ry1 - S.p.y, m = Math.min(l, rr, u, b)
        nx = m === l ? -1 : m === rr ? 1 : 0; ny = m === u ? -1 : m === b ? 1 : 0; d = -m
      }
      const pen = r - d
      S.p.x += nx * pen; S.p.y += ny * pen
      const vn = S.v.x * nx + S.v.y * ny
      if (vn < 0) {
        S.v.x -= 1.28 * vn * nx; S.v.y -= 1.28 * vn * ny
        // 転がる摩擦（少しだけ）
        const tx = -ny, ty = nx, vt = S.v.x * tx + S.v.y * ty
        S.v.x -= vt * 0.004 * tx; S.v.y -= vt * 0.004 * ty
        if (vn < -150) hitSound(-vn)
      }
    }
  }
  function hitSound(sp) {
    const now = performance.now(); if (now - S.lastHit < 80) return; S.lastHit = now
    Snd.play('hit', { vol: Math.min(0.9, 0.15 + sp / 900), rate: 1.25 - (S.r - R0) / 40 })
  }
  function items() {
    for (const it of S.items) {
      if (!it.on) continue
      const d = Math.hypot(it.x - S.p.x, it.y - S.p.y)
      if (it.k === 'c' && d < S.r + 9) { it.on = false; S.n++; S.eaten++; S.rv = targetR(); Snd.play('pop', { vol: .7, rate: 1.1 }); flash('+200', 'chip'); S.squash = 1 }
      else if (it.k === 'm' && d < S.r + 9) { it.on = false; S.n = 0; S.rv = R0; Snd.play('chip', { vol: .8 }); say(L().ateMint, 900) }
      else if (it.k === 'w' && d < S.r + 8) { it.on = false; S.grid[it.gy][it.gx] = '.'; S.n++; S.rv = targetR(); Snd.play('goo', { vol: .9 }); S.squash = 1; if (!S.tutGumShown) { S.tutGumShown = 1 } }
    }
    // 細い道で太りすぎて止まっている時の合図
    if (S.rv >= 20 && !S.hintFat && narrowNear()) { S.hintFat = true; say(L().tooFat, 2200); Snd.play('squeak', { vol: .6 }) }
    // 画鋲が近い（顔をこわばらせる）
    let near = 9
    const gx = Math.floor(S.p.x / T), gy = Math.floor(S.p.y / T)
    for (let y = gy - 2; y <= gy + 2; y++) for (let x = gx - 2; x <= gx + 2; x++) if (cell(x, y) === '^') near = Math.min(near, Math.hypot((x + .5) * T - S.p.x, (y + .5) * T - S.p.y) / T)
    S.nearSpike = near
  }
  function narrowNear() {
    const gx = Math.floor(S.p.x / T), gy = Math.floor(S.p.y / T)
    for (let y = gy - 1; y <= gy + 1; y++) for (let x = gx - 1; x <= gx + 1; x++) if (isNarrow(x, y) && Math.hypot((x + .5) * T - S.p.x, (y + .5) * T - S.p.y) < T * 1.3) return true
    return false
  }
  function isNarrow(x, y) { if (solid(cell(x, y))) return false; return (solid(cell(x - 1, y)) && solid(cell(x + 1, y))) || (solid(cell(x, y - 1)) && solid(cell(x, y + 1))) }

  function die() {
    if (S.mode !== 'play') return
    S.mode = 'pop'; S.mt = 0; S.splat = { x: S.p.x, y: S.p.y, r: S.r, th: S.th }
    Snd.play('pop', { vol: 1, rate: .8 }); Snd.play('squeak', { vol: .7, delay: .08, rate: .8 }); Snd.duck && Snd.duck(.4, 1)
    say(L().pop, 1000, true); shake(10)
    S.log.push({ ev: 'pop', stage: S.stage, t: S.t })
  }
  function goal() {
    S.mode = 'goal'; S.mt = 0
    Snd.play('chute', { vol: 1 }); setTimeout(() => Snd.play('clear', { vol: .7 }), 380)
    const bonus = Math.max(0, Math.round((STAGES[S.stage].par - S.t) * 20))
    S.stageScore = 500 + bonus + S.eaten * 200
    S.score += S.stageScore
    S.log.push({ ev: 'goal', stage: S.stage, t: S.t, eaten: S.eaten, sc: S.stageScore })
    hud()
  }

  // ---------- 入力 ----------
  const keys = { l: 0, r: 0 }
  let drag = null
  const cv = $('cv'), ctx = cv.getContext('2d')
  cv.addEventListener('pointerdown', e => { Snd.init(); drag = { x: e.clientX, id: e.pointerId }; try { cv.setPointerCapture(e.pointerId) } catch (er) {} })
  cv.addEventListener('pointermove', e => { if (!drag || e.pointerId !== drag.id) return; const dx = e.clientX - drag.x; drag.x = e.clientX; if (S.mode === 'play' && !S.bot) { S.tht += dx / Math.max(320, cv.clientWidth) * SWIPE; tutSpun(dx) } })
  const up = e => { if (drag && e.pointerId === drag.id) drag = null }
  cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up)
  window.addEventListener('keydown', e => {
    if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') { keys.l = 1; e.preventDefault() }
    if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') { keys.r = 1; e.preventDefault() }
    if ((e.key === 'Enter' || e.key === ' ') && S.view === 'vTitle' && $('vHow').hidden) { e.preventDefault(); start() }
  })
  window.addEventListener('keyup', e => {
    if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') keys.l = 0
    if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') keys.r = 0
  })
  let tutAcc = 0
  function tutSpun(dx) { if (S.tutDone) return; tutAcc += Math.abs(dx); if (tutAcc > 120) { S.tutDone = 1; store.set('tut', 1); $('tut').hidden = true } }

  // ---------- 文字 ----------
  let msgT = 0
  function say(s, ms = 1200, big = false) { const m = $('msg'); m.textContent = s; m.classList.toggle('big', big); m.classList.add('on'); clearTimeout(msgT); msgT = setTimeout(() => m.classList.remove('on'), ms) }
  const floats = []
  function flash(s) { floats.push({ s, x: S.p.x, y: S.p.y, t: 0 }) }
  let shk = 0
  function shake(a) { shk = Math.max(shk, a) }

  function pad5(n) { return String(Math.min(99999, n)).padStart(5, '0') }
  function hud() {
    $('hSt').textContent = L().stageOf(S.stage + 1, STAGES.length)
    $('hSc').textContent = pad5(S.score)
    const bs = $('hBalls').children; for (let i = 0; i < 3; i++) bs[i].classList.toggle('off', i >= S.lives)
  }
  function hudName() { $('hName').textContent = STAGES[S.stage].name[lang]; hud() }

  // ---------- 進行 ----------
  function start() {
    Snd.init(); Snd.play('coin', { vol: 1 }); beds(true)
    S.lives = 3; S.score = 0; S.log = []
    show('vPlay'); resize(); loadStage(0); stageCard()
  }
  function stageCard() {
    S.mode = 'card'; S.mt = 0
    const c = $('card'); $('cN').textContent = `${L().stage} ${S.stage + 1}`; $('cT').textContent = STAGES[S.stage].name[lang]; $('cTk').textContent = ''
    c.classList.add('on')
    // 新しい仕掛けの最初の面で一言
    const st = S.stage
    S.tutLine = st === 1 ? L().tutSpike : st === 2 ? L().tutFat : st === 3 ? L().tutGum : ''
  }
  function beginPlay() {
    $('card').classList.remove('on'); S.mode = 'play'; S.mt = 0
    if (!S.tutDone && S.stage === 0) { $('tutTxt').textContent = touchDev ? L().tutSwipe : L().tutPC; $('tut').hidden = false }
    if (S.tutLine) say(S.tutLine, 2000)
  }
  function afterGoal() {
    if (S.stage + 1 >= STAGES.length) return finish(true)
    loadStage(S.stage + 1); stageCard()
  }
  function afterPop() {
    S.lives--; hud()
    if (S.lives <= 0) return finish(false)
    resetBall(); S.mode = 'play'; S.mt = 0
  }
  function retry() { if (S.mode !== 'play') return; die() }

  // ---------- 結果 ----------
  function rankOf(t) { let r = L().ranks[0][1]; for (const [m, n] of L().ranks) if (t >= m) r = n; return r }
  function finish(all) {
    S.mode = 'res'; beds(false)
    const tk = Math.floor(S.score / 10)
    S.res = { all, tk, stage: all ? STAGES.length : S.stage + 1, rank: rankOf(tk) }
    if (tk > store.get('best', 0)) store.set('best', tk)
    Snd.play(all ? 'final' : 'fail', { vol: .8 }); Snd.duck && Snd.duck(.5, 2)
    show('vRes')
    const t = L()
    $('rStamp').textContent = all ? t.resAll : t.resOver
    $('rStage').textContent = `${t.stage} ${S.res.stage}/${STAGES.length}`
    $('rNum').innerHTML = `${tk}<small>${t.tickets}</small>`
    $('rRank').textContent = S.res.rank
    $('rScore').textContent = `${t.score} ${S.score}`
    const box = $('rStrip'), h = box.clientHeight || 300
    const n = Math.max(2, Math.min(40, Math.ceil(tk / 25)))
    const th = Math.max(20, Math.min(54, h / Math.min(n, 6)))
    const tks = $('rTickets'); tks.style.setProperty('--th', th + 'px'); tks.classList.remove('out')
    tks.innerHTML = Array.from({ length: n }, () => `<div class="tkt">${t.ticketLabel}</div>`).join('')
    $('rMain').classList.remove('on')
    requestAnimationFrame(() => requestAnimationFrame(() => { tks.classList.add('out'); $('rMain').classList.add('on') }))
    let k = 0; const iv = setInterval(() => { Snd.play('chip', { vol: .5 }); if (++k > Math.min(10, n)) clearInterval(iv) }, 130)
    S.log.push({ ev: 'res', ...S.res })
  }
  function shareURL() { return 'https://tom3games.com/play/gumball-spin/' }
  function post() {
    const r = S.res; if (!r) return
    const text = L().postText(r.tk, r.rank, r.stage)
    const u = 'https://x.com/intent/post?text=' + encodeURIComponent(text + ' #ぐるぐるガムボール') + '&url=' + encodeURIComponent(shareURL())
    window.open(u, '_blank', 'noopener')
  }
  function resultImage() {
    const r = S.res, t = L(), c = document.createElement('canvas'); c.width = 1080; c.height = 1080
    const g = c.getContext('2d')
    const bg = g.createRadialGradient(300, 0, 50, 540, 400, 1100); bg.addColorStop(0, '#cf4a3c'); bg.addColorStop(.4, '#a8261f'); bg.addColorStop(1, '#6e1612')
    g.fillStyle = bg; g.fillRect(0, 0, 1080, 1080)
    g.fillStyle = '#17110d'; rr(g, 70, 70, 940, 190, 24); g.fill()
    g.fillStyle = '#fff6e4'; g.font = '900 92px "Zen Kaku Gothic New",sans-serif'; g.textBaseline = 'middle'
    g.fillText(lang === 'ja' ? 'ぐるぐるガムボール' : 'GUMBALL SPIN', 110, 165)
    // チケット
    g.save(); g.translate(540, 600); g.rotate(-0.04)
    g.fillStyle = '#f6a6b4'; rr(g, -330, -200, 660, 400, 14); g.fill()
    g.strokeStyle = 'rgba(120,30,50,.4)'; g.setLineDash([14, 10]); g.lineWidth = 5; rr(g, -305, -175, 610, 350, 8); g.stroke(); g.setLineDash([])
    g.fillStyle = '#7a1f35'; g.textAlign = 'center'
    g.font = '40px "DotGothic16",monospace'; g.fillText(t.ticketLabel, 0, -110)
    g.font = '900 170px "Zen Kaku Gothic New",sans-serif'; g.fillText(String(r.tk), 0, 10)
    g.font = '900 52px "Zen Kaku Gothic New",sans-serif'; g.fillText(r.rank, 0, 125)
    g.restore()
    g.textAlign = 'left'; g.fillStyle = '#ffb43a'; g.font = '44px "DotGothic16",monospace'
    g.fillText(`${r.all ? t.resAll : t.resOver}  ${t.stage} ${r.stage}/${STAGES.length}`, 90, 960)
    g.fillStyle = '#f0d6c0'; g.font = '700 30px "Zen Kaku Gothic New",sans-serif'; g.fillText('tom3games.com', 90, 1015)
    return c
  }
  function rr(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath() }
  function save() {
    const c = resultImage()
    c.toBlob(b => { if (!b) return; const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = 'gumball-spin.png'; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove() }, 1000) }, 'image/png')
  }

  // ---------- 描画 ----------
  let VW = 0, VH = 0, DPR = 1
  function viewScale() { return Math.min(VW || 390, (VH || 844) * 0.72) / (7.2 * T) }
  function resize() {
    DPR = Math.min(2, window.devicePixelRatio || 1)
    VW = cv.clientWidth || innerWidth; VH = cv.clientHeight || innerHeight
    cv.width = Math.round(VW * DPR); cv.height = Math.round(VH * DPR)
    if (S.grid) buildBoard()
  }
  window.addEventListener('resize', () => { if (S.view === 'vPlay') resize() })

  function toScreen(x, y) {
    const s = viewScale(), c = Math.cos(S.th), sn = Math.sin(S.th)
    const dx = (x - S.cam.x) * s, dy = (y - S.cam.y) * s
    // canvas の rotate(th) と同じ（th が増えると台は時計回り。重力は台の中で (sin th, cos th) ＝画面の真下）
    return { x: VW / 2 + dx * c - dy * sn, y: VH * 0.54 + dx * sn + dy * c }
  }

  function draw(now) {
    if (S.view !== 'vPlay' || !S.grid) return
    const s = viewScale()
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0)
    ctx.fillStyle = '#24130f'; ctx.fillRect(0, 0, VW, VH)
    let ox = 0, oy = 0
    if (shk > 0.2) { ox = (Math.random() - .5) * shk; oy = (Math.random() - .5) * shk; shk *= 0.86 } else shk = 0
    ctx.save()
    ctx.translate(VW / 2 + ox, VH * 0.54 + oy); ctx.rotate(S.th); ctx.scale(s, s); ctx.translate(-S.cam.x, -S.cam.y)
    // 盤
    ctx.imageSmoothingEnabled = true
    ctx.drawImage(board.c, -board.pad, -board.pad, board.c.width / boardQ, board.c.height / boardQ)
    // 床のガム・ガム玉・ミント
    const tt = now / 1000
    for (const it of S.items) {
      if (!it.on) continue
      if (it.k === 'w') drawFloorGum(it)
      else if (it.k === 'c') drawCandy(it.x, it.y, 8, ['#e9668a', '#5bbf6a', '#f2a41e', '#8a63d2', '#f5d33c'][(it.x * 3 + it.y) / T % 5 | 0], tt + it.ph)
      else drawMint(it.x, it.y, tt + it.ph)
    }
    // 取り出し口の上の矢印の代わりに、光る輪
    const gl = S.goal, pulse = 0.5 + 0.5 * Math.sin(tt * 4)
    ctx.strokeStyle = `rgba(255,180,58,${0.35 + 0.4 * pulse})`; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(gl.x, gl.y, 22 + pulse * 3, 0, 7); ctx.stroke()
    // 割れたガム
    if (S.mode === 'pop' && S.splat) drawSplat(S.splat, S.mt)
    // 浮かぶ点
    ctx.font = '900 16px "Zen Kaku Gothic New",sans-serif'; ctx.textAlign = 'center'
    ctx.restore()
    for (let i = floats.length - 1; i >= 0; i--) {
      const f = floats[i]; f.t += 1 / 60; if (f.t > 1) { floats.splice(i, 1); continue }
      const p = toScreen(f.x, f.y)
      ctx.globalAlpha = 1 - f.t; ctx.font = '900 20px "Zen Kaku Gothic New",sans-serif'; ctx.textAlign = 'center'
      ctx.lineWidth = 5; ctx.strokeStyle = '#2a1a14'; ctx.strokeText(f.s, p.x, p.y - 30 - f.t * 40); ctx.fillStyle = '#ffb43a'; ctx.fillText(f.s, p.x, p.y - 30 - f.t * 40)
      ctx.globalAlpha = 1
    }
    // ガム本体（画面の座標で描く: 照りはいつも左上）
    if (S.mode !== 'pop') {
      let bx = S.p.x, by = S.p.y, br = S.r
      if (S.mode === 'goal') { const k = Math.min(1, S.mt / 0.5); bx += (S.goal.x - bx) * k; by += (S.goal.y - by) * k; br *= 1 - 0.75 * k }
      const p = toScreen(bx, by); drawBall(p.x + ox, p.y + oy, br * s, tt)
    }
    // ガラスの映り込み（画面に固定）
    const gg = ctx.createLinearGradient(0, 0, VW, VH * .6)
    gg.addColorStop(0, 'rgba(255,255,255,.10)'); gg.addColorStop(.35, 'rgba(255,255,255,0)'); gg.addColorStop(.42, 'rgba(255,255,255,.06)'); gg.addColorStop(.5, 'rgba(255,255,255,0)')
    ctx.fillStyle = gg; ctx.fillRect(0, 0, VW, VH)
    // 周りの縁（筐体のふち）
    const vg = ctx.createRadialGradient(VW / 2, VH * .54, Math.min(VW, VH) * .42, VW / 2, VH * .54, Math.max(VW, VH) * .72)
    vg.addColorStop(0, 'rgba(36,19,15,0)'); vg.addColorStop(1, 'rgba(36,19,15,.85)')
    ctx.fillStyle = vg; ctx.fillRect(0, 0, VW, VH)
  }
  function drawCandy(x, y, r, col, t) {
    const g = ctx.createRadialGradient(x - r * .35, y - r * .35, 1, x, y, r)
    g.addColorStop(0, '#fff'); g.addColorStop(.25, col); g.addColorStop(1, shade(col, -.35))
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y + Math.sin(t * 2) * 1.2, r, 0, 7); ctx.fill()
  }
  function drawMint(x, y, t) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(Math.sin(t) * .3)
    ctx.fillStyle = '#f7fbf8'; ctx.beginPath(); ctx.arc(0, 0, 10, 0, 7); ctx.fill()
    ctx.strokeStyle = '#3fb58a'; ctx.lineWidth = 3
    for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.arc(0, 0, 10, k * 2.1, k * 2.1 + .9); ctx.lineTo(0, 0); ctx.stroke() }
    ctx.strokeStyle = 'rgba(0,0,0,.25)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(0, 0, 10, 0, 7); ctx.stroke()
    ctx.restore()
  }
  function drawFloorGum(it) {
    ctx.fillStyle = '#ec8fae'
    ctx.beginPath()
    for (let k = 0; k <= 10; k++) { const a = k / 10 * Math.PI * 2, rr2 = 13 + Math.sin(k * 2.7 + it.gx) * 4; const px = it.x + Math.cos(a) * rr2, py = it.y + Math.sin(a) * rr2 * .8; k ? ctx.lineTo(px, py) : ctx.moveTo(px, py) }
    ctx.closePath(); ctx.fill()
    ctx.fillStyle = 'rgba(255,255,255,.45)'; ctx.beginPath(); ctx.ellipse(it.x - 4, it.y - 3, 4, 2.5, -.4, 0, 7); ctx.fill()
    // 靴の跡
    ctx.strokeStyle = 'rgba(150,60,90,.45)'; ctx.lineWidth = 1.5
    for (let k = -1; k <= 1; k++) line(ctx, it.x - 8, it.y + k * 4, it.x + 8, it.y + k * 4 - 2)
  }
  function drawSplat(sp, mt) {
    const k = Math.min(1, mt / 0.15)
    ctx.save(); ctx.translate(sp.x, sp.y)
    ctx.fillStyle = '#2d9ee0'
    ctx.beginPath()
    for (let i = 0; i <= 14; i++) { const a = i / 14 * Math.PI * 2, rr2 = sp.r * (1 + k * (0.5 + 0.5 * Math.sin(i * 3.3))); const px = Math.cos(a) * rr2, py = Math.sin(a) * rr2 * 0.7; i ? ctx.lineTo(px, py) : ctx.moveTo(px, py) }
    ctx.closePath(); ctx.fill()
    // 伸びたガムの糸
    ctx.strokeStyle = '#2d9ee0'; ctx.lineWidth = 2.5; ctx.lineCap = 'round'
    for (let i = 0; i < 6; i++) { const a = i * 1.05 + .3; line(ctx, 0, 0, Math.cos(a) * sp.r * (1.6 + k), Math.sin(a) * sp.r * (1.6 + k)) }
    // ×の目
    ctx.rotate(-sp.th)
    ctx.strokeStyle = '#13324a'; ctx.lineWidth = 2.2
    for (const ex of [-sp.r * .35, sp.r * .35]) { line(ctx, ex - 3, -4, ex + 3, 2); line(ctx, ex + 3, -4, ex - 3, 2) }
    ctx.restore()
  }
  function drawBall(x, y, r, t) {
    // 影
    ctx.fillStyle = 'rgba(40,20,10,.22)'; ctx.beginPath(); ctx.ellipse(x + r * .15, y + r * .9, r * .8, r * .22, 0, 0, 7); ctx.fill()
    let sq = S.squash || 0; if (sq > 0) S.squash = Math.max(0, sq - 0.06)
    const sx = 1 + sq * .15, sy = 1 - sq * .15
    ctx.save(); ctx.translate(x, y); ctx.scale(sx, sy)
    const g = ctx.createRadialGradient(-r * .38, -r * .42, r * .08, 0, 0, r)
    g.addColorStop(0, '#e6f7ff'); g.addColorStop(.28, '#58bdf0'); g.addColorStop(.75, '#2d9ee0'); g.addColorStop(1, '#155f8f')
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, r, 0, 7); ctx.fill()
    // 顔（転がる向きに回る）
    ctx.save(); ctx.rotate(S.roll)
    const dizzy = S.spin > 5, scared = S.nearSpike < 1.25, fat = S.n >= 3
    ctx.fillStyle = '#10324a'; ctx.strokeStyle = '#10324a'; ctx.lineWidth = Math.max(1.2, r * .09); ctx.lineCap = 'round'
    const ex = r * .34, ey = -r * .12
    if (dizzy) {
      for (const e of [-ex, ex]) { ctx.beginPath(); for (let a = 0; a < 9; a += .3) { const rr2 = a * r * .018; const px = e + Math.cos(a + t * 8) * rr2, py = ey + Math.sin(a + t * 8) * rr2; a ? ctx.lineTo(px, py) : ctx.moveTo(px, py) } ctx.stroke() }
      ctx.beginPath(); ctx.arc(0, r * .38, r * .14, 0, 7); ctx.stroke()
    } else if (scared) {
      for (const e of [-ex, ex]) { ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(e, ey, r * .17, 0, 7); ctx.fill(); ctx.fillStyle = '#10324a'; ctx.beginPath(); ctx.arc(e, ey, r * .07, 0, 7); ctx.fill() }
      ctx.beginPath(); for (let i = 0; i <= 6; i++) { const px = -r * .3 + i * r * .1, py = r * .38 + (i % 2 ? -1 : 1) * r * .05; i ? ctx.lineTo(px, py) : ctx.moveTo(px, py) } ctx.stroke()
    } else if (fat) {
      for (const e of [-ex, ex]) line(ctx, e - r * .1, ey, e + r * .1, ey)
      ctx.beginPath(); ctx.arc(0, r * .35, r * .12, 0, Math.PI); ctx.stroke()
      ctx.fillStyle = 'rgba(240,110,140,.55)'; for (const e of [-ex * 1.5, ex * 1.5]) { ctx.beginPath(); ctx.ellipse(e, r * .18, r * .12, r * .07, 0, 0, 7); ctx.fill() }
    } else {
      for (const e of [-ex, ex]) { ctx.beginPath(); ctx.ellipse(e, ey, r * .07, r * .12, 0, 0, 7); ctx.fill() }
      ctx.beginPath(); ctx.arc(0, r * .18, r * .22, .25, Math.PI - .25); ctx.stroke()
    }
    ctx.restore()
    // 照り（回らない）
    ctx.fillStyle = 'rgba(255,255,255,.75)'; ctx.beginPath(); ctx.ellipse(-r * .4, -r * .45, r * .2, r * .12, -.6, 0, 7); ctx.fill()
    ctx.restore()
  }
  function shade(hex, k) {
    const n = parseInt(hex.slice(1), 16); let r = n >> 16, g = (n >> 8) & 255, b = n & 255
    r = Math.round(r * (1 + k)); g = Math.round(g * (1 + k)); b = Math.round(b * (1 + k))
    return `rgb(${Math.max(0, Math.min(255, r))},${Math.max(0, Math.min(255, g))},${Math.max(0, Math.min(255, b))})`
  }

  // ---------- 1コマ ----------
  function tick(dt) {
    if (S.view !== 'vPlay') return
    S.mt += dt
    if (S.mode === 'card') { if (S.mt > 1.3) beginPlay(); return }
    if (S.mode === 'goal') { if (S.mt > 1.5) afterGoal(); return }
    if (S.mode === 'pop') { if (S.mt > 1.4) afterPop(); return }
    if (S.mode !== 'play') return
    S.t += dt
    if (S.bot) botThink(dt)
    if (keys.l) S.tht -= 2.6 * dt
    if (keys.r) S.tht += 2.6 * dt
    if (keys.l || keys.r) tutSpun(8)
    const d = S.tht - S.th, mx = ROT_MAX * dt
    const st = Math.max(-mx, Math.min(mx, d))
    S.th += st; S.thv = st / dt
    S.spin = Math.max(0, S.spin + Math.abs(st) - dt * 2.2)
    for (let i = 0; i < SUB; i++) { physStep(dt / SUB); if (S.mode !== 'play') break }
    if (S.mode !== 'play') return
    // 転がった分だけ顔を回す（画面の横の速さ）
    const vx = S.v.x * Math.cos(S.th) - S.v.y * Math.sin(S.th)
    S.roll += vx / Math.max(6, S.r) * dt
    items()
    if (Math.hypot(S.p.x - S.goal.x, S.p.y - S.goal.y) < 15) goal()
    S.cam.x += (S.p.x - S.cam.x) * Math.min(1, dt * 7); S.cam.y += (S.p.y - S.cam.y) * Math.min(1, dt * 7)
  }

  // ---------- bot（検証用。道を探して重力を向ける） ----------
  function path(from, toFn, fat) {
    const W = S.W, H = S.H, dist = new Float64Array(W * H).fill(1e9), prev = new Int32Array(W * H).fill(-1)
    const q = [[0, from]]; dist[from] = 0
    while (q.length) {
      q.sort((a, b) => a[0] - b[0]); const [d, u] = q.shift(); if (d > dist[u]) continue
      const ux = u % W, uy = (u / W) | 0
      if (toFn(ux, uy)) { const out = []; let k = u; while (k >= 0) { out.push(k); k = prev[k] } return out.reverse() }
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const x = ux + dx, y = uy + dy; const c = cell(x, y); if (solid(c)) continue
        if (fat && isNarrow(x, y)) continue
        let w = 1
        for (let yy = y - 1; yy <= y + 1; yy++) for (let xx = x - 1; xx <= x + 1; xx++) if (cell(xx, yy) === '^') w += 4
        if (S.n >= 3) { for (const it of S.items) if (it.on && it.k !== 'm' && Math.floor(it.x / T) === x && Math.floor(it.y / T) === y) w += 30 }
        const v = y * W + x, nd = d + w; if (nd < dist[v]) { dist[v] = nd; prev[v] = u; q.push([nd, v]) }
      }
    }
    return null
  }
  function botThink(dt) {
    const B = S.bot; B.t -= dt
    if (B.t > 0) return
    B.t = B.human ? 0.45 + Math.random() * 0.3 : 0.08
    const W = S.W, here = Math.floor(S.p.y / T) * W + Math.floor(S.p.x / T)
    const fat = S.rv >= 20
    let p = path(here, (x, y) => x === S.goal.gx && y === S.goal.gy, fat)
    if (!p && fat) { const m = S.items.find(i => i.on && i.k === 'm'); if (m) p = path(here, (x, y) => x === Math.floor(m.x / T) && y === Math.floor(m.y / T), false) }
    if (!p) { B.stuck = (B.stuck || 0) + 1; return }
    const k = p[Math.min(p.length - 1, 2)], tx = (k % W + .5) * T, ty = ((k / W | 0) + .5) * T
    let dx = tx - S.p.x, dy = ty - S.p.y
    // 速すぎる時は向きを和らげる
    dx -= S.v.x * 0.3; dy -= S.v.y * 0.3
    let want = Math.atan2(dx, dy)
    if (B.human) want += (Math.random() - .5) * 0.35
    // 今の角度に一番近い同じ向き
    while (want - S.th > Math.PI) want -= Math.PI * 2
    while (want - S.th < -Math.PI) want += Math.PI * 2
    S.tht = want
  }

  // ---------- タイトルの絵（ガラスの中のガム） ----------
  const dome = $('tDomeCv'), dg = dome.getContext('2d')
  const balls = Array.from({ length: 34 }, (_, i) => ({ a: Math.random() * 6.28, d: Math.random(), c: ['#2d9ee0', '#e9668a', '#5bbf6a', '#f2a41e', '#8a63d2', '#f5d33c', '#fff6e4'][i % 7] }))
  function drawDome(t) {
    const W = 400, c = 200; dg.clearRect(0, 0, W, W)
    // 台座
    dg.fillStyle = '#6e1612'; dg.beginPath(); dg.moveTo(90, 330); dg.lineTo(310, 330); dg.lineTo(338, 398); dg.lineTo(62, 398); dg.closePath(); dg.fill()
    dg.fillStyle = '#a8261f'; dg.beginPath(); dg.moveTo(100, 322); dg.lineTo(300, 322); dg.lineTo(326, 392); dg.lineTo(74, 392); dg.closePath(); dg.fill()
    dg.fillStyle = '#111'; rr(dg, 178, 350, 44, 30, 6); dg.fill()
    dg.fillStyle = '#d9d9d4'; dg.beginPath(); dg.arc(200, 338, 9, 0, 7); dg.fill()
    // ガラス
    dg.save(); dg.beginPath(); dg.arc(c, 168, 150, 0, 7); dg.clip()
    dg.fillStyle = 'rgba(255,246,228,.13)'; dg.fillRect(0, 0, W, W)
    // 中の迷路（ゆっくり回る）
    dg.save(); dg.translate(c, 168); dg.rotate(Math.sin(t * .5) * .5)
    dg.strokeStyle = '#a8261f'; dg.lineWidth = 9; dg.lineCap = 'round'
    const segs = [[-110, -60, 40, -60], [-40, -10, 110, -10], [-110, 40, 30, 40], [0, 90, 110, 90], [40, -60, 40, -110]]
    for (const s of segs) { dg.beginPath(); dg.moveTo(s[0], s[1]); dg.lineTo(s[2], s[3]); dg.stroke() }
    dg.restore()
    // ガムの山
    for (const b of balls) {
      const ang = b.a, rad = 40 + b.d * 95, x = c + Math.cos(ang) * rad * .9, y = 230 + Math.abs(Math.sin(ang)) * 50 - b.d * 30 + Math.sin(t * 2 + b.a) * 1.5
      const g = dg.createRadialGradient(x - 5, y - 6, 1, x, y, 15); g.addColorStop(0, '#fff'); g.addColorStop(.3, b.c); g.addColorStop(1, shade(b.c, -.35))
      dg.fillStyle = g; dg.beginPath(); dg.arc(x, y, 15, 0, 7); dg.fill()
    }
    // 主役のガム（迷路の上で転がる）
    const px = c + Math.sin(t * .9) * 70, py = 108 + Math.cos(t * .6) * 8
    const g = dg.createRadialGradient(px - 8, py - 9, 2, px, py, 24); g.addColorStop(0, '#e6f7ff'); g.addColorStop(.3, '#58bdf0'); g.addColorStop(1, '#155f8f')
    dg.fillStyle = g; dg.beginPath(); dg.arc(px, py, 24, 0, 7); dg.fill()
    dg.fillStyle = '#10324a'; for (const e of [-8, 8]) { dg.beginPath(); dg.ellipse(px + e, py - 3, 2.3, 4, 0, 0, 7); dg.fill() }
    dg.strokeStyle = '#10324a'; dg.lineWidth = 2.4; dg.beginPath(); dg.arc(px, py + 4, 6, .3, Math.PI - .3); dg.stroke()
    dg.restore()
    // ガラスの縁と照り
    dg.strokeStyle = '#e9e6dd'; dg.lineWidth = 8; dg.beginPath(); dg.arc(c, 168, 150, 0, 7); dg.stroke()
    dg.strokeStyle = 'rgba(255,255,255,.45)'; dg.lineWidth = 10; dg.lineCap = 'round'; dg.beginPath(); dg.arc(c, 168, 126, 3.6, 4.3); dg.stroke()
    // ふた
    dg.fillStyle = '#a8261f'; rr(dg, 150, 8, 100, 22, 8); dg.fill()
  }

  // ---------- ループ（固定60Hz） ----------
  let last = performance.now(), acc = 0
  function frame() {
    const now = performance.now()
    if (!S.paused) {
      acc += Math.min(0.25, (now - last) / 1000)
      while (acc >= STEP) { tick(STEP); acc -= STEP }
    }
    last = now
    if (S.view === 'vTitle') drawDome(now / 1000)
    draw(now)
    requestAnimationFrame(frame)
  }

  // ---------- ボタン ----------
  $('bStart').addEventListener('click', start)
  $('bHow').addEventListener('click', () => { Snd.init(); $('vHow').hidden = false })
  $('bHowClose').addEventListener('click', () => { $('vHow').hidden = true })
  $('vHow').addEventListener('click', e => { if (e.target.id === 'vHow') $('vHow').hidden = true })
  $('bLang').addEventListener('click', () => { lang = lang === 'ja' ? 'en' : 'ja'; store.set('lang', lang); applyLang() })
  $('bMute').addEventListener('click', toggleMute); $('bMute2').addEventListener('click', toggleMute)
  $('bRetry').addEventListener('click', retry)
  $('bAgain').addEventListener('click', () => { start() })
  $('bPost').addEventListener('click', post)
  $('bSave').addEventListener('click', save)
  document.addEventListener('pointerdown', () => Snd.init(), { once: false, passive: true })

  // ---------- 起動 ----------
  drawMute(); applyLang(); show('vTitle')
  requestAnimationFrame(frame)
  // ロード: 音を読みこむ数で進める。12秒で必ず消す
  ;(async () => {
    const files = [...new Set(Object.values(Snd.files).flat().concat(['snd/crowd.mp3', 'snd/bgm.mp3', 'snd/hum.mp3']))]
    let done = 0
    const bar = document.querySelector('#loadBar i')
    const hide = () => { const l = $('loading'); if (!l || l.dataset.gone) return; l.dataset.gone = 1; l.style.opacity = 0; setTimeout(() => l.remove(), 400) }
    setTimeout(hide, 12000)
    await Promise.all(files.map(u => fetch(u).then(r => r.arrayBuffer()).catch(() => null).then(() => { done++; bar.style.width = (done / files.length * 100) + '%' })))
    try { await document.fonts.ready } catch (e) {}
    hide()
  })()

  // 検証用の窓口
  window.gumball = {
    S, STAGES,
    dbg: {
      pause(v = true) { S.paused = v; last = performance.now() },
      step(n = 1) { for (let i = 0; i < n; i++) tick(STEP) },
      render() { draw(performance.now()) },
      go(i) { Snd.init(); if (S.view !== 'vPlay') { S.lives = 3; S.score = 0; show('vPlay'); resize() } loadStage(i); S.mode = 'play'; $('card').classList.remove('on') },
      bot(on = true, human = false) { S.bot = on ? { t: 0, human } : null },
      setTh(a) { S.th = S.tht = a },
      finish(all) { finish(all) },
      screenXY: (x, y) => toScreen(x, y),
      start,
    },
  }
  window.__gbReady = true
})()
