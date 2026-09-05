const API = window.DASHBOARD_API || 'http://localhost:3000/api';
const statuses = ['DISCOVERED','MAPPED','READY','PROCESSING','SUCCESS','RETRY','FAILED','BLOCKED','WAITING_DEPENDENCY'];

const esc = value => String(value ?? '').replace(/[&<>\"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c]));

async function getJson(url, options) {
  const response = await fetch(url, options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || data.error || `HTTP ${response.status}`);
  return data;
}

function renderStats(rows) {
  const summary = Object.fromEntries(statuses.map(s => [s, 0]));
  rows.forEach(r => { summary[r.status] = (summary[r.status] || 0) + 1; });
  document.querySelector('#stats').innerHTML = statuses.map(s => `<div class="stat"><b>${summary[s]}</b><span>${s}</span></div>`).join('');
}

function renderMonitoring(snapshot) {
  const r = snapshot.resources || {};
  const f = snapshot.flow || {};
  const failed = Number(r.failed || 0) + Number(r.blocked || 0);
  const active = Number(r.retry || 0) + Number(r.processing || 0) + Number(r.waiting_dependency || 0);
  const stale = Number(r.stale_processing || 0);
  const healthState = snapshot.health || 'HEALTHY';
  const healthReasons = snapshot.health_reasons || {};
  const healthText = healthState === 'CRITICAL'
    ? `Kritis: ${Number(healthReasons.failed_or_blocked || 0)} gagal/blocked, ${stale} processing macet.`
    : healthState === 'WARNING'
      ? `Perlu perhatian: ${Number(healthReasons.retry || 0)} retry, ${Number(healthReasons.waiting_dependency || 0)} menunggu dependency.`
      : 'Pipeline sehat — tidak ada gagal/blocked atau processing yang terindikasi macet.';
  flowMsg.textContent = healthText;
  lastUpdate.textContent = snapshot.generated_at ? `Snapshot ${new Date(snapshot.generated_at).toLocaleString('id-ID')}` : '';
  health.textContent = `PIPELINE ${healthState}`;
  health.className = `pill ${healthState === 'HEALTHY' ? 'ok' : healthState === 'WARNING' ? 'warn' : 'bad'}`;
  flowStats.innerHTML = [
    ['Total resource', r.total], ['SUCCESS', r.success], ['Gagal/blocked', failed],
    ['Aktif', active], ['Processing macet', stale], ['Terpetakan IHS', r.mapped],
    ['Response 2xx', f.successful_responses || 0]
  ].map(([label, value]) => `<div class="stat"><b>${esc(value)}</b><span>${esc(label)}</span></div>`).join('');
  resourceTypes.innerHTML = (snapshot.by_type || []).map(row => `<tr>
    <td>${esc(row.resource_type)}</td><td>${esc(row.total)}</td><td>${esc(row.success)}</td>
    <td>${esc(row.failed)}</td><td>${esc(row.active)}</td><td>${esc(row.stale_processing)}</td><td>${esc(row.last_activity || '-')}</td>
  </tr>`).join('') || '<tr><td colspan="7">Belum ada resource.</td></tr>';
}

function resolutionFor(p) {
  if (p.satusehat_id) return 'MATCHED';
  if (p.error_code === 'PATIENT_MULTIPLE_MATCHES') return 'AMBIGUOUS';
  if (p.error_code === 'PATIENT_IDENTIFIER_MISMATCH' || p.error_code === 'PATIENT_NIK_INVALID') return 'REVIEW';
  if (p.error_code === 'PATIENT_NOT_FOUND') return 'NOT_FOUND';
  if (p.status === 'FAILED') return 'REVIEW';
  return null;
}

function patientActions(p) {
  if (p.satusehat_id || p.status === 'SUCCESS') return `<span class="ihs-ok">✓ Terhubung</span><button onclick="showDetail(${Number(p.id)})">Detail</button>`;
  if (p.status === 'FAILED') return `<span class="review-badge">Review manual</span> <button onclick="showDetail(${Number(p.id)})">Detail</button>`;
  if (p.status === 'PROCESSING') return `<span class="muted">Sedang diproses</span> <button onclick="showDetail(${Number(p.id)})">Detail</button>`;
  return `<button onclick="patientLookup('${encodeURIComponent(p.no_rkm_medis)}')">🔍 Siapkan Patient</button> <button onclick="showDetail(${Number(p.id)})">Detail</button>`;
}

function renderPatientCard(p) {
  const resolution = resolutionFor(p);
  const errorBlock = p.error_code ? `<div class="patient-review"><div><small>Error</small><strong>${esc(p.error_code)}</strong></div><div><small>Resolution</small><strong>${esc(resolution || 'REVIEW')}</strong></div><div><small>Auto-retry</small><strong>${p.status === 'FAILED' ? 'Disabled' : 'Managed by queue'}</strong></div><div><small>Auto-create</small><strong>Disabled</strong></div></div>` : '';
  patientCard.classList.remove('hidden');
  patientCard.innerHTML = `<div class="patient-main"><div><small>No. RM</small><strong>${esc(p.no_rkm_medis)}</strong></div><div><small>Nama</small><strong>${esc(p.nama || '-')}</strong></div><div><small>NIK</small><strong>${esc(p.nik || '********')}</strong></div><div><small>Status</small><span class="status ${esc(p.status)}">${esc(p.status)}</span></div></div><div class="patient-ihs">${p.satusehat_id ? `<small>IHS ID</small><code>${esc(p.satusehat_id)}</code>` : '<span>Patient belum memiliki IHS ID pada control plane.</span>'}</div>${errorBlock}${p.error_code === 'PATIENT_MULTIPLE_MATCHES' ? '<div class="review-note"><strong>Review manual diperlukan.</strong><span>SATUSEHAT mengembalikan beberapa kandidat; sistem tidak memilih kandidat secara otomatis.</span></div>' : ''}${p.error_code === 'PATIENT_IDENTIFIER_MISMATCH' ? '<div class="review-note"><strong>Review manual diperlukan.</strong><span>Identifier NIK tidak cocok persis; mapping diblokir untuk menjaga integritas data.</span></div>' : ''}<div class="patient-actions">${patientActions(p)}</div>`;
}

async function loadPatient() {
  const noRm = patientSearch.value.trim();
  if (!noRm) return;
  patientMsg.textContent = 'Mempersiapkan alur Patient...';
  try {
    const prepared = await getJson(`${API}/patients/${encodeURIComponent(noRm)}/prepare`, { method: 'POST' });
    patientMsg.textContent = `Patient masuk queue: ${prepared.status}. Worker akan melanjutkan lookup SATUSEHAT.`;
    const resource = (await getJson(`${API}/patients/resource/${prepared.resource_id}`)).data;
    renderPatientCard({ ...resource, ...prepared.patient, status: prepared.status });
    await load();
  } catch (e) {
    patientMsg.textContent = e.message; patientCard.classList.remove('hidden'); patientCard.innerHTML = `<div class="error-box">${esc(e.message)}</div>`;
  }
}

async function patientLookup(noRm) { patientSearch.value = decodeURIComponent(noRm); await loadPatient(); }

function advisoryMarkup(advisory) {
  if (!advisory) return '<span class="muted">Belum tersedia</span>';
  return `<div class="advisory"><div><span class="priority ${esc(advisory.priority)}">${esc(advisory.priority)}</span> <strong>${esc(advisory.title)}</strong></div><small>${esc(advisory.advice)}</small></div>`;
}

async function load() {
  try {
    const [snapshot, runtime] = await Promise.all([
      getJson(`${API}/resources/monitoring`),
      getJson(`${API.replace(/\/api$/, '')}/health`)
    ]);
    renderMonitoring(snapshot.data);
    environment.textContent = `ENV: ${runtime.environment || runtime.satusehat?.environment || '--'}`;
    const params = new URLSearchParams({limit:'200'});
    if (type.value) params.set('type', type.value);
    if (status.value) params.set('status', status.value);
    const resources = await getJson(`${API}/resources?${params}`);
    renderStats(resources.data);
    resourcesEl.innerHTML = resources.data.map(r => `<tr>
      <td>${esc(r.id)}</td><td>${esc(r.resource_type)}</td><td>${esc(r.source_key)}</td>
      <td><span class="status ${esc(r.status)}">${esc(r.status)}</span></td>
      <td>${esc(r.attempt_count)}/${esc(r.max_attempts)}</td><td>${esc(r.satusehat_id || '-')}</td>
      <td>${esc(r.updated_at)}</td><td>${r.resource_type === 'Patient' ? patientActions(r) : `<button onclick="showDetail(${Number(r.id)})">Detail</button>`}</td>
    </tr>`).join('') || '<tr><td colspan="8">Belum ada resource.</td></tr>';

    const advisories = await getJson(`${API}/advisories?limit=50`);
    errorsEl.innerHTML = advisories.data.map(e => `<tr>
      <td>${esc(e.created_at)}</td><td>${esc(e.resource_type)} #${esc(e.resource_id)}</td>
      <td><strong>${esc(e.error_code)}</strong><br><small>${esc(e.error_message)}</small></td>
      <td>${esc(e.http_status || '-')}</td><td>${esc(e.attempt_no || '-')}</td><td>${advisoryMarkup(e.advisory)}</td>
    </tr>`).join('') || '<tr><td colspan="6">Tidak ada error.</td></tr>';
  } catch (e) { health.textContent = 'API Error'; health.className = 'pill bad'; console.error(e); }
}

async function showDetail(id) { const result = await getJson(`${API}/resources/${id}`); detailBody.textContent = JSON.stringify(result.data, null, 2); detail.showModal(); }

const type = document.querySelector('#type');
const status = document.querySelector('#status');
const resourcesEl = document.querySelector('#resources');
const errorsEl = document.querySelector('#errors');
const health = document.querySelector('#health');
const environment = document.querySelector('#environment');
const detail = document.querySelector('#detail');
const detailBody = document.querySelector('#detailBody');
const patientSearch = document.querySelector('#patientSearch');
const patientSearchBtn = document.querySelector('#patientSearchBtn');
const patientCard = document.querySelector('#patientCard');
const patientMsg = document.querySelector('#patientMsg');
const flowMsg = document.querySelector('#flowMsg');
const flowStats = document.querySelector('#flowStats');
const resourceTypes = document.querySelector('#resourceTypes');
const lastUpdate = document.querySelector('#lastUpdate');

document.querySelector('#refresh').onclick = load;
type.onchange = load; status.onchange = load;
patientSearchBtn.onclick = loadPatient;
patientSearch.onkeydown = e => { if (e.key === 'Enter') loadPatient(); };
load();
setInterval(load, 15000);
