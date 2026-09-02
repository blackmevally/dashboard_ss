const API = window.DASHBOARD_API || '/api';
const statuses = ['DISCOVERED','MAPPED','READY','PROCESSING','SUCCESS','RETRY','FAILED','BLOCKED','WAITING_DEPENDENCY'];

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

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

function patientActions(p) {
  if (p.satusehat_id) return `<span class="ihs-ok">✓ Terhubung</span><button onclick="showDetail(${Number(p.id)})">Detail</button>`;
  const retryable = ['FAILED','BLOCKED'].includes(p.status);
  return `<button onclick="patientLookup('${encodeURIComponent(p.no_rkm_medis)}')">🔍 Lookup IHS</button> <button onclick="patientCreate('${encodeURIComponent(p.no_rkm_medis)}')">➕ Create Patient</button>${retryable ? ` <button onclick="retry(${Number(p.id)})">🔄 Retry</button>` : ''} <button onclick="showDetail(${Number(p.id)})">Detail</button>`;
}

function renderPatientCard(p) {
  patientCard.classList.remove('hidden');
  patientCard.innerHTML = `<div class="patient-main"><div><small>No. RM</small><strong>${esc(p.no_rkm_medis)}</strong></div><div><small>Nama</small><strong>${esc(p.nama)}</strong></div><div><small>NIK</small><strong>${esc(p.nik || '********')}</strong></div><div><small>Status</small><span class="status ${esc(p.status)}">${esc(p.status)}</span></div></div><div class="patient-ihs">${p.satusehat_id ? `<small>IHS ID</small><code>${esc(p.satusehat_id)}</code>` : '<span>Patient belum memiliki IHS ID.</span>'}</div><div class="patient-actions">${patientActions(p)}</div>`;
}

async function loadPatient() {
  const noRm = patientSearch.value.trim();
  if (!noRm) return;
  patientMsg.textContent = 'Mencari...';
  try {
    const result = await getJson(`${API}/patients/${encodeURIComponent(noRm)}/lookup`, {method:'POST'});
    patientMsg.textContent = result.created ? 'Patient berhasil dibuat.' : result.found ? 'Patient ditemukan.' : result.failed ? `Gagal: ${result.errorCode}` : 'Selesai.';
    await load();
    const resource = (await getJson(`${API}/patients/resource/${result.patient?.resource_id || ''}`)).data;
    renderPatientCard({...resource, no_rkm_medis: noRm, nama: result.patient?.nama || resource.source_key});
  } catch (e) {
    patientMsg.textContent = e.message;
    patientCard.classList.remove('hidden');
    patientCard.innerHTML = `<div class="error-box">${esc(e.message)}</div>`;
  }
}

async function patientLookup(noRm) {
  patientSearch.value = decodeURIComponent(noRm);
  await loadPatient();
}

async function patientCreate(noRm) {
  const value = decodeURIComponent(noRm);
  if (!confirm(`Create Patient ${value} ke SATUSEHAT?`)) return;
  patientMsg.textContent = 'Membuat Patient...';
  try {
    const result = await getJson(`${API}/patients/${encodeURIComponent(value)}/create`, {method:'POST'});
    patientMsg.textContent = result.created ? `Berhasil. IHS ID: ${result.patientId}` : result.alreadyMapped ? 'Patient sudah terhubung.' : `Gagal: ${result.errorCode || 'UNKNOWN'}`;
    await load();
    await loadPatient();
  } catch (e) { patientMsg.textContent = e.message; }
}

async function load() {
  try {
    const params = new URLSearchParams({limit:'200'});
    if (type.value) params.set('type', type.value);
    if (status.value) params.set('status', status.value);
    const resources = await getJson(`${API}/resources?${params}`);
    renderStats(resources.data);
    resourcesEl.innerHTML = resources.data.map(r => `<tr>
      <td>${esc(r.id)}</td><td>${esc(r.resource_type)}</td><td>${esc(r.source_key)}</td>
      <td><span class="status ${esc(r.status)}">${esc(r.status)}</span></td>
      <td>${esc(r.attempt_count)}/${esc(r.max_attempts)}</td><td>${esc(r.satusehat_id || '-')}</td>
      <td>${esc(r.updated_at)}</td><td>${r.resource_type === 'Patient' ? patientActions(r) : `<button onclick="showDetail(${Number(r.id)})">Detail</button>${['FAILED','BLOCKED'].includes(r.status)?` <button onclick="retry(${Number(r.id)})">Retry</button>`:''}</td>
    </tr>`).join('') || '<tr><td colspan="8">Belum ada resource.</td></tr>';

    const errors = await getJson(`${API}/errors?limit=50`);
    errorsEl.innerHTML = errors.data.map(e => `<tr><td>${esc(e.created_at)}</td><td>${esc(e.resource_type)} #${esc(e.resource_id)}</td><td>${esc(e.error_code)} — ${esc(e.error_message)}</td><td>${esc(e.http_status || '-')}</td><td>${esc(e.attempt_no || '-')}</td></tr>`).join('') || '<tr><td colspan="5">Tidak ada error.</td></tr>';
    health.textContent = 'Control Plane OK'; health.className = 'pill ok';
  } catch (e) { health.textContent = 'API Error'; health.className = 'pill bad'; console.error(e); }
}

async function showDetail(id) { const result = await getJson(`${API}/resources/${id}`); detailBody.textContent = JSON.stringify(result.data, null, 2); detail.showModal(); }
async function retry(id) { if (!confirm('Retry resource ini?')) return; await getJson(`${API}/resources/${id}/retry`, {method:'POST',headers:{'Content-Type':'application/json'}}); load(); }

const type = document.querySelector('#type');
const status = document.querySelector('#status');
const resourcesEl = document.querySelector('#resources');
const errorsEl = document.querySelector('#errors');
const health = document.querySelector('#health');
const detail = document.querySelector('#detail');
const detailBody = document.querySelector('#detailBody');
const patientSearch = document.querySelector('#patientSearch');
const patientSearchBtn = document.querySelector('#patientSearchBtn');
const patientCard = document.querySelector('#patientCard');
const patientMsg = document.querySelector('#patientMsg');

document.querySelector('#refresh').onclick = load;
type.onchange = load; status.onchange = load;
patientSearchBtn.onclick = loadPatient;
patientSearch.onkeydown = e => { if (e.key === 'Enter') loadPatient(); };
load();
setInterval(load, 15000);
