const RULES = [
  {
    match: ({ httpStatus, code }) => httpStatus === 401 || /AUTH|UNAUTHORIZED|TOKEN|AUTHENTIC/i.test(code),
    category: 'AUTHENTICATION',
    priority: 'HIGH',
    title: 'Autentikasi tidak valid',
    cause: 'Token atau kredensial autentikasi tidak valid, kedaluwarsa, atau tidak terbaca.',
    advice: 'Periksa konfigurasi credential, masa berlaku token, dan mekanisme autentikasi. Jangan mengubah atau mengirim ulang data secara otomatis.'
  },
  {
    match: ({ httpStatus, code }) => httpStatus === 403 || /FORBIDDEN|ACCESS_DENIED|PERMISSION/i.test(code),
    category: 'AUTHORIZATION',
    priority: 'HIGH',
    title: 'Akses ditolak',
    cause: 'Credential berhasil dikenali tetapi tidak memiliki izin untuk resource atau operasi tersebut.',
    advice: 'Periksa scope/role credential dan hak akses Organization. Konfirmasi izin pada environment yang digunakan sebelum melakukan pengiriman.'
  },
  {
    match: ({ httpStatus, code }) => httpStatus === 422 || /VALIDATION|INVALID|REQUIRED|FORMAT|MAPPING/i.test(code),
    category: 'VALIDATION',
    priority: 'HIGH',
    title: 'Data ditolak karena validasi',
    cause: 'Payload tidak memenuhi aturan validasi resource, field wajib, format, kode, referensi, atau mapping.',
    advice: 'Periksa field wajib, tipe/format nilai, kode terminology, referensi resource, dan mapping Khanza ke SATUSEHAT. Perbaiki sumber/mapping terlebih dahulu; jangan mengubah data sumber dari dashboard.'
  },
  {
    match: ({ httpStatus, code }) => httpStatus === 400 || /BAD_REQUEST|MALFORMED|INVALID_REQUEST/i.test(code),
    category: 'REQUEST',
    priority: 'MEDIUM',
    title: 'Request tidak valid',
    cause: 'Request atau struktur payload tidak sesuai dengan kontrak API.',
    advice: 'Periksa endpoint, HTTP method, header, parameter, dan struktur payload berdasarkan dokumentasi environment yang digunakan.'
  },
  {
    match: ({ httpStatus, code }) => httpStatus === 404 || /NOT_FOUND|UNKNOWN_RESOURCE/i.test(code),
    category: 'REFERENCE',
    priority: 'MEDIUM',
    title: 'Resource atau referensi tidak ditemukan',
    cause: 'Resource, endpoint, atau referensi yang diminta tidak ditemukan pada environment tujuan.',
    advice: 'Periksa identifier, endpoint/environment, Organization, dan referensi resource yang digunakan. Pastikan ID berasal dari environment yang sama.'
  },
  {
    match: ({ httpStatus, code }) => httpStatus === 409 || /CONFLICT|DUPLICATE/i.test(code),
    category: 'CONFLICT',
    priority: 'MEDIUM',
    title: 'Konflik atau duplikasi',
    cause: 'Request bertabrakan dengan state/resource yang sudah ada atau dianggap duplikat.',
    advice: 'Periksa resource yang sudah tercatat dan identifier yang digunakan. Jangan melakukan retry otomatis sebelum penyebab konflik dipastikan.'
  },
  {
    match: ({ httpStatus, code }) => httpStatus === 429 || /RATE|THROTTL/i.test(code),
    category: 'RATE_LIMIT',
    priority: 'MEDIUM',
    title: 'Rate limit tercapai',
    cause: 'Jumlah request melebihi batas yang diizinkan oleh layanan.',
    advice: 'Periksa frekuensi request dan kebijakan rate limit. Gunakan backoff terkontrol pada mekanisme pengirim ketika fase pengiriman sudah diaktifkan; dashboard saat ini tidak melakukan retry.'
  },
  {
    match: ({ httpStatus, code }) => httpStatus >= 500 || /SERVER|UPSTREAM|GATEWAY|TIMEOUT/i.test(code),
    category: 'SERVER',
    priority: 'HIGH',
    title: 'Gangguan layanan tujuan',
    cause: 'Layanan tujuan atau upstream mengalami gangguan dan belum dapat memproses request.',
    advice: 'Periksa status layanan, response body, correlation/request ID, dan waktu kejadian. Hindari retry berulang sampai layanan stabil.'
  }
];

export function getAdvisory(error = {}) {
  const httpStatus = Number(error.http_status) || null;
  const code = String(error.error_code || '').toUpperCase();
  const rule = RULES.find(item => item.match({ httpStatus, code }));

  if (rule) {
    return {
      category: rule.category,
      priority: rule.priority,
      title: rule.title,
      cause: rule.cause,
      advice: rule.advice,
      automated_action: 'NONE'
    };
  }

  return {
    category: 'UNKNOWN',
    priority: 'LOW',
    title: 'Error perlu pemeriksaan manual',
    cause: 'Belum ada rule advisory yang cocok dengan error code atau HTTP status ini.',
    advice: 'Periksa response, error code, payload terkait, dan log pada waktu kejadian. Tambahkan rule khusus setelah pola error teridentifikasi.',
    automated_action: 'NONE'
  };
}
