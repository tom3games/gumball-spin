// 面の点検: 始まりから取り出し口までつながっているか・行けない空きマス・細い切れ目の真下や真上の画鋲
globalThis.window = {}; await import('./data.js')
let bad = 0
for (const [i, st] of window.GB_STAGES.entries()) {
  const g = st.map.map(r => r.split('')), H = g.length, W = g[0].length
  const at = (x, y) => (x < 0 || y < 0 || x >= W || y >= H) ? '#' : g[y][x]
  const solid = c => c === '#' || c === '^'
  let S, G; g.forEach((r, y) => r.forEach((c, x) => { if (c === 'S') S = [x, y]; if (c === 'G') G = [x, y] }))
  const seen = new Set([S + '']), q = [S]
  while (q.length) { const [x, y] = q.shift(); for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) { const nx = x + dx, ny = y + dy; if (solid(at(nx, ny)) || seen.has(nx + ',' + ny)) continue; seen.add(nx + ',' + ny); q.push([nx, ny]) } }
  const open = []; g.forEach((r, y) => r.forEach((c, x) => { if (!solid(c)) open.push([x, y]) }))
  const unreach = open.filter(p => !seen.has(p + '')).map(p => p.join(','))
  const narrow = (x, y) => !solid(at(x, y)) && ((solid(at(x - 1, y)) && solid(at(x + 1, y))) || (solid(at(x, y - 1)) && solid(at(x, y + 1))))
  const wall = c => c === '#'
  const gate = (x, y) => !solid(at(x, y)) && ((wall(at(x - 1, y)) && wall(at(x + 1, y))) || (wall(at(x, y - 1)) && wall(at(x, y + 1))))
  const pinUnderGap = []
  // 門から真っすぐ上下に落ちた先（壁に当たるまで）に画鋲があれば NG
  for (const [x, y] of open) if (gate(x, y)) for (const s of [1, -1]) { let k = y + s; while (!solid(at(x, k))) k += s; if (at(x, k) === '^') pinUnderGap.push(`${x},${y}`) }
  const items = open.filter(([x, y]) => 'cmw'.includes(at(x, y)) && narrow(x, y)).map(p => p.join(','))
  const ok = seen.has(G + '') && !unreach.length && !pinUnderGap.length && !items.length
  if (!ok) bad++
  console.log(`${i + 1} ${ok ? 'ok ' : 'NG '} goal:${seen.has(G + '')} 行けない:${unreach.join(' ') || '-'} 切れ目の上下に画鋲:${pinUnderGap.join(' ') || '-'} 細道に物:${items.join(' ') || '-'}`)
}
process.exit(bad ? 1 : 0)
