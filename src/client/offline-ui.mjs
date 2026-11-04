export function emptyPhotoState({ query = {}, photos = 0, offline = 0 }) {
  if (query.offline)
    return {
      title: offline ? '当前条件下没有离线照片' : '当前没有离线或断链照片',
      message: offline
        ? '清除其他筛选，或连接原片后重新检查。'
        : '原片都在线。离线预览是保存在本机的浏览缓存；外置盘断开后，照片仍在“全库照片”中显示。',
      actions: [
        { label: '离线预览怎么用', action: 'offline-help' },
        { label: '查看全库照片', action: 'scope', value: 'photos' },
        { label: '管理存储卷', action: 'open-storage' },
      ],
    };
  if (query.trash)
    return {
      title: '回收站为空',
      message: '删除的照片会先移到这里，可恢复后继续归档。',
      actions: [{ label: '返回全库照片', action: 'scope', value: 'photos' }],
    };
  if (photos)
    return {
      title: '没有符合条件的记录',
      message: '照片仍在资料库中，试试清除筛选或返回全库照片。',
      actions: [
        { label: '清除筛选', action: 'reset-filters' },
        { label: '查看全库照片', action: 'scope', value: 'photos' },
      ],
    };
  return {
    title: '还没有装入照片',
    message: '可以复制照片到资料库，也可以引用外置盘中的现有目录。',
    actions: [
      { label: '导入影像', action: 'import' },
      { label: '引用外置盘目录', action: 'new-storage' },
    ],
  };
}
