// Loopback platform stand-in. This process is never imported by the app worker.
import { createServer } from 'node:http'
import { generateKeyPairSync, randomUUID, sign } from 'node:crypto'
import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const port = Number(process.env.GAVEL_REVIEW_PORT || 5198)
const origin = 'http://127.0.0.1:' + port
const profiles = ['Organizer', 'Alice', 'Bob']
const codes = new Map()
const sessions = new Map()
const keys = generateKeyPairSync('ec', { namedCurve: 'prime256v1' })
const publicKey = keys.publicKey
  .export({ type: 'spki', format: 'pem' })
  .toString()
const encode = (value) =>
  Buffer.from(JSON.stringify(value)).toString('base64url')
const previewArt = readFileSync(
  new URL('./review-art.png', import.meta.url),
).toString('base64')
const home =
  '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Local review profiles · Gavel</title><style>body{background:#171b19;color:#f0f2e8;font:17px system-ui;max-width:480px;margin:12vh auto;padding:24px}h1{letter-spacing:-.05em}button{display:block;width:100%;background:#c7ef88;border:0;border-radius:7px;padding:14px;margin:10px 0;text-align:left;font:inherit;cursor:pointer}</style><main><small>GAVEL / LOCAL REVIEW</small><h1>Choose a test profile</h1><p>This profile only exists on this computer. Open a private window to try a second bidder.</p><form method="post" action="/choose">' +
  profiles
    .map(
      (name) =>
        '<button name="profile" value="' + name + '">' + name + '</button>',
    )
    .join('') +
  '</form></main></html>'
let issuer
const server = createServer(async (req, res) => {
  const path = new URL(req.url, 'http://127.0.0.1').pathname
  function json(data, status = 200) {
    res.writeHead(status, {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    })
    res.end(JSON.stringify(data))
  }
  if (req.headers.host !== new URL(issuer).host)
    return json({ error: 'Local host required' }, 403)
  if (path === '/login/social') {
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
    })
    return res.end(home)
  }
  if (path === '/choose' && req.method === 'POST') {
    if (req.headers.origin !== issuer)
      return json({ error: 'Invalid origin' }, 403)
    let body = ''
    for await (const chunk of req) body += chunk
    const profile = new URLSearchParams(body).get('profile')
    if (!profiles.includes(profile))
      return json({ error: 'Unknown profile' }, 400)
    const code = randomUUID()
    codes.set(code, { profile, expires: Date.now() + 60000 })
    res.writeHead(303, {
      Location: origin + '/api/auth/oauth-complete?code=' + code,
    })
    return res.end()
  }
  if (path === '/api/auth/exchange-code' && req.method === 'POST') {
    let body = ''
    for await (const chunk of req) body += chunk
    let code
    try {
      code = JSON.parse(body).code
    } catch {
      return json({}, 400)
    }
    const value = codes.get(code)
    codes.delete(code)
    if (!value || value.expires < Date.now()) return json({}, 401)
    const sessionToken = randomUUID()
    sessions.set(sessionToken, value.profile)
    return json({ sessionToken })
  }
  if (path === '/api/auth/token') {
    const cookie = (req.headers.cookie || '').match(
      /(?:^|;\s*)__Secure-better-auth\.session_token=([^;]+)/,
    )?.[1]
    const profile = sessions.get(cookie)
    if (!profile) return json({ token: null })
    const now = Math.floor(Date.now() / 1000)
    const claims = {
      sub: 'preview-' + profile,
      name: profile,
      email: profile.toLowerCase() + '@example.invalid',
      iss: issuer,
      iat: now,
      exp: now + 600,
    }
    const payload = encode({ alg: 'ES256', typ: 'JWT' }) + '.' + encode(claims)
    const signature = sign('SHA256', Buffer.from(payload), {
      key: keys.privateKey,
      dsaEncoding: 'ieee-p1363',
    }).toString('base64url')
    return json({ token: payload + '.' + signature })
  }
  if (path === '/api/auth/ok') return json({ ok: true })
  if (path === '/api/integrations/gemini/generate-image')
    return json({
      success: true,
      data: { base64Images: ['data:image/png;base64,' + previewArt] },
    })
  if (path === '/api/integrations/email/send') {
    console.info('Local email fixture accepted a notification.')
    return json({ success: true, data: { id: randomUUID() } })
  }
  return json({ error: 'No local fixture for this request' }, 404)
})
await new Promise((resolve, reject) =>
  server.once('error', reject).listen(0, '127.0.0.1', resolve),
)
issuer = 'http://127.0.0.1:' + server.address().port
const vite = spawn(
  process.execPath,
  [
    fileURLToPath(new URL('../node_modules/vite/bin/vite.js', import.meta.url)),
    '--host',
    '127.0.0.1',
    '--port',
    String(port),
    '--strictPort',
    '--mode',
    'review',
  ],
  {
    stdio: 'inherit',
    env: {
      ...process.env,
      GAVEL_LOCAL_ISSUER: issuer,
      GAVEL_LOCAL_PUBLIC_KEY: publicKey,
      WRANGLER_SEND_METRICS: 'false',
      CLOUDFLARE_VITE_TUNNEL: 'false',
    },
  },
)
vite.once('exit', (code) => {
  server.close()
  process.exit(code ?? 0)
})
for (const signal of ['SIGTERM', 'SIGINT'])
  process.on(signal, () => vite.kill(signal))
