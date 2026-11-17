import './mute-auto.mjs'
import { MUTE_LAUNCH, muteContext } from './mute.mjs'
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { createServer } from 'node:net'
const PORT = await new Promise(r => { const s = createServer(); s.listen(0, () => { const n = s.address().port; s.close(() => r(n)) }) })
const sv = spawn(process.execPath, ['server.mjs'], { cwd: import.meta.dirname, env: { ...process.env, PORT: String(PORT) } })
for (let i = 0; i < 60; i++) { try { if ((await (await fetch(`http://localhost:${PORT}/`)).text()).includes('gumball-spin')) break } catch (e) {} await new Promise(r => setTimeout(r, 100)) }
const b = await chromium.launch(MUTE_LAUNCH)
const ctx = await b.newContext({ locale: 'ja-JP', viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true }); await muteContext(ctx)
const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message))
await p.goto(`http://localhost:${PORT}/`); await p.waitForFunction(() => window.__gbReady && !document.getElementById('loading'), null, { timeout: 15000 })
const scenes = {
  // 5面の途中、台を傾けて転がっている
  roll: () => { const d = gumball.dbg, S = gumball.S; d.go(4); d.pause(); document.getElementById('tut').hidden = true; d.bot(true); d.step(150); d.bot(false); d.setTh(S.th) },
  // 3面で4つ食べて太り、門の上で止まる
  fat: () => { const d = gumball.dbg, S = gumball.S; d.go(2); d.pause(); document.getElementById('tut').hidden = true; S.n = 4; S.r = S.rv = 22; S.p.x = 7.5 * 40; S.p.y = 2.4 * 40; S.th = S.tht = 0.15; d.step(60) },
  // 2面で画鋲に当たって割れた瞬間
  pop: () => { const d = gumball.dbg, S = gumball.S; d.go(1); d.pause(); document.getElementById('tut').hidden = true; S.p.x = 11.5 * 40; S.p.y = 1.6 * 40; S.th = S.tht = 0.3; d.step(40) },
  // 6面 逆さまに回した所
  flip: () => { const d = gumball.dbg, S = gumball.S; d.go(5); d.pause(); document.getElementById('tut').hidden = true; S.th = S.tht = 2.6; S.p.x = 6.5 * 40; S.p.y = 6.5 * 40; d.step(20) },
}
for (const [k, fn] of Object.entries(scenes)) {
  await p.evaluate(`(${fn})()`); await p.evaluate(() => gumball.dbg.render()); await p.waitForTimeout(120)
  await p.screenshot({ path: `shots/scene-${k}.png` })
}
console.log('errors', errs.length, errs.slice(0, 3))
await b.close(); sv.kill()
