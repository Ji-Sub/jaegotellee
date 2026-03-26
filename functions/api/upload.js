/**
 * /api/upload — 이미지 파일 다중 업로드 → Cloudflare R2
 * POST multipart/form-data, 필드명: files (복수)
 * 환경변수: R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_ENDPOINT, R2_PUBLIC_URL
 */

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function onRequest(context) {
  const { request, env } = context;

  // OPTIONS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (request.method !== 'POST') {
    return json({ error: 'POST 요청만 허용됩니다.' }, 405);
  }

  // R2 환경변수 체크
  const accessKeyId     = env?.R2_ACCESS_KEY_ID;
  const secretAccessKey = env?.R2_SECRET_ACCESS_KEY;
  const endpoint        = env?.R2_ENDPOINT;
  const publicUrl       = env?.R2_PUBLIC_URL;

  if (!accessKeyId || !secretAccessKey || !endpoint || !publicUrl) {
    return json({ error: 'R2 환경변수 미설정 (R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_ENDPOINT, R2_PUBLIC_URL)' }, 500);
  }

  let formData;
  try {
    formData = await request.formData();
  } catch (e) {
    return json({ error: 'multipart/form-data 파싱 실패: ' + e.message }, 400);
  }

  const files = formData.getAll('files');
  if (!files || files.length === 0) {
    return json({ error: '업로드할 파일이 없습니다 (필드명: files)' }, 400);
  }

  // 파일 타입 검증 + 병렬 업로드
  const uploadJobs = files.map(async (file) => {
    if (!(file instanceof File)) throw new Error('유효하지 않은 파일 객체');

    const mime = file.type || 'image/jpeg';
    if (!mime.startsWith('image/')) throw new Error(`이미지 파일만 허용됩니다: ${mime}`);

    const ext = mime.split('/')[1]?.replace('jpeg', 'jpg') || 'jpg';
    const buffer = await file.arrayBuffer();
    return uploadToR2(buffer, mime, ext, { accessKeyId, secretAccessKey, endpoint, publicUrl });
  });

  let urls;
  try {
    urls = await Promise.all(uploadJobs);
  } catch (e) {
    console.error('[upload.js] 업로드 실패:', e.message);
    return json({ error: '업로드 실패: ' + e.message }, 500);
  }

  return json({ success: true, urls });
}

// ── R2 업로드 (AWS Signature V4) ─────────────────────────────────────────────
async function uploadToR2(buffer, contentType, ext, { accessKeyId, secretAccessKey, endpoint, publicUrl }) {
  const bucket   = 'hiddendeal-images';
  const filename = `uploads/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const uploadUrl = `${endpoint}/${bucket}/${filename}`;

  const now      = new Date();
  const dateStr  = now.toISOString().replace(/[:-]|\.\d{3}/g, '').slice(0, 15) + 'Z';
  const dateOnly = dateStr.slice(0, 8);
  const region   = 'auto';
  const service  = 's3';
  const host     = new URL(endpoint).host;

  const payloadHash = await sha256Hex(buffer);

  const headers = {
    'host':                  host,
    'content-type':          contentType,
    'x-amz-content-sha256':  payloadHash,
    'x-amz-date':            dateStr,
  };

  const signedHeaders    = Object.keys(headers).sort().join(';');
  const canonicalHeaders = Object.keys(headers).sort().map(k => `${k}:${headers[k]}`).join('\n') + '\n';
  const canonicalRequest = ['PUT', `/${bucket}/${filename}`, '', canonicalHeaders, signedHeaders, payloadHash].join('\n');

  const credentialScope = `${dateOnly}/${region}/${service}/aws4_request`;
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    dateStr,
    credentialScope,
    await sha256Hex(new TextEncoder().encode(canonicalRequest)),
  ].join('\n');

  const signingKey  = await getSigningKey(secretAccessKey, dateOnly, region, service);
  const signature   = await hmacHex(signingKey, stringToSign);
  const authorization = `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const res = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      ...headers,
      'Authorization':  authorization,
      'Content-Length': String(buffer.byteLength),
    },
    body: buffer,
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`R2 업로드 실패 (${res.status}): ${errText}`);
  }

  return `${publicUrl}/${filename}`;
}

// ── AWS Signature V4 헬퍼 ────────────────────────────────────────────────────
async function sha256Hex(data) {
  const buf  = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  const hash = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function hmacHex(key, message) {
  const msgBuf = new TextEncoder().encode(message);
  const sig    = await crypto.subtle.sign('HMAC', key, msgBuf);
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function hmacKey(key, message) {
  const keyBuf   = typeof key === 'string' ? new TextEncoder().encode(key) : key;
  const msgBuf   = new TextEncoder().encode(message);
  const imported = await crypto.subtle.importKey('raw', keyBuf, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig      = await crypto.subtle.sign('HMAC', imported, msgBuf);
  return new Uint8Array(sig);
}

async function getSigningKey(secretKey, dateOnly, region, service) {
  const kDate    = await hmacKey(`AWS4${secretKey}`, dateOnly);
  const kRegion  = await hmacKey(kDate, region);
  const kService = await hmacKey(kRegion, service);
  const kSigning = await hmacKey(kService, 'aws4_request');
  return crypto.subtle.importKey('raw', kSigning, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
}

// ── 응답 헬퍼 ────────────────────────────────────────────────────────────────
function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}
