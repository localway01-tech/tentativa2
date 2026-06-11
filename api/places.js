/**
 * /api/places — Proxy para Google Places API
 * Env: GOOGLE_PLACES_API_KEY
 */

export const config = { maxDuration: 30 };

const BASE = 'https://maps.googleapis.com/maps/api/place';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const KEY = process.env.GOOGLE_PLACES_API_KEY;
  if (!KEY) {
    return res.status(500).json({
      error: 'GOOGLE_PLACES_API_KEY não configurada na Vercel.',
      hint: 'Vá em Settings → Environment Variables e adicione GOOGLE_PLACES_API_KEY'
    });
  }

  const action    = req.query.action    || '';
  const query     = req.query.query     || '';
  const place_id  = req.query.place_id  || '';
  const location  = req.query.location  || '';
  const radius    = req.query.radius    || '1000';
  const keyword   = req.query.keyword   || '';
  const ref       = req.query.ref       || '';
  const maxwidth  = req.query.maxwidth  || '800';
  const url       = req.query.url       || '';

  try {
    // ── SEARCH ──────────────────────────────────────────────────────────
    if (action === 'search') {
      if (!query) return res.status(400).json({ error: 'query obrigatório' });
      const apiUrl = `${BASE}/textsearch/json?query=${encodeURIComponent(query)}&language=pt-BR&key=${KEY}`;
      const data = await gFetch(apiUrl);
      return res.status(200).json(data);
    }

    // ── DETAILS ─────────────────────────────────────────────────────────
    if (action === 'details') {
      if (!place_id) return res.status(400).json({ error: 'place_id obrigatório' });
      const fields = [
        'place_id','name','formatted_address','formatted_phone_number',
        'website','rating','user_ratings_total','types','business_status',
        'opening_hours','photos','reviews','geometry','url',
        'editorial_summary','delivery','dine_in','takeout','serves_beer',
        'wheelchair_accessible_entrance','reservable',
        'serves_breakfast','serves_lunch','serves_dinner',
      ].join(',');
      const apiUrl = `${BASE}/details/json?place_id=${encodeURIComponent(place_id)}&fields=${fields}&language=pt-BR&key=${KEY}`;
      const data = await gFetch(apiUrl);
      return res.status(200).json(data);
    }

    // ── NEARBY ──────────────────────────────────────────────────────────
    if (action === 'nearby') {
      if (!location || !keyword) return res.status(400).json({ error: 'location e keyword obrigatórios' });
      const apiUrl = `${BASE}/nearbysearch/json?location=${location}&radius=${radius}&keyword=${encodeURIComponent(keyword)}&language=pt-BR&key=${KEY}`;
      const data = await gFetch(apiUrl);
      return res.status(200).json(data);
    }

    // ── PHOTO (proxy binário) ────────────────────────────────────────────
    if (action === 'photo') {
      if (!ref) return res.status(400).json({ error: 'ref obrigatório' });
      const photoUrl = `${BASE}/photo?maxwidth=${maxwidth}&photoreference=${ref}&key=${KEY}`;
      const photoResp = await fetch(photoUrl);
      const ct = photoResp.headers.get('content-type') || 'image/jpeg';
      res.setHeader('Content-Type', ct);
      res.setHeader('Cache-Control', 'public, max-age=86400');
      return res.status(200).send(Buffer.from(await photoResp.arrayBuffer()));
    }

    // ── RESOLVE_URL ──────────────────────────────────────────────────────
    if (action === 'resolve_url') {
      if (!url) return res.status(400).json({ error: 'url obrigatório' });

      // Helper: extrai place_id de uma URL já expandida
      function extractPlaceId(u) {
        // place_id= ou place_id:
        const m1 = u.match(/place_id[=:]([A-Za-z0-9_-]{10,})/);
        if (m1) return m1[1];
        // !1s0x... (hex place id embutido na URL longa do Maps)
        const m2 = u.match(/!1s(0x[0-9a-fA-F]+:[0-9a-fA-F]+)/);
        if (m2) return m2[1];
        return null;
      }

      // Helper: extrai coordenadas @lat,lng de uma URL
      function extractCoords(u) {
        const m = u.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
        return m ? { lat: m[1], lng: m[2] } : null;
      }

      // Helper: textsearch com localização obrigatória quando disponível
      async function searchByNameAndCoords(name, coords) {
        let apiUrl = `${BASE}/textsearch/json?query=${encodeURIComponent(name)}&language=pt-BR&key=${KEY}`;
        if (coords) {
          // location + radius restringe resultado à região do link
          apiUrl += `&location=${coords.lat},${coords.lng}&radius=2000`;
        }
        return gFetch(apiUrl);
      }

      // 1) place_id direto na URL original
      const pid1 = extractPlaceId(url);
      if (pid1) return res.status(200).json({ place_id: pid1 });

      // 2) URL longa com /maps/place/NOME/ — extrai coords antes de buscar
      const m2 = url.match(/maps\/place\/([^/@?&]+)/);
      if (m2 && !/^[A-Za-z0-9]{20,}$/.test(m2[1])) {
        const name   = decodeURIComponent(m2[1].replace(/\+/g, ' '));
        const coords = extractCoords(url);
        return res.status(200).json(await searchByNameAndCoords(name, coords));
      }

      // 3) Seguir redirects do link curto (maps.app.goo.gl e similares)
      let current = url;
      for (let i = 0; i < 6; i++) {
        let resp;
        try {
          resp = await fetch(current, {
            method: 'GET',
            redirect: 'manual',
            headers: {
              'User-Agent': 'Mozilla/5.0 (Linux; Android 12; Pixel 6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Mobile Safari/537.36',
              'Accept-Language': 'pt-BR,pt;q=0.9'
            }
          });
        } catch (e) { break; }

        const loc = resp.headers.get('location');

        // ── NOVO: tenta extrair place_id do body HTML (Google bloqueou redirect) ──
        if (!loc) {
          try {
            const html = await resp.text();
            // place_id em JSON embutido no HTML
            const pm = html.match(/"place_id"\s*:\s*"([A-Za-z0-9_-]{10,})"/);
            if (pm) return res.status(200).json({ place_id: pm[1] });
            // URL canônica dentro do HTML
            const um = html.match(/https:\/\/www\.google\.com\/maps\/place\/([^"\\]+)/);
            if (um) {
              current = 'https://www.google.com/maps/place/' + um[1];
              continue;
            }
          } catch(_) {}
          break;
        }

        current = loc.startsWith('http') ? loc : new URL(loc, current).href;

        // verifica place_id ou hex id na URL atual
        const pid = extractPlaceId(current);
        if (pid) return res.status(200).json({ place_id: pid });

        // /maps/place/NOME/ — SEMPRE usa coords se disponível
        const nm = current.match(/maps\/place\/([^/@?&]+)/);
        if (nm && !/^[A-Za-z0-9]{20,}$/.test(nm[1])) {
          const name   = decodeURIComponent(nm[1].replace(/\+/g, ' '));
          const coords = extractCoords(current);
          return res.status(200).json(await searchByNameAndCoords(name, coords));
        }

        // CID (ex: ?cid=123456)
        const cid = current.match(/[?&]cid=(\d+)/);
        if (cid) {
          const fp = await gFetch(`${BASE}/findplacefromtext/json?input=cid:${cid[1]}&inputtype=textquery&fields=place_id&key=${KEY}`);
          if (fp.candidates?.[0]) return res.status(200).json({ place_id: fp.candidates[0].place_id });
        }

        // query param ?q= — SEMPRE usa coords se disponível
        const qp = current.match(/[?&]q=([^&]+)/);
        if (qp) {
          const q      = decodeURIComponent(qp[1].replace(/\+/g, ' '));
          const coords = extractCoords(current);
          return res.status(200).json(await searchByNameAndCoords(q, coords));
        }

        if (!loc) break; // sem mais redirects
      }

      // 4) Última tentativa — coordenadas @lat,lng (nearbysearch raio pequeno)
      const coord = current.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
      if (coord) {
        const data = await gFetch(`${BASE}/nearbysearch/json?location=${coord[1]},${coord[2]}&radius=50&rankby=distance&key=${KEY}`);
        return res.status(200).json(data);
      }

      return res.status(200).json({ error: 'Não foi possível resolver este link. Tente copiar a URL da barra de endereço do Google Maps.' });
    }

    return res.status(400).json({ error: `Ação desconhecida: "${action}"` });

  } catch (err) {
    console.error('[api/places] ERRO:', err.message);
    return res.status(500).json({ error: 'Erro interno: ' + err.message });
  }
}

async function gFetch(url) {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Google API HTTP ${resp.status}`);
  const data = await resp.json();
  if (data.status && !['OK','ZERO_RESULTS'].includes(data.status)) {
    throw new Error(`Google Places: ${data.status} — ${data.error_message || ''}`);
  }
  return data;
}
