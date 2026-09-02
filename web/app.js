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
      <td>${esc(r.updated_at)}</td><td><button onclick="showDetail(${Number(r.id)})">Detail</button>${['FAILED','BLOCKED'].includes(r.status)?` <button onclick="retry(${Number(r.id)})">Retry</button>`:''}</td>
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
document.querySelector('#refresh').onclick = load;
type.onchange = load; status.onchange = load;
load();
setInterval(load, 15000);
