// options-address.js — Quản lý địa chỉ & bản đồ hành chính
(function() {

async function init() {
  showSkeleton(true);
  try { await loadCustomL2Mappings(); } catch(_) {}
  if (!window._NEW_ADM_READY) {
    await new Promise(resolve => {
      const check = () => { if (window._NEW_ADM_READY) resolve(); else setTimeout(check, 50); };
      check();
    });
  }
  showSkeleton(false);
  try {
    switchSubtab('addr-province');
  } catch(e) { console.error('[Addr] switchSubtab:', e); }
  try { renderProvinceMergers(); } catch(e) { console.error('[Addr] renderProvinceMergers:', e); }
  try { renderLevel2Mappings(); } catch(e) { console.error('[Addr] renderLevel2Mappings:', e); }
  try { updateStats(); } catch(e) { console.error('[Addr] updateStats:', e); }
  try { bindEvents(); } catch(e) { console.error('[Addr] bindEvents:', e); }
  try {
    console.log('[Addr] PROVINCE_MAPPING keys:', Object.keys(PROVINCE_MAPPING || {}).length);
    console.log('[Addr] WARD_MERGER_MAP keys:', typeof WARD_MERGER_MAP !== 'undefined' ? Object.keys(WARD_MERGER_MAP).length : 'UNDEFINED');
    console.log('[Addr] LEVEL2_ADDRESS_MAPPING keys:', Object.keys(LEVEL2_ADDRESS_MAPPING || {}).length);
    console.log('[Addr] NEW_ADM_DB provinces:', window.NEW_ADM_DB ? NEW_ADM_DB.provinces.length : 'N/A');
    console.log('[Addr] NEW_ADM_DB total wards:', window.NEW_ADM_DB ? Object.values(NEW_ADM_DB.wards).reduce((s, a) => s + a.length, 0) : 'N/A');
  } catch(e) { console.error('[Addr] debug log:', e); }
}

function showSkeleton(show) {
  const container = document.getElementById('addrProvinceList');
  if (!container) return;
  if (show) {
    container.innerHTML = '<div class="addr-skeleton">'
      + '<div class="addr-skeleton-bar"></div>'.repeat(6)
      + '</div>';
  }
}

// ─── Helper ───
function _n(s) {
  return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').toLowerCase();
}
function _p(s) {
  return _n(s).replace(/^(phuong|xa|thi tran|thi xa|quan|huyen|tinh|thanh pho|tp\.?)\s+/, '').trim();
}
function esc(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

// ─── Stats ───
function updateStats() {
  const provTotal = (typeof POST_MERGER_PROVINCES !== 'undefined' ? POST_MERGER_PROVINCES.length : new Set(Object.values(PROVINCE_MAPPING || {})).size);
  document.getElementById('addrStatProvCount').textContent = provTotal;
  const wCount = typeof WARD_MERGER_MAP !== 'undefined' ? Object.keys(WARD_MERGER_MAP).length : 0;
  document.getElementById('addrStatWardCount').textContent = wCount.toLocaleString();
  const l2 = LEVEL2_ADDRESS_MAPPING || {};
  document.getElementById('addrStatL2Count').textContent = Object.keys(l2).length;
  if (window.NEW_ADM_DB) {
    const total = Object.values(NEW_ADM_DB.wards).reduce((s, a) => s + a.length, 0);
    console.log('[Addr] NEW_ADM_DB: ' + NEW_ADM_DB.provinces.length + ' provinces, ' + total + ' wards');
  }
}

function _findProvinceFullName(shortName) {
  const norm = _n(shortName).replace(/^(tinh|thanh pho|tp\.?|t\.?)\s+/, '').trim();
  for (const p of ADM_DB.provinces) {
    const pNorm = _n(p.name).replace(/^(tinh|thanh pho|tp\.?|t\.?)\s+/, '').trim();
    if (pNorm === norm) return p.name;
    if (p.aliases) {
      for (const a of p.aliases) {
        const aNorm = _n(a).replace(/^(tinh|thanh pho|tp\.?|t\.?)\s+/, '').trim();
        if (aNorm === norm) return p.name;
      }
    }
  }
  return null;
}

let _wardMergeIdx = null;
function _buildWardMergeIndex() {
  if (_wardMergeIdx) return;
  _wardMergeIdx = {};
  const map = typeof WARD_MERGER_MAP !== 'undefined' ? WARD_MERGER_MAP : {};
  for (const [oldKey, val] of Object.entries(map)) {
    const newWardNorm = _n(val.ward).replace(/^(phuong|xa|thi tran|thi xa)\s+/, '').trim();
    const provNorm = _n(val.province).replace(/^(tinh|thanh pho|tp\.?|t\.?)\s+/, '').trim();
    const idxKey = newWardNorm + '|' + provNorm;
    if (!_wardMergeIdx[idxKey]) _wardMergeIdx[idxKey] = [];
    const oldName = oldKey.replace(/\([^)]*\)$/, '').replace(/\([^)]*\)/g, '').trim();
    if (oldName && oldName !== '-' && !_wardMergeIdx[idxKey].includes(oldName)) _wardMergeIdx[idxKey].push(oldName);
  }
}
function _getOldWards(newWardName, provinceName) {
  _buildWardMergeIndex();
  const nw = _n(newWardName).replace(/^(phuong|xa|thi tran|thi xa)\s+/, '').trim();
  const pn = _n(provinceName).replace(/^(tinh|thanh pho|tp\.?|t\.?)\s+/, '').trim();
  const key = nw + '|' + pn;
  return _wardMergeIdx[key] || [];
}
function _renderWardTree(fullProvinceName) {
  const dists = ADM_DB.districts[fullProvinceName];
  if (!dists || dists.length === 0) return '<div class="addr-empty" style="padding:4px 0">Không có dữ liệu quận/huyện</div>';
  return dists.map(d => {
    const wardKey = fullProvinceName + '|' + d.name;
    const wards = ADM_DB.wards[wardKey];
    const wHtml = wards && wards.length > 0
      ? '<div class="addr-ward-list">' + wards.map(w => {
          const oldWards = _getOldWards(w, fullProvinceName);
          if (oldWards.length === 0) return '<span class="addr-ward-tag">' + esc(w) + '</span>';
          return '<span class="addr-ward-tag addr-ward-has-merge" tabindex="0">' + esc(w) + ' <span class="addr-ward-merge-badge">+' + oldWards.length + '</span><span class="addr-ward-old-list" style="display:none"> ← ' + oldWards.map(esc).join(', ') + '</span></span>';
        }).join('') + '</div>'
      : '<div class="addr-empty" style="padding:2px 0 2px 16px;font-size:11px">Không có phường/xã</div>';
    return '<div class="addr-district-block"><div class="addr-district-name">📌 ' + esc(d.name) + ' <span class="addr-ward-count">(' + (wards ? wards.length : 0) + ' phường/xã)</span></div>' + wHtml + '</div>';
  }).join('');
}

function renderProvinceMergers() {
  const container = document.getElementById('addrProvinceList');
  if (!container) return;
  const map = PROVINCE_MAPPING || {};
  const groups = {};
  for (const [oldName, newName] of Object.entries(map)) {
    const key = _n(newName);
    if (!groups[key]) groups[key] = { newName, oldNames: [] };
    if (!groups[key].oldNames.includes(oldName)) groups[key].oldNames.push(oldName);
  }
  const kept = ['hà nội', 'huế', 'lai châu', 'điện biên', 'sơn la', 'lạng sơn', 'quảng ninh', 'thanh hóa', 'nghệ an', 'hà tĩnh', 'cao bằng'];
  const keptNames = { 'hà nội': 'Thành phố Hà Nội', 'huế': 'Thành phố Huế', 'lai châu': 'Tỉnh Lai Châu', 'điện biên': 'Tỉnh Điện Biên', 'sơn la': 'Tỉnh Sơn La', 'lạng sơn': 'Tỉnh Lạng Sơn', 'quảng ninh': 'Tỉnh Quảng Ninh', 'thanh hóa': 'Tỉnh Thanh Hóa', 'nghệ an': 'Tỉnh Nghệ An', 'hà tĩnh': 'Tỉnh Hà Tĩnh', 'cao bằng': 'Tỉnh Cao Bằng' };
  for (const k of kept) {
    if (!groups[k]) groups[k] = { newName: keptNames[k], oldNames: [] };
  }
  const sorted = Object.values(groups).sort((a, b) => _n(a.newName).localeCompare(_n(b.newName)));
  container.innerHTML = sorted.map(g => {
    const fullName = _findProvinceFullName(g.newName);
    const wardHtml = fullName ? _renderWardTree(fullName) : '';
    let mergedWardHtml = '';
    if (g.oldNames.length > 0) {
      const seenFull = new Set();
      mergedWardHtml = g.oldNames.map(old => {
        const oldFull = _findProvinceFullName(old);
        if (!oldFull || seenFull.has(oldFull)) return '';
        seenFull.add(oldFull);
        const displayName = ADM_DB.provinces.find(p => p.name === oldFull)?.name || old;
        return '<div style="margin-top:10px;padding-top:8px;border-top:1px dashed var(--border)">'
          + '<div class="addr-section-label" style="margin-bottom:6px">📍 ' + esc(displayName) + ' (sáp nhập vào)</div>'
          + _renderWardTree(oldFull) + '</div>';
      }).join('');
    }
    let newWardHtml = '';
    if (window.NEW_ADM_DB) {
      const normNew = _n(g.newName).replace(/^(tinh|thanh pho|tp\.?|t\.?)\s+/, '').trim();
      const matchProv = NEW_ADM_DB.provinces.find(p => {
        const pNorm = _n(p.name).replace(/^(tinh|thanh pho|tp\.?|t\.?)\s+/, '').trim();
        return pNorm === normNew;
      });
      if (matchProv) {
        const wards = NEW_ADM_DB.wards[matchProv.name] || [];
        if (wards.length > 0) {
          newWardHtml = '<div class="addr-new-section">'
            + '<div class="addr-new-toggle">'
            + '<span class="addr-new-toggle-arrow">▼</span>'
            + '<span>🏛️ Cơ cấu phường/xã mới 2025</span>'
            + '<span class="addr-ward-count" style="font-weight:400">(' + wards.length + ' phường/xã)</span>'
            + '</div>'
            + '<div class="addr-new-body">'
            + '<div class="addr-ward-list">'
            + wards.map(w => {
              const oldU = (w.old_units || []).length;
              if (!oldU) return '<span class="addr-ward-tag addr-ward-new">' + esc(w.name) + '</span>';
              return '<span class="addr-ward-tag addr-ward-has-merge addr-ward-new" tabindex="0">' + esc(w.name) + ' <span class="addr-ward-merge-badge" style="background:#22c55e">+' + oldU + '</span><span class="addr-ward-old-list" style="display:none"> ← ' + w.old_units.map(esc).join(', ') + '</span></span>';
            }).join('')
            + '</div>'
            + (matchProv.merged_with.length > 0 ? '<div class="addr-tth">🏢 Trung tâm hành chính: ' + esc(matchProv.merged_with[0]) + '</div>' : '')
            + '</div>'
            + '</div>';
        }
      }
    }
    return '<div class="addr-merge-card">'
      + '<div class="addr-merge-header">'
        + '<span class="addr-merge-arrow">▶</span>'
        + '<span class="addr-header-title">' + esc(g.newName) + '</span>'
        + '<span class="addr-header-sub">' + (g.oldNames.length > 0 ? '(' + g.oldNames.length + ' tỉnh cũ)' : '(giữ nguyên)') + '</span>'
      + '</div>'
      + '<div class="addr-merge-body" style="display:none">'
        + (g.oldNames.length > 0 ? '<div class="addr-section-label">Tỉnh/Thành cũ sáp nhập vào:</div>'
          + '<div class="addr-old-list">' + g.oldNames.sort().map(n => '<div class="addr-old-item">→ ' + esc(n) + '</div>').join('') + '</div>'
          + '<hr class="addr-section-divider">' : '')
        + '<div class="addr-section-label">Quận/Huyện — Phường/Xã (cũ):</div>'
        + (wardHtml || '<div class="addr-empty" style="font-size:12px">Không có dữ liệu</div>')
        + mergedWardHtml
        + newWardHtml
      + '</div>'
    + '</div>';
  }).join('');
}

// ─── Level2 mappings ───
function renderLevel2Mappings() {
  const tbody = document.getElementById('addrMappingTableBody');
  const map = LEVEL2_ADDRESS_MAPPING || {};
  const entries = Object.entries(map).sort((a, b) => _n(a[0]).localeCompare(_n(b[0])));
  tbody.innerHTML = entries.length
    ? entries.map(([key, val]) => `
    <tr>
      <td style="font-size:11.5px;word-break:break-all">${esc(key)}</td>
      <td>${esc(val.ward || '—')}</td>
      <td>${esc(val.district || '—')}</td>
      <td>${esc(val.province || '—')}</td>
      <td style="text-align:center"><button class="btn-addr-del" data-key="${esc(key)}" title="Xóa ánh xạ"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg></button></td>
    </tr>`).join('')
    : '<tr><td colspan="5" class="addr-empty">Chưa có ánh xạ đặc biệt nào</td></tr>';
}

// ─── Converter ───
let _converterSeq = 0;

async function runConverter() {
  const input = document.getElementById('addrConverterInput');
  const output = document.getElementById('addrConverterOutput');
  const detail = document.getElementById('addrConvertDetail');
  const text = input.value.trim();
  if (!text) {
    output.value = '';
    detail.innerHTML = '';
    return;
  }

  const seq = ++_converterSeq;
  output.value = '⏳ Đang xử lý...';
  detail.innerHTML = '';

  try {
    const result = await AddressEngine.process(text);
    if (seq !== _converterSeq) return;

    output.value = result.fullAddress || '';

    let html = '';

    const valid = typeof AddressValidator !== 'undefined' ? AddressValidator.validate(result) : false;
    html += '<div class="addr-chip-group">';
    html += `<span class="addr-chip ${result.confidence >= 85 ? 'addr-chip-green' : 'addr-chip-yellow'}">${result.confidence >= 85 ? '🟢' : '🟡'} Độ tin cậy: ${result.confidence}%</span>`;
    html += `<span class="addr-chip ${valid ? 'addr-chip-green' : 'addr-chip-yellow'}">${valid ? '✅' : '⚠️'} Xác thực: ${valid ? 'Hợp lệ' : 'Không hợp lệ'}</span>`;
    html += `<span class="addr-chip addr-chip-blue">📡 Nguồn: ${result.source === 'ai_fallback' ? 'AI (Groq)' : 'Cơ sở dữ liệu'}</span>`;
    html += '</div>';

    html += '<div class="addr-section-label" style="margin-bottom:6px">📍 Kết quả phân tích:</div>';
    html += '<table class="addr-breakdown">';
    const rows = [
      ['Đường / Số nhà', result.street],
      ['Phường / Xã', result.ward],
      ['Quận / Huyện', result.district],
      ['Tỉnh / Thành', result.province],
    ];
    for (const [label, val] of rows) {
      html += '<tr>'
        + '<td class="addr-breakdown-label">' + label + '</td>'
        + '<td class="addr-breakdown-value">' + (val ? esc(val) : '<span class="addr-breakdown-empty">—</span>') + '</td>'
        + '</tr>';
    }
    html += '</table>';

    try {
      const normalized = AddressNormalizer.normalize(text);
      const parsed = AddressParser.parse(normalized);
      const ruled = AddressRules.applyRules(parsed);
      const changes = [];
      if (parsed.province && ruled.province && _n(parsed.province) !== _n(ruled.province)) {
        changes.push({ label: 'Tỉnh/Thành', old: parsed.province, new: ruled.province });
      }
      if (parsed.district && ruled.district && _n(parsed.district) !== _n(ruled.district)) {
        changes.push({ label: 'Quận/Huyện', old: parsed.district, new: ruled.district });
      }
      if (parsed.ward && ruled.ward && _n(parsed.ward) !== _n(ruled.ward)) {
        changes.push({ label: 'Phường/Xã', old: parsed.ward, new: ruled.ward });
      }
      if (changes.length > 0) {
        html += '<div class="addr-diff-box">';
        html += '<div class="addr-diff-title">🔄 Thay đổi theo sáp nhập 2025:</div>';
        for (const c of changes) {
          html += '<div class="addr-diff-row">'
            + '<span class="addr-diff-label">' + c.label + ':</span>'
            + '<span class="addr-diff-old">' + esc(c.old) + '</span>'
            + '<span class="addr-diff-arrow">→</span>'
            + '<span class="addr-diff-new">' + esc(c.new) + '</span>'
            + '</div>';
        }
        html += '</div>';
      }
    } catch (_) {}

    detail.innerHTML = html;
  } catch (e) {
    if (seq !== _converterSeq) return;
    output.value = text;
    detail.innerHTML = '<div class="addr-error">⚠️ Lỗi xử lý: ' + esc(e.message || e) + '</div>';
  }
}

let _convTimer = null;
function onConverterInput() {
  if (_convTimer) clearTimeout(_convTimer);
  _convTimer = setTimeout(runConverter, 400);
}

// ─── Bulk update ───
function _bulkConvert(oldAddr) {
  try {
    const normalized = AddressNormalizer.normalize(oldAddr);
    const parsed = AddressParser.parse(normalized);
    const ruled = AddressRules.applyRules(parsed);
    const changes = [];
    if (parsed.province && ruled.province && _n(parsed.province) !== _n(ruled.province))
      changes.push(parsed.province + '→' + ruled.province);
    if (parsed.district && ruled.district && _n(parsed.district) !== _n(ruled.district))
      changes.push(parsed.district + '→' + ruled.district);
    if (parsed.ward && ruled.ward && _n(parsed.ward) !== _n(ruled.ward))
      changes.push(parsed.ward + '→' + ruled.ward);
    const parts = [];
    if (ruled.street) parts.push(ruled.street);
    if (ruled.ward) parts.push(ruled.ward);
    if (ruled.district) parts.push(ruled.district);
    if (ruled.province) parts.push(ruled.province);
    const newAddr = parts.join(', ');
    if (newAddr !== oldAddr) return { newAddr, changes };
    const map = LEVEL2_ADDRESS_MAPPING || {};
    const norm = _n(oldAddr);
    for (const [key, val] of Object.entries(map)) {
      const parts = key.split('|').map(s => _n(s.trim()));
      if (parts.every(p => norm.includes(p))) {
        return { newAddr: [val.ward || val.street || '', val.district || '', val.province || ''].filter(Boolean).join(', '), changes: ['Ánh xạ: ' + key] };
      }
    }
  } catch (_) {}
  return null;
}

async function bulkPreview() {
  const result = document.getElementById('addrBulkResult');
  const btn = document.getElementById('btnAddrBulkApply');
  const countSpan = document.getElementById('addrBulkCount');
  btn.disabled = true;
  result.innerHTML = '<div class="addr-loading"><div class="addr-loading-spinner"></div>⏳ Đang quét đơn hàng...</div>';
  const orders = await getOrders();
  const changed = [];
  for (const o of orders) {
    const addr = o.address || '';
    if (!addr) continue;
    const conv = _bulkConvert(addr);
    if (!conv) continue;
    changed.push({ order: o, oldAddr: addr, newAddr: conv.newAddr, changes: conv.changes });
  }
  if (changed.length === 0) {
    result.innerHTML = '<div class="addr-banner addr-banner-success">✅ Không có đơn hàng nào cần cập nhật địa chỉ.</div>';
    btn.disabled = true;
    countSpan.textContent = '0';
    return;
  }
  result.innerHTML = '<div class="addr-bulk-preview-header">📋 Danh sách đơn sẽ được cập nhật (' + changed.length + ' đơn):</div>'
    + changed.slice(0, 50).map(c => {
      const name = esc(c.order.name || '—');
      const phone = esc(c.order.phone || '');
      return '<div class="addr-bulk-item">'
        + '<div><strong>' + name + '</strong> ' + (phone ? '(' + phone + ')' : '') + '</div>'
        + '<div class="addr-bulk-old">' + esc(c.oldAddr) + '</div>'
        + '<div class="addr-bulk-new">' + esc(c.newAddr) + '</div>'
        + '<div class="addr-bulk-changes">' + c.changes.join(', ') + '</div>'
        + '</div>';
    }).join('')
    + (changed.length > 50 ? '<div class="addr-bulk-overflow">… và ' + (changed.length - 50) + ' đơn khác</div>' : '');
  btn.disabled = false;
  countSpan.textContent = changed.length;
  window.__addrBulkChanges = changed;
}

async function bulkApply() {
  const changed = window.__addrBulkChanges || [];
  if (changed.length === 0) return;
  const result = document.getElementById('addrBulkResult');
  const btn = document.getElementById('btnAddrBulkApply');
  btn.disabled = true;
  let updated = 0;
  const total = changed.length;
  result.innerHTML = '<div class="addr-progress-wrap">'
    + '<div class="addr-progress-bar"><div class="addr-progress-fill" id="bulkProgressFill"></div></div>'
    + '<div class="addr-progress-text" id="bulkProgressText">0/' + total + ' đang cập nhật...</div>'
    + '</div>';
  const fill = document.getElementById('bulkProgressFill');
  const text = document.getElementById('bulkProgressText');
  for (let i = 0; i < changed.length; i++) {
    const c = changed[i];
    try {
      const orders = await getOrders();
      const idx = orders.findIndex(o => o.id === c.order.id);
      if (idx !== -1) {
        orders[idx].address = c.newAddr;
        await saveOrders(orders);
        updated++;
      }
    } catch (e) { console.error(e); }
    if (fill) fill.style.width = Math.round(((i + 1) / total) * 100) + '%';
    if (text) text.textContent = (i + 1) + '/' + total + ' đang cập nhật...';
  }
  if (fill) fill.style.width = '100%';
  if (text) text.textContent = '✅ Hoàn tất!';
  result.innerHTML += '<div class="addr-banner addr-banner-success" style="margin-top:8px">✅ Đã cập nhật ' + updated + '/' + total + ' đơn hàng thành công!</div>';
  window.__addrBulkChanges = [];
}

// ─── Save/Load orders helpers ───
function getOrders() {
  return new Promise(resolve => {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.get(['savedOrders'], r => resolve(r.savedOrders || []));
    } else {
      try { resolve(JSON.parse(localStorage.getItem('savedOrders') || '[]')); } catch(e) { resolve([]); }
    }
  });
}
function saveOrders(orders) {
  return new Promise(resolve => {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.set({ savedOrders: orders }, resolve);
    } else {
      localStorage.setItem('savedOrders', JSON.stringify(orders));
      resolve();
    }
  });
}

// ─── Subtab switching ───
function switchSubtab(subtabId) {
  document.querySelectorAll('#addrSubmenu .submenu-item').forEach(b => b.classList.toggle('active', b.dataset.subtab === subtabId));
  const parent = document.getElementById('tab-address');
  parent.querySelectorAll('.subtab-content').forEach(p => p.style.display = 'none');
  const target = parent.querySelector('#panel-subtab-' + subtabId);
  if (target) target.style.display = 'block';
}

// ─── Events ───
function bindEvents() {
  document.querySelectorAll('#addrSubmenu .submenu-item').forEach(btn => {
    btn.addEventListener('click', () => switchSubtab(btn.dataset.subtab));
  });
  document.getElementById('addrProvinceList').addEventListener('click', e => {
    const header = e.target.closest('.addr-merge-header');
    if (!header) return;
    if (e.target.closest('.addr-new-toggle')) return;
    const card = header.closest('.addr-merge-card');
    if (!card) return;
    const body = card.querySelector('.addr-merge-body');
    const arrow = card.querySelector('.addr-merge-arrow');
    if (!body) return;
    const isOpen = body.style.display !== 'none';
    body.style.display = isOpen ? 'none' : 'block';
    if (arrow) arrow.textContent = isOpen ? '▶' : '▼';
  });
  document.getElementById('addrProvinceList').addEventListener('click', e => {
    const toggle = e.target.closest('.addr-new-toggle');
    if (!toggle) return;
    const body = toggle.closest('.addr-new-section').querySelector('.addr-new-body');
    const arrow = toggle.querySelector('.addr-new-toggle-arrow');
    if (!body) return;
    const isOpen = body.style.display !== 'none';
    body.style.display = isOpen ? 'none' : 'block';
    if (arrow) arrow.textContent = isOpen ? '▶' : '▼';
  });
  document.getElementById('addrConverterInput').addEventListener('input', onConverterInput);
  document.getElementById('btnAddrConvert').addEventListener('click', () => {
    if (_convTimer) clearTimeout(_convTimer);
    _convTimer = null;
    runConverter();
  });
  document.getElementById('btnAddrConvertClear').addEventListener('click', () => {
    if (_convTimer) clearTimeout(_convTimer);
    _convTimer = null;
    _converterSeq++;
    document.getElementById('addrConverterInput').value = '';
    document.getElementById('addrConverterOutput').value = '';
    document.getElementById('addrConvertDetail').textContent = '';
  });
  document.getElementById('btnAddrMappingSave').addEventListener('click', async () => {
    const key = document.getElementById('addrMappingKey').value.trim();
    const ward = document.getElementById('addrMappingWard').value.trim();
    const dist = document.getElementById('addrMappingDist').value.trim();
    const prov = document.getElementById('addrMappingProv').value.trim();
    if (!key || !ward || !prov) {
      alert('Vui lòng nhập Key, Phường/Xã và Tỉnh/Thành tối thiểu.');
      return;
    }
    if (confirm('Lưu ánh xạ này? Nếu key đã tồn tại, nó sẽ được ghi đè.')) {
      saveCustomL2Mapping(key, { ward, district: dist, province: prov });
      renderLevel2Mappings();
      updateStats();
      document.getElementById('addrMappingKey').value = '';
      document.getElementById('addrMappingWard').value = '';
      document.getElementById('addrMappingDist').value = '';
      document.getElementById('addrMappingProv').value = '';
    }
  });
  document.getElementById('addrMappingTableBody').addEventListener('click', e => {
    const btn = e.target.closest('.btn-addr-del');
    if (!btn) return;
    const key = btn.dataset.key;
    if (confirm('Xóa ánh xạ "' + key + '"?')) {
      deleteCustomL2Mapping(key);
      renderLevel2Mappings();
      updateStats();
    }
  });
  document.getElementById('btnAddrBulkPreview').addEventListener('click', bulkPreview);
  document.getElementById('btnAddrBulkApply').addEventListener('click', bulkApply);
}

// ─── Expose initAddressTab ───
let _addressTabInited = false;
globalThis.initAddressTab = async function() {
  if (_addressTabInited) return;
  _addressTabInited = true;
  await init();
};

})();
