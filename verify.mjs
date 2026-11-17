import './mute-auto.mjs'
import { MUTE_LAUNCH, muteContext } from './mute.mjs'
import { chromium, webkit } from 'playwright'
import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
const ROOT = import.meta.dirname
mkdirSync(ROOT + '/shots', { recursive: true })
import { createServer as _cs } from 'node:net'
const PORT = await new Promise(r => { const s = _cs(); s.listen(0, () => { const n = s.address().port; s.close(() => r(n)) }) })
const server = spawn(process.execPath, ['server.mjs'], { cwd: ROOT, env: { ...process.env, PORT: String(PORT) } })
for (let i = 0; i < 60; i++) { try { const h = await (await fetch(`http://localhost:${PORT}/`)).text(); if (h.includes('gumball-spin')) break } catch (e) {} await new Promise(r => setTimeout(r, 100)) }
const URL0 = `http://localhost:${PORT}/`
let pass = 0, fail = 0
const out = []
async function t(name, fn) { try { const r = await fn(); if (r === false) throw new Error('false'); pass++; out.push(`ok   ${name}${r && r !== true ? '  ' + JSON.stringify(r) : ''}`) } catch (e) { fail++; out.push(`FAIL ${name}  ${e.message.split('\n')[0]}`) } }
const expect = (c, m) => { if (!c) throw new Error(m) }
async function open(browser, opts = {}, q = '') {
  const ctx = await browser.newContext({ locale: 'ja-JP', viewport: { width: 390, height: 844 }, hasTouch: true, ...opts })
  await muteContext(ctx)
  const p = await ctx.newPage(); p.errs = []
  p.on('pageerror', e => p.errs.push('pageerror ' + e.message))
  p.on('console', m => { if (m.type() === 'error') p.errs.push('console ' + m.text()) })
  p.on('requestfailed', r => { if (!/fonts\.(googleapis|gstatic)|tm\.js|ofuse/.test(r.url())) p.errs.push('reqfail ' + r.url()) })
  await p.goto(URL0 + q); await p.waitForFunction(() => window.__gbReady, null, { timeout: 10000 })
  await p.waitForFunction(() => !document.getElementById('loading'), null, { timeout: 14000 })
  return p
}
const fits = p => p.evaluate(() => {
  const v = [...document.querySelectorAll('main')].find(m => !m.hidden), W = innerWidth, H = innerHeight, bad = []
  for (const el of v.querySelectorAll('button,h1,#rMain,#ledBar')) { const r = el.getBoundingClientRect(); if (!r.width) continue; if (r.right > W + 1 || r.left < -1 || r.bottom > H + 1 || r.top < -1) bad.push((el.id || el.tagName) + ' ' + Math.round(r.left) + ',' + Math.round(r.top) + ',' + Math.round(r.right) + ',' + Math.round(r.bottom)) }
  return { sh: document.documentElement.scrollHeight, H, sw: document.documentElement.scrollWidth, W, bad }
})

const SIZES = [[360, 640], [390, 844], [430, 932]]
for (const [bname, BT] of [['chromium', chromium], ['webkit', webkit]]) {
  const br = await BT.launch(bname === 'chromium' ? MUTE_LAUNCH : {})
  // 画面ごと3サイズ
  for (const [w, h] of SIZES) {
    await t(`${bname} ${w}x${h} 全画面が一画面に収まる`, async () => {
      const p = await open(br, { viewport: { width: w, height: h } })
      const res = []
      res.push(['title', await fits(p)]); await p.screenshot({ path: `shots/${bname}-${w}-title.png` })
      await p.evaluate(() => gumball.dbg.start()); await p.waitForTimeout(300)
      await p.evaluate(() => { gumball.dbg.pause(); gumball.dbg.step(100); gumball.dbg.render() })
      res.push(['play', await fits(p)]); await p.screenshot({ path: `shots/${bname}-${w}-play.png` })
      await p.evaluate(() => { gumball.S.score = 7340; gumball.dbg.finish(false) }); await p.waitForTimeout(2600)
      res.push(['res', await fits(p)]); await p.screenshot({ path: `shots/${bname}-${w}-res.png` })
      await p.click('#bHow').catch(() => {})
      for (const [k, f] of res) { expect(f.sh <= f.H + 1 && f.sw <= f.W + 1, k + ' scroll ' + JSON.stringify(f)); expect(!f.bad.length, k + ' はみ出し ' + f.bad.join('|')) }
      expect(!p.errs.length, p.errs.join(' | '))
      expect(await p.evaluate(() => window.__muteOk ? window.__muteOk() : true), '音が出ている')
      await p.context().close()
    })
  }
  await br.close()
}

const br = await chromium.launch(MUTE_LAUNCH)
// 遊び方の画面
await t('遊び方が一画面に収まる（360x640）', async () => {
  const p = await open(br, { viewport: { width: 360, height: 640 } })
  await p.click('#bHow'); await p.waitForTimeout(200); await p.screenshot({ path: 'shots/how-360.png' })
  const r = await p.evaluate(() => { const c = document.getElementById('howCard'); return { sh: c.scrollHeight, ch: c.clientHeight, b: document.getElementById('bHowClose').getBoundingClientRect().bottom, H: innerHeight } })
  expect(r.sh <= r.ch + 1 && r.b <= r.H, JSON.stringify(r)); await p.context().close()
})
// 本物の指でスワイプすると台が回る
await t('スワイプで台が回る（右で時計回り＝th が増える）', async () => {
  const p = await open(br)
  await p.click('#bStart'); await p.waitForFunction(() => gumball.S.mode === 'play', null, { timeout: 4000 })
  const th0 = await p.evaluate(() => gumball.S.tht)
  await p.mouse.move(100, 500); await p.mouse.down(); for (let i = 1; i <= 10; i++) await p.mouse.move(100 + i * 15, 500); await p.mouse.up()
  const th1 = await p.evaluate(() => gumball.S.tht)
  expect(th1 - th0 > 0.5, `th ${th0}->${th1}`)
  await p.mouse.move(300, 500); await p.mouse.down(); for (let i = 1; i <= 10; i++) await p.mouse.move(300 - i * 20, 500); await p.mouse.up()
  const th2 = await p.evaluate(() => gumball.S.tht)
  expect(th2 < th1 - 0.5, `th ${th1}->${th2}`)
  const tut = await p.evaluate(() => document.getElementById('tut').hidden)
  expect(tut, 'スワイプ後にチュートリアルが消えていない')
  await p.context().close(); return { th0, th1: +th1.toFixed(2), th2: +th2.toFixed(2) }
})
// 回すとガムが画面の下へ転がる（重力の向きと見た目の一致）
await t('回すとガムは画面の下へ動く', async () => {
  const p = await open(br)
  const r = await p.evaluate(() => {
    const d = gumball.dbg; d.go(2); d.pause(); const S = gumball.S
    const out = []
    for (const a of [0.6, -0.6, Math.PI / 2]) {
      d.go(2); d.setTh(a); S.p.x = 6.5 * 40; S.p.y = 4.5 * 40; S.cam.x = S.p.x; S.cam.y = S.p.y
      const s0 = d.screenXY(S.p.x, S.p.y); d.step(6); const s1 = d.screenXY(S.p.x, S.p.y)
      out.push({ a, dx: +(s1.x - s0.x).toFixed(1), dy: +(s1.y - s0.y).toFixed(1) })
    }
    return out
  })
  for (const o of r) expect(o.dy > 2 && Math.abs(o.dx) < o.dy * 0.2, JSON.stringify(o))
  await p.context().close(); return r
})
// 全面 bot で通る（上手い型）
const runs = []
await t('上手い bot が全8面を通せる（面ごと）', async () => {
  const p = await open(br)
  const r = await p.evaluate(() => {
    const d = gumball.dbg, S = gumball.S, res = []
    for (let i = 0; i < gumball.STAGES.length; i++) {
      let ok = 0, pops = 0, times = []
      for (let k = 0; k < 4; k++) {
        d.go(i); d.pause(); d.bot(true, false); S.lives = 99
        let n = 0; while (S.mode === 'play' && n < 60 * 120) { d.step(1); n++ }
        if (S.mode === 'goal') { ok++; times.push(+(S.t).toFixed(1)) } else if (S.mode === 'pop') pops++
      }
      res.push({ st: i + 1, ok, pops, times })
    }
    d.bot(false); return res
  })
  runs.push(...r)
  // 前半5面は 4回中3回、後半（難所）は2回以上
  const bad = r.filter(x => x.ok < (x.st <= 5 ? 3 : 2)); expect(!bad.length, JSON.stringify(bad)); return r
})
await t('人の速さの bot（0.45〜0.75秒遅れ・狙いずれ）が序盤を通せる', async () => {
  const p = await open(br)
  const r = await p.evaluate(() => {
    const d = gumball.dbg, S = gumball.S, res = []
    for (const i of [0, 1, 2, 3, 4, 5, 6, 7]) {
      let ok = 0
      for (let k = 0; k < 6; k++) { d.go(i); d.pause(); d.bot(true, true); S.lives = 99; let n = 0; while (S.mode === 'play' && n < 60 * 150) { d.step(1); n++ } if (S.mode === 'goal') ok++ }
      res.push({ st: i + 1, ok, of: 6 })
    }
    d.bot(false); return res
  })
  // 初めての人が最初の場面で成功できる: 1〜3面は6回中4回以上
  expect(r[0].ok >= 5 && r[1].ok >= 4 && r[2].ok >= 4, JSON.stringify(r)); return r
})
// 何もしないと点が入らない
await t('何もしない: 1面で取り出し口に着かない', async () => {
  const p = await open(br)
  const r = await p.evaluate(() => { const d = gumball.dbg, S = gumball.S; d.go(0); d.pause(); d.step(60 * 30); return { mode: S.mode, score: S.score } })
  expect(r.mode === 'play' && r.score === 0, JSON.stringify(r)); return r
})
// 画鋲で割れる → 玉が減る → 0で結果
await t('画鋲に当たると割れて玉が減り、3回で結果画面', async () => {
  const p = await open(br)
  const r = await p.evaluate(() => {
    const d = gumball.dbg, S = gumball.S; d.start(); d.pause(); d.step(90)
    const log = []
    for (let k = 0; k < 3; k++) {
      d.go(1); S.lives = 3 - k; d.pause()
      // 2面の (1,10) は画鋲。真上 (1,9) に置いて落とす
      S.p.x = 1.5 * 40; S.p.y = 9.3 * 40; S.v.x = S.v.y = 0; S.th = S.tht = 0
      d.step(30); log.push(S.mode); d.step(100); log.push(S.view + ':' + S.lives)
    }
    return log
  })
  expect(r[0] === 'pop' && r[5] === 'vRes:0', JSON.stringify(r)); return r
})
// 太ると細い道を通れない・ミントで戻る
await t('4つ食べると幅1マスの門を通れない／ミントで元に戻る', async () => {
  const p = await open(br)
  const r = await p.evaluate(() => {
    const d = gumball.dbg, S = gumball.S; d.go(2); d.pause()
    // 3面の (7,3) は幅1の門。真上 (7,2) から落とす
    const tryPass = n => { d.go(2); d.pause(); S.n = n; S.r = S.rv = Math.min(22, 12 + 2.6 * n); S.p.x = 7.5 * 40; S.p.y = 2.5 * 40; S.v.x = S.v.y = 0; d.step(120); return S.p.y > 4 * 40 && S.mode === 'play' }
    const mint = () => { d.go(2); d.pause(); S.n = 4; S.r = S.rv = 22; const m = S.items.find(i => i.k === 'm'); S.p.x = m.x; S.p.y = m.y - 2; d.step(30); return S.rv }
    return { n0: tryPass(0), n3: tryPass(3), n4: tryPass(4), mintR: mint() }
  })
  expect(r.n0 && r.n3 && !r.n4 && r.mintR === 12, JSON.stringify(r)); return r
})
// 速くても壁を抜けない
await t('最高速でも壁を抜けない（1000回落とす）', async () => {
  const p = await open(br)
  const r = await p.evaluate(() => {
    const d = gumball.dbg, S = gumball.S; let leak = 0
    for (let k = 0; k < 1000; k++) {
      d.go(7); d.pause(); const a = Math.random() * Math.PI * 2; d.setTh(a)
      // 空きマスを1つ選ぶ
      let x, y; do { x = 1 + (Math.random() * (S.W - 2) | 0); y = 1 + (Math.random() * (S.H - 2) | 0) } while (S.grid[y][x] !== '.')
      S.p.x = (x + .5) * 40; S.p.y = (y + .5) * 40; S.v.x = Math.cos(a) * 820; S.v.y = Math.sin(a) * 820
      for (let i = 0; i < 90 && S.mode === 'play'; i++) d.step(1)
      const gx = Math.floor(S.p.x / 40), gy = Math.floor(S.p.y / 40)
      if (gx < 0 || gy < 0 || gx >= S.W || gy >= S.H || S.grid[gy][gx] === '#') leak++
    }
    return { leak }
  })
  expect(r.leak === 0, JSON.stringify(r)); return r
})
// 結果・ポスト・保存
await t('結果: チケット数・称号・Xの文・画像が作れる', async () => {
  const p = await open(br)
  await p.evaluate(() => { gumball.dbg.start(); gumball.S.score = 8120; gumball.dbg.finish(true) })
  await p.waitForTimeout(2500)
  const r = await p.evaluate(() => ({ num: document.getElementById('rNum').textContent, rank: document.getElementById('rRank').textContent, sup: !!document.getElementById('tmSupport') }))
  expect(r.num.startsWith('812') && r.rank && r.sup, JSON.stringify(r))
  const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 5000 }), p.click('#bSave')])
  expect(dl.suggestedFilename() === 'gumball-spin.png', dl.suggestedFilename())
  const [pop] = await Promise.all([p.context().waitForEvent('page', { timeout: 5000 }), p.click('#bPost')])
  const u = pop.url(); expect(/x\.com\/intent\/post/.test(u) && /tom3games\.com%2Fplay%2Fgumball-spin/.test(u), u)
  await p.context().close(); return r
})
// 英語
await t('英語に切り替わる', async () => {
  const p = await open(br)
  await p.click('#bLang'); const r = await p.evaluate(() => [document.getElementById('tT2').textContent, document.getElementById('bHow').textContent])
  expect(r[0] === 'SPIN' && r[1] === 'How to play', JSON.stringify(r))
  await p.screenshot({ path: 'shots/title-en.png' }); await p.context().close()
})
// 拡大止め
await t('拡大止めとOGP', async () => {
  const p = await open(br)
  const r = await p.evaluate(() => ({ vp: document.querySelector('meta[name=viewport]').content, og: document.querySelector('meta[property="og:image"]').content, ta: getComputedStyle(document.documentElement).touchAction }))
  expect(/user-scalable=no/.test(r.vp) && /og\.png/.test(r.og) && r.ta === 'manipulation', JSON.stringify(r)); await p.context().close()
})
// Xアプリ内（下52px）
await t('Xのアプリ内でも下のボタンが帯にかからない', async () => {
  const p = await open(br, {}, '?inapp=x')
  await p.evaluate(() => gumball.dbg.start()); await p.waitForTimeout(200)
  const b = await p.evaluate(() => document.getElementById('bRetry').getBoundingClientRect().bottom)
  expect(b <= 844 - 52, 'bottom ' + b); await p.context().close(); return { b }
})
await br.close(); server.kill()
writeFileSync(ROOT + '/shots/verify.txt', out.join('\n'))
console.log(out.join('\n')); console.log(`\n${pass} ok / ${fail} fail`)
process.exit(fail ? 1 : 0)
