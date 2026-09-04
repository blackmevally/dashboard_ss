const RULES = [
  {
    match: ({ httpStatus, code }) => httpStatus === 401 || /AUTH|UNAUTHORIZED|TOKEN|AUTHENTIC/i.test(code),
    category: 'AUTHENTICATION', priority: 'HIGH', title: 'Autentikasi tidak valid',
    cause: 'Token atau kredensial autentikasi tidak valid, kedaluwarsa, atau tidak terbaca.',
    advice: 'Periksa konfigurasi credential, masa berlaku token, dan mekanisme autentikasi. Setelah diperbaiki, ulangi pemeriksaan resource yang terdampak.'
  },
  {
    match: ({ httpStatus, code }) => httpStatus === 403 || /FORBIDDEN|ACCESS_DENIED|PERMISSION/i.test(code),
    category: 'AUTHORIZATION', priority: 'HIGH', title: 'Akses ditolak',
    cause: 'Credential dikenali tetapi tidak memiliki izin untuk resource atau operasi tersebut.',
    advice: 'Periksa scope/role credential dan hak akses Organization pada environment yang digunakan.'
  },
  {
    match: ({ code }) => code === 'PATIENT_NIK_INVALID',
    category: 'SOURCE_DATA', priority: 'HIGH', title: 'NIK pasien tidak valid',
    cause: 'NIK dari Khanza tidak tersedia atau bukan 16 digit.',
    advice: 'Perbaiki data NIK di sumber Khanza terlebih dahulu. Dashboard tidak mengubah source-of-truth dan tidak membuat Patient otomatis.'
  },
  {
    match: ({ code }) => code === 'PATIENT_MULTIPLE_MATCHES',
    category: 'IDENTITY', priority: 'HIGH', title: 'Multiple Patient untuk satu NIK',
    cause: 'SATUSEHAT mengembalikan lebih dari satu Patient kandidat.',
    advice: 'Lakukan review identitas dan mapping secara manual. Jangan memilih kandidat pertama dan jangan membuat Patient duplikat.'
  },
  {
    match: ({ code }) => code === 'PATIENT_IDENTIFIER_MISMATCH',
    category: 'IDENTITY', priority: 'HIGH', title: 'Identifier NIK tidak cocok',
    cause: 'Response Patient tidak memiliki identifier NIK yang sama persis dengan NIK sumber.',
    advice: 'Periksa identifier dan environment SATUSEHAT. Blokir mapping sampai kecocokan NIK terverifikasi.'
  },
  {
    match: ({ code }) => code === 'PATIENT_NOT_FOUND',
    category: 'IDENTITY', priority: 'MEDIUM', title: 'Patient belum ditemukan di SATUSEHAT',
    cause: 'Lookup NIK tidak menemukan Patient pada environment tujuan.',
    advice: 'Verifikasi NIK dan environment. Jika memang belum ada dan fase CREATE sudah diaktifkan, lanjutkan melalui workflow create yang terkontrol; jangan membuat dari mode monitoring.'
  },
  {
    match: ({ httpStatus, code }) => httpStatus === 422 || /VALIDATION|INVALID|REQUIRED|FORMAT|MAPPING/i.test(code),
    category: 'VALIDATION', priority: 'HIGH', title: 'Data ditolak karena validasi',
    cause: 'Payload tidak memenuhi aturan resource, field wajib, format, kode, referensi, atau mapping.',
    advice: 'Periksa field wajib, tipe/format nilai, terminology, referensi resource, dan mapping Khanza ke SATUSEHAT. Perbaiki sumber/mapping terlebih dahulu.'
  },
  {
    match: ({ httpStatus, code }) => httpStatus === 400 || /BAD_REQUEST|MALFORMED|INVALID_REQUEST/i.test(code),
    category: 'REQUEST', priority: 'MEDIUM', title: 'Request tidak valid',
    cause: 'Request atau struktur payload tidak sesuai kontrak API.',
    advice: 'Periksa endpoint, HTTP method, header, parameter, dan struktur payload berdasarkan environment yang digunakan.'
  },
  {
    match: ({ httpStatus, code }) => httpStatus === 404 || /NOT_FOUND|UNKNOWN_RESOURCE/i.test(code),
    category: 'REFERENCE', priority: 'MEDIUM', title: 'Resource atau referensi tidak ditemukan',
    cause: 'Resource, endpoint, atau referensi yang diminta tidak ditemukan.',
    advice: 'Periksa identifier, endpoint/environment, Organization, dan referensi resource. Pastikan ID berasal dari environment yang sama.'
  },
  {
    match: ({ httpStatus, code }) => httpStatus === 409 || /CONFLICT|DUPLICATE/i.test(code),
    category: 'CONFLICT', priority: 'MEDIUM', title: 'Konflik atau duplikasi',
    cause: 'Request bertabrakan dengan state/resource yang sudah ada atau dianggap duplikat.',
    advice: 'Periksa resource dan identifier yang sudah tercatat. Jangan retry berulang sebelum penyebab konflik dipastikan.'
  },
  {
    match: ({ httpStatus, code }) => httpStatus === 429 || /RATE|THROTTL/i.test(code),
    category: 'RATE_LIMIT', priority: 'MEDIUM', title: 'Rate limit tercapai',
    cause: 'Jumlah request melebihi batas layanan.',
    advice: 'Kurangi frekuensi request dan gunakan backoff terkontrol saat fase pengiriman diaktifkan.'
  },
  {
    match: ({ httpStatus, code }) => httpStatus >= 500 || /SERVER|UPSTREAM|GATEWAY|TIMEOUT|ECONN|NETWORK/i.test(code),
    category: 'SERVER', priority: 'HIGH', title: 'Gangguan layanan atau koneksi tujuan',
    cause: 'Layanan tujuan, upstream, atau koneksi mengalami gangguan.',
    advice: 'Periksa status layanan, response body, correlation/request ID, dan waktu kejadian. Gunakan retry terkontrol setelah layanan stabil.'
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
    category: 'UNKNOWN', priority: 'LOW', title: 'Error perlu pemeriksaan manual',
    cause: 'Belum ada rule advisory yang cocok dengan error code atau HTTP status ini.',
    advice: 'Periksa response, error code, payload terkait, dan log waktu kejadian. Tambahkan rule setelah pola error teridentifikasi.',
    automated_action: 'NONE'
  };
}
