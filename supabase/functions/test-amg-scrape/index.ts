import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36'
const CORS = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' }

function pickCookies(headers: Headers): string {
  return (headers.getSetCookie?.() ?? []).map(h => h.split(';')[0].trim()).join('; ')
}

async function amgLogin(): Promise<string> {
  const username = Deno.env.get('AMG_USERNAME')!
  const password = Deno.env.get('AMG_PASSWORD')!
  const getRes = await fetch('https://ag.amg888.net/', { headers: { 'User-Agent': UA }, redirect: 'follow' })
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
    body: new URLSearchParams({ '__RequestVerificationToken': m[1], 'txtac': username, 'txtpd': password, 'txtotp': '' }).toString(),
    redirect: 'manual',
  })
  const authCookies = pickCookies(loginRes.headers)
  if (!authCookies) throw new Error(`登入失敗 HTTP ${loginRes.status}`)
  return [antiforgeryCookie, authCookies].filter(Boolean).join('; ')
}

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

function f(v: unknown): number { return parseFloat(String(v || 0)) || 0 }
function s(v: unknown): string { return String(v ?? '') }

function getHdp(data: Record<string, unknown>[], wagerTypeId: number) {
  const wager = data.find(w => w.WagerTypeID === wagerTypeId)
  const hdps = (wager?.Hdps as Record<string, unknown>[]) || []
  return hdps.find(h => (h.Status as number) !== -99 && (h.IsClosed as number) !== 1) ?? hdps[0] ?? null
}

function parseOdds(g: Record<string, unknown>) {
  const allData  = ((g.All  as Record<string, unknown>)?.Data as Record<string, unknown>[]) || []
  const halfData = ((g.Half as Record<string, unknown>)?.Data as Record<string, unknown>[]) || []
  const sp  = getHdp(allData,  103)
  const to  = getHdp(allData,  104)
  const ml  = getHdp(allData,  111)
  const oe  = getHdp(allData,  105)
  const hSp = getHdp(halfData, 103)
  const hTo = getHdp(halfData, 104)
  const hMl = getHdp(halfData, 111)
  return {
    spread:       { home_line: s(sp?.Hdp1),  away_line: s(sp?.Hdp2),  home_odds: f(sp?.odds2),  away_odds: f(sp?.odds1)  },
    totals:       { line: s(to?.Hdp1),        over_odds: f(to?.odds1),  under_odds: f(to?.odds2) },
    moneyline:    { home_odds: f(ml?.odds2),   away_odds: f(ml?.odds1) },
    odd_even:     { odd_odds: f(oe?.odds1),    even_odds: f(oe?.odds2) },
    first_inning: {
      home_line: s(hSp?.Hdp1), away_line: s(hSp?.Hdp2),
      home_odds: f(hSp?.odds2), away_odds: f(hSp?.odds1),
      total_line: s(hTo?.Hdp1), over_odds: f(hTo?.odds1), under_odds: f(hTo?.odds2),
      ml_home_odds: f(hMl?.odds2), ml_away_odds: f(hMl?.odds1),
    },
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: { ...CORS, 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': '*' } })
  }

  try {
    const cookie = await amgLogin()
    const date = new Date().toISOString().slice(0, 10)
    const result: Record<string, unknown> = { date, queryHis: {}, query: {} }

    const SPORTS = [
      { catId: 4,  sport: 'mlb'  },
      { catId: 11, sport: 'cpbl' },
      { catId: 12, sport: 'npb'  },
    ]

    // queryHis：已結束/進行中（含盤口）
    for (const { catId, sport } of SPORTS) {
      const body = `aDate=${date}&CatID=${catId}&GameType=1&hType=0&Idx=0&Sort=0&LID=NONE&l1shrper=0`
      const res = await amgPost(cookie, '/Ball/queryHis', body)
      if (!res.ok) { result.queryHis[sport] = { error: `HTTP ${res.status}` }; continue }
      const json = await res.json() as { root?: { LName?: string; Games?: Record<string, unknown>[] }[] }
      const games: unknown[] = []
      for (const league of json.root || []) {
        for (const g of league.Games || []) {
          games.push({
            EvtID:        g.EvtID,
            ScheduleTime: g.ScheduleTime,
            HomeTeam:     g.HomeTeam,
            AwayTeam:     g.AwayTeam,
            HomeScore:    g.HomeScore,
            AwayScore:    g.AwayScore,
            FHHomeScore:  g.FHHomeScore,
            FHAwayScore:  g.FHAwayScore,
            league:       league.LName,
            ...parseOdds(g),
          })
        }
      }
      result.queryHis[sport] = games
    }

    // Ball/query：即時/即將（基本資料）
    for (const { catId, sport } of SPORTS) {
      const body = `CatID=${catId}&GameType=1&hType=0&Idx=0&Sort=0&LID=NONE&l1shrper=0`
      const res = await amgPost(cookie, '/Ball/query', body)
      if (!res.ok) { result.query[sport] = { error: `HTTP ${res.status}` }; continue }
      const json = await res.json() as { root?: { LName?: string; Games?: { Evt?: unknown[] }[] }[] }
      const games: unknown[] = []
      for (const league of json.root || []) {
        for (const g of league.Games || []) {
          const evt = g.Evt || []
          if (!Array.isArray(evt) || evt[0] !== 0) continue
          games.push({
            EvtID:    evt[4],
            date:     evt[8],
            time:     evt[7],
            HomeTeam: evt[5],
            AwayTeam: evt[6],
            league:   league.LName,
          })
        }
      }
      result.query[sport] = games
    }

    return new Response(JSON.stringify(result, null, 2), { headers: CORS })
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: CORS })
  }
})
