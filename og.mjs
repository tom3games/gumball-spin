import './mute-auto.mjs'
// SNS 用の画像 og.png（1200x630）。太って門につかえたガム＋周りのガム玉と画鋲＋題名。node og.mjs
import { MUTE_LAUNCH, muteContext } from './mute.mjs'
import { chromium } from 'playwright'
import { spawn, execFileSync } from 'node:child_process'
import { createServer } from 'node:net'
const ROOT = import.meta.dirname
const PORT = await new Promise(r => { const s = createServer(); s.listen(0, () => { const n = s.address().port; s.close(() => r(n)) }) })
const server = spawn(process.execPath, ['server.mjs'], { cwd: ROOT, env: { ...process.env, PORT: String(PORT) } })
for (let i = 0; i < 60; i++) { try { if ((await (await fetch(`http://localhost:${PORT}/`)).text()).includes('gumball-spin')) break } catch (e) {} await new Promise(r => setTimeout(r, 100)) }
const b = await chromium.launch(MUTE_LAUNCH), ctx = await b.newContext({ locale: 'ja-JP', viewport: { width: 520, height: 630 }, deviceScaleFactor: 2 })
await muteContext(ctx)
const p = await ctx.newPage()
await p.goto(`http://localhost:${PORT}/`); await p.waitForFunction(() => window.__gbReady && !document.getElementById('loading'), null, { timeout: 15000 })
const shot = await p.evaluate(() => {
  const d = gumball.dbg, S = gumball.S; d.go(7); d.pause()
  document.getElementById('tut').hidden = true
  // 8面: 幅1の門 (8,8) の上で、ガム玉を4つ食べて太ったガムがつかえている。台は少し傾けて
  S.n = 4; S.r = S.rv = 22; S.p.x = 8.5 * 40; S.p.y = 7.3 * 40; S.th = S.tht = -0.32; d.step(50)
  S.cam.x = S.p.x + 10; S.cam.y = S.p.y - 6
  document.getElementById('hud').style.display = 'none'; document.getElementById('pBtns').style.display = 'none'; document.getElementById('msg').style.display = 'none'
  d.render()
  return document.getElementById('cv').toDataURL('image/png')
})
await p.setViewportSize({ width: 1200, height: 630 })
await p.setContent(`<!doctype html><html><head><link href="https://fonts.googleapis.com/css2?family=DotGothic16&family=Zen+Kaku+Gothic+New:wght@700;900&display=swap" rel="stylesheet"><style>
*{margin:0;box-sizing:border-box}body{width:1200px;height:630px;overflow:hidden;font-family:"Zen Kaku Gothic New",sans-serif;
background:radial-gradient(120% 90% at 80% 0%,#cf4a3c 0%,#a8261f 40%,#6e1612 100%)}
img{position:absolute;left:0;top:0;width:520px;height:630px;box-shadow:8px 0 24px rgba(0,0,0,.45)}
.m{position:absolute;left:575px;top:70px;width:575px;background:#17110d;border-radius:14px;padding:22px 30px 30px;box-shadow:inset 0 0 0 4px #2c1f17}
.a{display:block;font-weight:900;font-size:62px;color:#ffe7b0;line-height:1}
.b{display:block;white-space:nowrap;font-weight:900;font-size:94px;color:#fff6e4;line-height:1.02;transform:rotate(-3deg);transform-origin:0 60%;margin-top:6px;text-shadow:0 5px 0 #a8261f}
.s{position:absolute;left:580px;top:330px;font-weight:900;font-size:40px;color:#fff6e4;line-height:1.35}
.s b{color:#ffcf6b}
.d{position:absolute;left:582px;top:470px;font-family:"DotGothic16";font-size:30px;color:#ffb43a;text-shadow:0 0 8px rgba(255,170,40,.6)}
</style></head><body><img src="${shot}"><div class="m"><span class="a">ぐるぐる</span><span class="b">ガムボール</span></div>
<div class="s">台を回して取り出し口へ。<br>食べすぎると<b>太って通れない</b></div><div class="d">スワイプで回すだけ</div></body></html>`)
await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(900)
await p.screenshot({ path: ROOT + '/og.png' })
await b.close(); server.kill()
execFileSync('sips', ['-z', '630', '1200', ROOT + '/og.png'], { stdio: 'ignore' })
console.log('og.png')
