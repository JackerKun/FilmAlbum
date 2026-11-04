export function installLibraryHealth({ toast, onRepaired, onView }) {
  const $ = selector => document.querySelector(selector);
  const dialog = $('#library-health-dialog');
  let timer, report, repairId = null, repairing = false, generation = 0, fingerprint = null;
  const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const bytes = value => { if (!value) return '0 B'; const unit = Math.min(3, Math.floor(Math.log(value) / Math.log(1024))); return `${(value / 1024 ** unit).toFixed(unit ? 1 : 0)} ${['B','KB','MB','GB'][unit]}`; };
  const refs = file => (file.refs || []).map(ref => `${ref.rollName || '未命名胶卷'} / ${ref.name}`).join(' · ');
  function render(value) {
    report = value; const nextFingerprint = JSON.stringify(value); if (nextFingerprint === fingerprint) return; fingerprint = nextFingerprint;
    const status = value.status || {};
    const phases = { waiting: '等待首次索引', starting: '正在启动索引', catalog: '同步胶卷档案', hashing: '计算文件哈希', idle: '索引已更新', error: '索引检查失败' };
    $('#index-status').textContent = value.available ? `${phases[status.phase] || status.phase}${status.running && status.total ? ` · ${status.done} / ${status.total}` : ''}` : status.error || '索引服务尚未就绪';
    $('#index-status').classList.toggle('index-error', Boolean(status.error));
    $('#index-progress').hidden = !status.running;
    $('#index-progress').max = status.total || 1; $('#index-progress').value = status.done || 0;
    $('#index-last-scan').textContent = value.available ? `${status.watching ? '监控 data/media 与档案变化' : '目录监控未启用'}${status.watchError ? ` · ${status.watchError}` : ''}${status.lastScan ? ' · 最近完成 ' + new Date(status.lastScan).toLocaleString('zh-CN') : ''}` : '';
    if (!value.available) { $('#index-stats').innerHTML = ''; $('#index-missing').innerHTML = ''; $('#index-duplicates').innerHTML = ''; $('#index-orphans').innerHTML = ''; return; }
    const count = value.counts;
    const stats = [['胶卷 / 照片', `${count.rolls} / ${count.frames}`], ['原片占用', bytes(count.bytes)], ['重复组', `${count.duplicateGroups} 组`], ['重复副本占用', bytes(count.duplicateBytes)], ['断链', `${count.missing} 个`], ['缩略图缓存', `${value.thumbnails?.files || 0} 张 · ${bytes(value.thumbnails?.bytes)}`]];
    $('#index-stats').innerHTML = stats.map(([label, text]) => `<div><span>${label}</span><b>${text}</b></div>`).join('');
    $('#index-missing-count').textContent = count.missing;
    $('#index-duplicate-count').textContent = count.duplicateGroups;
    $('#index-orphan-count').textContent = count.orphans;
    $('#index-missing').innerHTML = value.missing.map(file => `<article class="index-issue"><div><b>${escape(refs(file))}</b><code>${escape(file.id)}</code><small>${file.expectedHash ? '已记录原始 SHA-256：' + escape(file.expectedHash.slice(0, 16)) + '…' : '尚无原始哈希，需由你选择正确原片'}</small></div><div class="index-issue-actions"><button data-upload-repair="${escape(file.id)}">选择原片修复</button>${file.candidates.slice(0, 1).map(candidate => `<button data-candidate-target="${escape(file.id)}" data-candidate-source="${escape(candidate.id)}">从哈希匹配文件修复</button>`).join('')}</div></article>`).join('') || '<p class="index-empty">没有发现断链。</p>';
    $('#index-duplicates').innerHTML = value.duplicates.map(group => `<article class="duplicate-group"><header><b>${group.copies} 份相同文件 · 每份 ${bytes(group.bytesPerCopy)}</b><code>${escape(group.hash.slice(0, 16))}…</code></header><div>${group.files.map(file => `<button class="duplicate-file" data-index-entry="${escape(file.refs[0]?.key || '')}"><img loading="lazy" src="/api/thumbnail/${encodeURIComponent(file.id)}" data-media-id="${escape(file.id)}" alt="${escape(refs(file))}"><span>${escape(refs(file))}</span><code>${escape(file.id)}</code></button>`).join('')}</div></article>`).join('') || '<p class="index-empty">没有发现完全相同的已归档照片。</p>';
    $('#index-orphans').innerHTML = value.orphans.map(file => `<div class="orphan-row"><code>${escape(file.id)}</code><span>${bytes(file.size)}</span><small>${escape(file.hash.slice(0, 16))}…</small></div>`).join('') || '<p class="index-empty">没有发现脱离档案的媒体文件。</p>';
    $('#index-file-errors').innerHTML = (value.errors || []).map(file => `<p>${escape(file.id)}：${escape(file.error || file.status)}</p>`).join('');
    $('#index-limits').textContent = `各列表最多显示 ${value.limitedTo} 项；统计包含全部索引结果。${value.thumbnails?.provider === 'original' ? '当前平台使用原片预览；macOS 支持本地缩略图缓存。' : ''}`;
    $('#index-duplicates').querySelectorAll('img').forEach(image => { image.onerror = () => { image.onerror = null; image.src = `/api/media/${encodeURIComponent(image.dataset.mediaId)}`; }; });
  }
  async function refresh() {
    const token = generation;
    clearTimeout(timer);
    try {
      const response = await fetch('/api/index');
      if (!response.ok) throw new Error(response.status === 404 ? '请重启本地服务，以启用 SQLite 索引和缩略图功能。' : '无法读取资料库索引');
      const value = await response.json(); if (token !== generation || !dialog.open) return; render(value);
    } catch (error) { if (token === generation && dialog.open) $('#index-status').textContent = error.message; }
    finally { if (token === generation && dialog.open) timer = setTimeout(refresh, 2500); }
  }
  async function requestScan(force) {
    $('#btn-index-scan').disabled = $('#btn-index-rebuild').disabled = true;
    try {
      const response = await fetch(`/api/index/scan${force ? '?force=1' : ''}`, { method: 'POST' });
      if (!response.ok) throw new Error('无法启动检查，请确认服务已更新并重启');
      toast(force ? '已安排完整哈希复核' : '已安排重新检查'); await refresh();
    } catch (error) { toast(error.message, 'warning'); }
    finally { $('#btn-index-scan').disabled = $('#btn-index-rebuild').disabled = false; }
  }
  async function repair(id, options) {
    const response = await fetch(`/api/repair/${encodeURIComponent(id)}`, options);
    if (!response.ok) throw new Error(await response.text());
    const result = await response.json();
    toast(result.verified ? '哈希核对通过，原片已重新连接' : '已连接所选原片');
    onRepaired(); await requestScan(false);
  }
  $('#btn-library-health').onclick = () => { generation++; fingerprint = null; dialog.showModal(); $('#index-status').textContent = '正在读取索引…'; refresh(); };
  $('#library-health-close').onclick = () => dialog.close();
  dialog.addEventListener('close', () => { generation++; clearTimeout(timer); });
  $('#btn-index-scan').onclick = () => requestScan(false);
  $('#btn-index-rebuild').onclick = () => requestScan(true);
  $('#index-duplicates').onclick = event => { const button = event.target.closest('[data-index-entry]'); if (!button?.dataset.indexEntry) return; dialog.close(); onView(button.dataset.indexEntry); };
  $('#index-missing').onclick = async event => {
    const upload = event.target.closest('[data-upload-repair]');
    if (upload) {
      const file = report.missing.find(item => item.id === upload.dataset.uploadRepair); if (!file) return;
      repairId = file.id; $('#repair-submit').textContent = file.expectedHash ? '核对并修复' : '连接所选原片'; $('#repair-original').value = ''; $('#repair-submit').disabled = true;
      $('#repair-selected').textContent = '尚未选择文件'; $('#repair-description').textContent = `${refs(file)}。${file.expectedHash ? '恢复前将核对原始 SHA-256，不匹配的文件会被拒绝。' : '索引中没有原始哈希，无法自动核对，请选择对应原片。'}`;
      $('#repair-dialog').showModal(); return;
    }
    const candidate = event.target.closest('[data-candidate-target]'); if (!candidate) return;
    candidate.disabled = true;
    try { await repair(candidate.dataset.candidateTarget, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sourceId: candidate.dataset.candidateSource }) }); }
    catch (error) { toast(error.message, 'warning'); candidate.disabled = false; }
  };
  $('#repair-original').onchange = event => { const file = event.target.files[0]; $('#repair-selected').textContent = file ? `${file.name} · ${bytes(file.size)}` : '尚未选择文件'; $('#repair-submit').disabled = !file; };
  $('#repair-dialog').addEventListener('cancel', event => { if (repairing) event.preventDefault(); });
  $('#repair-form').onsubmit = async event => {
    if (event.submitter?.value === 'cancel') return;
    event.preventDefault(); const file = $('#repair-original').files[0]; if (!file || repairing) return;
    repairing = true; $('#repair-submit').disabled = $('#repair-cancel').disabled = true;
    try { await repair(repairId, { method: 'PUT', headers: { 'Content-Type': file.type || 'application/octet-stream' }, body: file }); $('#repair-dialog').close(); }
    catch (error) { toast(error.message, 'warning'); }
    finally { repairing = false; $('#repair-submit').disabled = $('#repair-cancel').disabled = false; }
  };
}
