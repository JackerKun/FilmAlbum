export function renderTaskRows(jobs, { E, activeRoot, savedExports = new Map() }) {
  const labels = {
    queued: '排队',
    running: '处理中',
    waiting_source: '等待 / 装入来源',
    paused: '已暂停',
    pause_requested: '正在暂停',
    cancel_requested: '正在取消',
    completed: '完成',
    failed: '失败',
    cancelled: '取消',
  };
  return (
    jobs
      .map((j) => {
        const saved = savedExports.get(j.id),
          partial = j.result?.failed > 0;
        const state = j.result?.file
          ? saved?.status === 'saved'
            ? '已保存'
            : 'PDF 已生成'
          : partial
            ? '有失败项目'
            : labels[j.state] || j.state;
        const actions = [];
        if (['running', 'queued', 'waiting_source'].includes(j.state))
          actions.push(
            `<button data-action="task-pause" data-value="${j.id}">暂停</button><button data-action="task-cancel" data-value="${j.id}">取消</button>`,
          );
        if (['paused', 'failed'].includes(j.state))
          actions.push(
            `<button data-action="task-resume" data-value="${j.id}">继续 / 重试</button>`,
          );
        if (j.kind === 'upload' && ['waiting_source', 'paused', 'failed'].includes(j.state))
          actions.push(
            `<button data-action="resume-upload" data-value="${j.id}">重选来源继续</button>`,
          );
        if (j.result?.file)
          actions.push(
            `<button class="soft" data-action="save-export" data-value="${j.id}">保存 PDF…</button>`,
          );
        if (j.kind === 'previews' && j.result) {
          if (j.payload?.root === activeRoot)
            actions.push('<button data-action="scope" data-value="photos">查看照片</button>');
          actions.push('<button data-action="offline-help">离线预览说明</button>');
          if (partial)
            actions.push(
              `<button data-action="retry-previews" data-value="${j.id}">重试生成预览</button>`,
            );
        }
        if (j.result?.destination)
          actions.push(
            `<button data-action="${j.result.demo ? 'demo-open' : 'open-restored'}" data-value="${E(j.result.destination)}">${j.result.demo ? '打开演示资料库' : '打开恢复的资料库'}</button>`,
          );
        let detail = '';
        if (j.result?.file)
          detail += `<p class="task-detail">${E(saved?.status === 'saved' ? '已保存到：' + saved.path : '文件已生成，点击保存后选择电脑上的位置。')} ${E(j.result.filename || '')}</p>`;
        if (j.kind === 'backup' && j.result?.complete === false)
          detail += `<p class="task-warning">快照缺少 ${j.result.missing} 个原片，恢复前会再次提示。</p>`;
        if (j.kind === 'previews' && j.result)
          detail += `<p class="task-detail">可用缓存 ${j.result.ready ?? j.result.processed ?? 0} 份 · 失败 ${j.result.failed || 0} 份 · 跳过视频 ${j.result.skipped || 0} 个。预览已保存在资料库，无需下载。</p>`;
        if (j.kind === 'external-import' && j.result)
          detail += `<p class="task-detail">新导入 ${j.result.added} 张 · 已有 ${j.result.existing || 0} 张${j.payload?.offlinePreviews ? ` · 预览可用 ${j.result.ready || 0} 份 · 预览失败 ${j.result.failed || 0} 份` : ''}</p>`;
        if (j.result?.failures?.length)
          detail += `<details class="task-warning"><summary>查看失败原因（连接原片后可重试）</summary>${j.result.failures.map((f) => `<p>${E(f.id)}：${E(f.message)}</p>`).join('')}</details>`;
        return `<article class="task-row"><div class="task-main"><b>${E(j.label)}</b><p>${E(j.phase)}${j.total ? ' · ' + j.done + ' / ' + j.total : ''}</p>${['running', 'waiting_source'].includes(j.state) ? `<progress max="${j.total || 1}" value="${j.done}"></progress>` : ''}${j.error ? `<p class="task-warning">${E(j.error)}</p>` : ''}${detail}</div><span class="task-state">${state}</span>${actions.length ? `<div class="task-actions">${actions.join('')}</div>` : ''}</article>`;
      })
      .join('') || '<div class="empty">任务队列是空的</div>'
  );
}
