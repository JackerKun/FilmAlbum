export function createFileActions({ toast }) {
  const pending = new Map();
  async function transfer(url, filename) {
    if (window.filmAlbumDesktop) {
      toast('请选择文件保存位置，保存完成后会显示结果');
      const result = await window.filmAlbumDesktop.saveFile({ url, filename });
      if (result.status === 'error') throw Error(result.message);
      if (result.status === 'saved')
        toast('已保存：' + result.filename, 'success', {
          label: '在文件夹中显示',
          run: () => window.filmAlbumDesktop.revealFile(result.path),
        });
      else if (result.status === 'cancelled')
        toast('已取消保存，生成的 PDF 仍可在任务中心再次保存');
      return result;
    }
    const target = new URL(url, location.origin);
    if (target.origin !== location.origin) throw Error('只能下载当前资料库中的文件');
    target.searchParams.set('download', '1');
    const head = await fetch(target, { method: 'HEAD' });
    if (!head.ok) {
      let error;
      try {
        error = (await head.json()).error;
      } catch {}
      throw Error(error || '文件不可用，请连接原片或重新导出');
    }
    const a = document.createElement('a');
    a.href = target.href;
    a.download = filename || '';
    document.body.append(a);
    a.click();
    a.remove();
    toast('已交给浏览器保存，请查看下载列表');
    return { status: 'browser' };
  }
  return {
    save(url, filename) {
      if (pending.has(url)) return pending.get(url);
      const task = transfer(url, filename).finally(() => pending.delete(url));
      pending.set(url, task);
      return task;
    },
  };
}
