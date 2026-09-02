import { khanzaDb } from '../../database/pool.js';

/**
 * Read-only access to Khanza's pasien table.
 * No INSERT/UPDATE/DELETE is intentionally exposed here.
 */
export async function findPatients({ limit = 100, offset = 0 } = {}) {
  const safeLimit = Math.min(Math.max(Number(limit) || 100, 1), 500);
  const safeOffset = Math.max(Number(offset) || 0, 0);

  const [rows] = await khanzaDb.execute(
    `SELECT
       no_rkm_medis,
       nm_pasien,
       no_ktp,
       jk,
       tmp_lahir,
       tgl_lahir,
       alamat,
       kota,
       no_tlp
     FROM pasien
     ORDER BY no_rkm_medis
     LIMIT ? OFFSET ?`,
    [safeLimit, safeOffset]
  );

  return rows;
}

export async function findPatientByMedicalRecord(noRkmMedis) {
  const [rows] = await khanzaDb.execute(
    `SELECT
       no_rkm_medis,
       nm_pasien,
       no_ktp,
       jk,
       tmp_lahir,
       tgl_lahir,
       alamat,
       kota,
       no_tlp
     FROM pasien
     WHERE no_rkm_medis = ?
     LIMIT 1`,
    [noRkmMedis]
  );

  return rows[0] ?? null;
}
