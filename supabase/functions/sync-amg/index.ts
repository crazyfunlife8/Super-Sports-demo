/* sync-amg/index.ts
   從 ag.amg888.net 同步今日賽事到 matches 表
   資料來源：
     Ball/queryHis → 已結束/進行中（有比分，以此為主）
     Ball/query    → 即將開始（queryHis 沒有的才補）
   部署：supabase functions deploy sync-amg
   環境變數：AMG_USERNAME、AMG_PASSWORD */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36'
const CORS = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' }

const SPORTS = [
  { catId: 4,  sport: 'baseball_mlb'  },
  { catId: 11, sport: 'baseball_cpbl' },
  { catId: 12, sport: 'baseball_npb'  },
] as const

/* ── 登入 ─────────────────────────────────────────── */

function pickCookies(headers: Headers): string {
  return (headers.getSetCookie?.() ?? []).map(h => h.split(';')[0].trim()).join('; ')
}

async function amgLogin(): Promise<string> {
  const username = Deno.env.get('AMG_USERNAME')!
  const password = Deno.env.get('AMG_PASSWORD')!

  const getRes = await fetch('https://ag.amg888.net/', {
    headers: { 'User-Agent': UA }, redirect: 'follow',
  })
  const html = await getRes.text()
  const antiforgeryCookie = pickCookies(getRes.headers)

  const m = html.match(/RequestVerificationToken[^>]*value=["']?([^"'\s>]+)/)
  if (!m) throw new Error('找不到 RequestVerificationToken')

  const loginRes = await fetch('https://ag.amg888.net/Home/Authenticate', {
    method: 'POST',
    headers: {
      'Accept': 'application/json, text/javascript, */*; q=0.01',
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'Cookie': antiforgeryCookie,
      'Origin': 'https://ag.amg888.net',
      'Referer': 'https://ag.amg888.net/',
      'User-Agent': UA,
      'X-Requested-With': 'XMLHttpRequest',
    },
    body: new URLSearchParams({
      '__RequestVerificationToken': m[1],
      'txtac': username, 'txtpd': password, 'txtotp': '',
    }).toString(),
    redirect: 'manual',
  })

  const authCookies = pickCookies(loginRes.headers)
  if (!authCookies) throw new Error(`登入失敗 HTTP ${loginRes.status}`)
  return [antiforgeryCookie, authCookies].filter(Boolean).join('; ')
}

/* ── AMG 請求 ─────────────────────────────────────── */

async function amgPost(cookie: string, path: string, body: string) {
  return fetch(`https://ag.amg888.net${path}`, {
    method: 'POST',
    headers: {
      'Accept': 'application/json, text/javascript, */*; q=0.01',
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'Cookie': cookie,
      'Origin': 'https://ag.amg888.net',
      'Referer': 'https://ag.amg888.net/Home/Index/',
      'User-Agent': UA,
      'X-Requested-With': 'XMLHttpRequest',
    },
    body,
  })
}

/* ── 解析工具 ─────────────────────────────────────── */

function f(v: unknown): number { return parseFloat(String(v || 0)) || 0 }
function s(v: unknown): string { return String(v || '') }

function getHdp(data: Record<string, unknown>[], wagerTypeId: number) {
  const wager = data.find(w => w.WagerTypeID === wagerTypeId)
  const hdps  = (wager?.Hdps as Record<string, unknown>[]) || []
  return hdps.find(h => (h.Status as number) !== -99 && (h.IsClosed as number) !== 1) ?? hdps[0] ?? null
}

/* ── 解析 queryHis 賽事 ───────────────────────────── */

type MatchRecord = Record<string, unknown>

function parseHisGame(game: Record<string, unknown>, sport: string): MatchRecord {
  const allData  = ((game.All  as Record<string, unknown>)?.Data  as Record<string, unknown>[]) || []
  const halfData = ((game.Half as Record<string, unknown>)?.Data  as Record<string, unknown>[]) || []

  const sp  = getHdp(allData,  103)
  const to  = getHdp(allData,  104)
  const ml  = getHdp(allData,  111)
  const oe  = getHdp(allData,  105)
  const hSp = getHdp(halfData, 103)
  const hTo = getHdp(halfData, 104)
  const hMl = getHdp(halfData, 111)

  const allClosed = ((game.All as Record<string, unknown>)?.IsClosed as number) ?? 0
  const hasScore  = game.HomeScore != null && game.HomeScore !== 0
  const status    = (allClosed > 0 || hasScore) ? 'completed' : 'started'

  // ScheduleTime "07-02 00:35" + ADate 年份 → ISO
  const aDate     = String(game.ADate || '').replace(/\//g, '-') // "2026-07-02"
  const timeStr   = String(game.ScheduleTime || '').split(' ')[1] || '00:00'
  const datePart  = aDate || new Date().toISOString().slice(0, 10)

  return {
    match_id:        String(game.EvtID),
    sport,
    home_team:       game.HomeTeam,
    away_team:       game.AwayTeam,
    commence_time:   `${datePart}T${timeStr}:00`,
    spread: {
      home_line:  s(sp?.Hdp1),
      away_line:  s(sp?.Hdp2),
      home_odds:  f(sp?.odds2),
      away_odds:  f(sp?.odds1),
    },
    totals: {
      line:        s(to?.Hdp1),
      over_odds:   f(to?.odds1),
      under_odds:  f(to?.odds2),
    },
    moneyline: {
      home_odds: f(ml?.odds2),
      away_odds: f(ml?.odds1),
    },
    odd_even: {
      odd_odds:  f(oe?.odds1),
      even_odds: f(oe?.odds2),
    },
    first_inning: {
      home_line:    s(hSp?.Hdp1),
      away_line:    s(hSp?.Hdp2),
      home_odds:    f(hSp?.odds2),
      away_odds:    f(hSp?.odds1),
      total_line:   s(hTo?.Hdp1),
      over_odds:    f(hTo?.odds1),
      under_odds:   f(hTo?.odds2),
      ml_home_odds: f(hMl?.odds2),
      ml_away_odds: f(hMl?.odds1),
    },
    full_home_score: (game.HomeScore as number) ?? null,
    full_away_score: (game.AwayScore as number) ?? null,
    half_home_score: (game.FHHomeScore as number) ?? null,
    half_away_score: (game.FHAwayScore as number) ?? null,
    status,
    synced_at: new Date().toISOString(),
  }
}

/* ── 解析 Ball/query 即時賽事（扁平 Evt 陣列） ────── */

// Evt market block 結構（每塊 17 值，從 idx=14 開始，每 17 為一組）
// 讓分(0), 大小(1), 台盤讓分(2), 讓1.5(3), 獨贏(4)
function parseEvtBlock(evt: unknown[], startIdx: number, isMoneyline = false) {
  const i  = startIdx
  const id = String(evt[i] || '')
  if (!id || id === '0') return null
  if (isMoneyline) {
    return {
      away_odds: f(evt[i + 1]), home_odds: f(evt[i + 5]),
      draw_odds: f(evt[i + 9]),
    }
  }
  return {
    line:      s(evt[i + 1]),
    away_odds: f(evt[i + 3]),
    home_odds: f(evt[i + 7]),
  }
}

function parseLiveGame(evt: unknown[], sport: string): MatchRecord | null {
  if (!Array.isArray(evt) || evt[0] !== 0) return null // 只取全場早餐(subType=0)
  const evtId = String(evt[4] || '')
  if (!evtId || evtId === '0') return null

  const sp = parseEvtBlock(evt, 14)
  const to = parseEvtBlock(evt, 31)
  const ml = parseEvtBlock(evt, 82, true)

  // commence_time：Evt[8] = "2026/07/03", Evt[7] = "07-02 17:00"
  const datePart  = String(evt[8] || '').replace(/\//g, '-')
  const timeStr   = String(evt[7] || '').split(' ')[1] || '00:00'

  return {
    match_id:      evtId,
    sport,
    home_team:     String(evt[5] || ''),
    away_team:     String(evt[6] || ''),
    commence_time: `${datePart}T${timeStr}:00`,
    spread:    { home_line: sp?.line || '', away_line: '', home_odds: sp?.home_odds || 0, away_odds: sp?.away_odds || 0 },
    totals:    { line: to?.line || '', over_odds: to?.away_odds || 0, under_odds: to?.home_odds || 0 },
    moneyline: { home_odds: (ml as Record<string, number>)?.home_odds || 0, away_odds: (ml as Record<string, number>)?.away_odds || 0 },
    odd_even:  { odd_odds: 0, even_odds: 0 },
    first_inning: { home_line: '', away_line: '', home_odds: 0, away_odds: 0, total_line: '', over_odds: 0, under_odds: 0, ml_home_odds: 0, ml_away_odds: 0 },
    full_home_score: null,
    full_away_score: null,
    half_home_score: null,
    half_away_score: null,
    status:    'upcoming',
    synced_at: new Date().toISOString(),
  }
}

/* ── 主流程 ───────────────────────────────────────── */

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: { ...CORS, 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': '*' } })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  try {
    const cookie = await amgLogin()
    const now       = Date.now()
    const today     = new Date(now).toISOString().slice(0, 10)
    const yesterday = new Date(now - 86400000).toISOString().slice(0, 10)
    const records = new Map<string, MatchRecord>()
    const log: string[] = []

    // 1. queryHis（有比分的歷史+進行中）— 查昨天 + 今天，確保台棒/日棒跨日資料不漏
    for (const { catId, sport } of SPORTS) {
      for (const qDate of [yesterday, today]) {
        const body = `aDate=${qDate}&CatID=${catId}&GameType=1&hType=0&Idx=0&Sort=0&LID=NONE&l1shrper=0`
        const res  = await amgPost(cookie, '/Ball/queryHis', body)
        if (!res.ok) { log.push(`queryHis ${sport} ${qDate} HTTP ${res.status}`); continue }
        const json = await res.json() as { root?: { Games?: Record<string, unknown>[] }[] }
        let cnt = 0
        for (const league of json.root || []) {
          for (const game of league.Games || []) {
            const r = parseHisGame(game as Record<string, unknown>, sport)
            records.set(r.match_id as string, r)
            cnt++
          }
        }
        log.push(`queryHis ${sport} (${qDate}): ${cnt} 場`)
      }
    }

    // 2. Ball/query（即時/即將，補充 queryHis 沒有的）
    for (const { catId, sport } of SPORTS) {
      const body = `CatID=${catId}&GameType=1&hType=0&Idx=0&Sort=0&LID=NONE&l1shrper=0`
      const res  = await amgPost(cookie, '/Ball/query', body)
      if (!res.ok) { log.push(`query ${sport} HTTP ${res.status}`); continue }
      const json = await res.json() as { root?: { Games?: { Evt?: unknown[] }[] }[] }
      let cnt = 0
      for (const league of json.root || []) {
        for (const game of league.Games || []) {
          const r = parseLiveGame(game.Evt || [], sport)
          if (!r) continue
          if (!records.has(r.match_id as string)) {
            records.set(r.match_id as string, r)
            cnt++
          }
        }
      }
      log.push(`query ${sport}: ${cnt} 場（新增）`)
    }

    // 3. Upsert
    const rows = [...records.values()]
    if (rows.length > 0) {
      const { error } = await supabase.from('matches').upsert(rows, { onConflict: 'match_id' })
      if (error) throw error
    }

    return new Response(JSON.stringify({ ok: true, total: rows.length, log }), { headers: CORS })
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: String(err) }), { status: 500, headers: CORS })
  }
})
