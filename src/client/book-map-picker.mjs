import { leaflet } from './map-view.mjs';
import { mapSvg } from '../shared/book-map.mjs';
import { rollCoordinates } from '../shared/geolocation.mjs';

export function openBookMap({ dialog, api, E, assets = {}, initial }) {
  return new Promise(async (resolve) => {
    const places = Object.values(assets).filter((a) => rollCoordinates(a.coordinates || a));
    const d = dialog(
      '搜索地点 · 添加地图',
      `<form class="book-map-search"><input aria-label="搜索地图地点" placeholder="搜索城市、街道或景点" minlength="2" maxlength="200" required><button type="submit">搜索地点</button></form><div class="book-map-results" role="list"></div><div class="book-field-pair"><label>画册中的拍摄地点<select data-map-existing><option value="">选择已有地点…</option>${places.map((p, i) => `<option value="${i}">${E(p.location || p.name || '拍摄地点')}</option>`).join('')}</select></label><label>地图样式<select data-map-style><option value="street">街道地图 · 当前视野</option><option value="offline">离线地理示意图</option></select></label></div><div class="book-map-canvas" aria-label="点击地图放置标记"></div><img class="book-map-offline" alt="离线地理示意图" hidden><div class="book-map-fields"><label>地点名称<input data-map-label maxlength="160" placeholder="可修改地图下方的名称"></label><label>纬度<input data-map-lat type="number" min="-85" max="85" step=".000001"></label><label>经度<input data-map-lon type="number" min="-180" max="180" step=".000001"></label><button data-map-coordinate>定位坐标</button></div><p class="book-hint">搜索结果点击后定位；也可点击地图落点、调整缩放。贴入时保存当前地图和地名，之后离线查看、导出仍可用。</p><output class="book-map-status" aria-live="polite">正在加载地图…</output>`,
      '<button data-map-insert class="primary" disabled>贴入当前页</button>',
    );
    d.classList.add('book-map-dialog');
    const body = d.querySelector('.book-dialog-body'),
      sidebar = document.createElement('aside'),
      workspace = document.createElement('section');
    sidebar.className = 'book-map-sidebar';
    workspace.className = 'book-map-workspace';
    for (const selector of [
      '.book-map-search',
      '.book-map-results',
      '.book-field-pair',
      '.book-map-fields',
      '.book-hint',
      '.book-map-status',
    ])
      sidebar.append(body.querySelector(selector));
    workspace.innerHTML =
      '<div class="book-map-crop-tools"><button data-map-crop aria-pressed="false">框选范围</button><button data-map-crop-reset>使用完整视野</button><span data-map-crop-status>拖动地图调整位置，再框选需要的范围</span></div><div class="book-map-stage"></div>';
    const stage = workspace.querySelector('.book-map-stage');
    stage.append(body.querySelector('.book-map-canvas'), body.querySelector('.book-map-offline'));
    const cropLayer = document.createElement('div');
    cropLayer.className = 'book-map-crop-layer';
    cropLayer.innerHTML = '<div class="book-map-crop-box" hidden></div>';
    stage.append(cropLayer);
    body.append(sidebar, workspace);
    let crop = initial?.mapCrop || null,
      cropMode = false,
      cropDrag = null;
    let map,
      layer,
      marker,
      land,
      disposed = false,
      busy = false,
      point = initial?.points?.[0] || null,
      sequence = 0;
    const $ = (s) => d.querySelector(s),
      status = $('.book-map-status'),
      mapHost = $('.book-map-canvas');
    function showCrop() {
      const box = cropLayer.firstElementChild;
      box.hidden = !crop;
      if (crop)
        Object.assign(box.style, {
          left: crop.x * 100 + '%',
          top: crop.y * 100 + '%',
          width: crop.w * 100 + '%',
          height: crop.h * 100 + '%',
        });
      $('[data-map-crop-status]').textContent = crop
        ? `已选范围 · ${Math.round(crop.w * 100)}% × ${Math.round(crop.h * 100)}% · 可重新框选`
        : '使用完整视野';
    }
    function setCropMode(value) {
      cropMode = value;
      cropLayer.classList.toggle('drawing', value);
      $('[data-map-crop]').setAttribute('aria-pressed', String(value));
      if (map) {
        if (value) {
          map.dragging.disable();
          map.boxZoom.disable();
        } else {
          map.dragging.enable();
          map.boxZoom.enable();
        }
      }
    }
    $('[data-map-crop]').onclick = () => setCropMode(!cropMode);
    $('[data-map-crop-reset]').onclick = () => {
      crop = null;
      showCrop();
      setCropMode(false);
    };
    const position = (e) => {
      const r = stage.getBoundingClientRect();
      return {
        x: Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)),
        y: Math.max(0, Math.min(1, (e.clientY - r.top) / r.height)),
      };
    };
    cropLayer.onpointerdown = (e) => {
      if (!cropMode || e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      cropDrag = position(e);
      cropLayer.setPointerCapture(e.pointerId);
    };
    cropLayer.onpointermove = (e) => {
      if (!cropDrag) return;
      const p = position(e);
      crop = {
        x: Math.min(p.x, cropDrag.x),
        y: Math.min(p.y, cropDrag.y),
        w: Math.abs(p.x - cropDrag.x),
        h: Math.abs(p.y - cropDrag.y),
      };
      showCrop();
    };
    cropLayer.onpointerup = (e) => {
      if (!cropDrag) return;
      cropDrag = null;
      if (crop && (crop.w * stage.clientWidth < 40 || crop.h * stage.clientHeight < 40))
        crop = null;
      if (crop && !point && map && $('[data-map-style]').value === 'street') {
        const p = map.wrapLatLng(
          map.containerPointToLatLng([
            (crop.x + crop.w / 2) * mapHost.clientWidth,
            (crop.y + crop.h / 2) * mapHost.clientHeight,
          ]),
        );
        setPoint({ latitude: p.lat, longitude: p.lng, name: '所选区域' }, false);
      }
      showCrop();
      cropLayer.releasePointerCapture(e.pointerId);
      setCropMode(false);
    };
    cropLayer.onpointercancel = () => {
      cropDrag = null;
      crop = null;
      showCrop();
      setCropMode(false);
    };
    const finish = () => {
      disposed = true;
      sequence++;
      map?.remove();
      resolve(null);
    };
    d.addEventListener('close', finish, { once: true });
    const updateOffline = async () => {
      land ||= await fetch('/world-land.json').then((r) => r.json());
      if (!disposed)
        $('.book-map-offline').src =
          'data:image/svg+xml,' + encodeURIComponent(mapSvg(point ? [point] : [], land));
    };
    function setPoint(p, recenter = true) {
      point = { latitude: Number(p.latitude), longitude: Number(p.longitude), name: p.name || '' };
      $('[data-map-label]').value = point.name;
      $('[data-map-lat]').value = point.latitude.toFixed(6);
      $('[data-map-lon]').value = point.longitude.toFixed(6);
      if (map) {
        marker.setLatLng([point.latitude, point.longitude]).addTo(map);
        if (recenter) map.setView([point.latitude, point.longitude], 11);
      }
      $('[data-map-insert]').disabled = false;
      status.textContent = `已标记 ${point.latitude.toFixed(5)}, ${point.longitude.toFixed(5)} · 可继续缩放、移动地图`;
      if ($('[data-map-style]').value === 'offline')
        updateOffline().catch(() => {
          status.textContent = '离线地图加载失败，请重试';
        });
    }
    $('[data-map-existing]').onchange = (e) => {
      const p = places[Number(e.target.value)];
      if (e.target.value !== '' && p)
        setPoint({ ...rollCoordinates(p.coordinates || p), name: p.location || p.name });
    };
    $('[data-map-coordinate]').onclick = () => {
      const lat = $('[data-map-lat]'),
        lon = $('[data-map-lon]');
      if (!lat.value || !lon.value || !lat.reportValidity() || !lon.reportValidity()) return;
      setPoint({ latitude: lat.value, longitude: lon.value, name: $('[data-map-label]').value });
    };
    $('[data-map-style]').onchange = async () => {
      const offline = $('[data-map-style]').value === 'offline';
      crop = null;
      showCrop();
      setCropMode(false);
      mapHost.hidden = offline;
      $('.book-map-offline').hidden = !offline;
      try {
        if (offline) await updateOffline();
        else map?.invalidateSize();
      } catch {
        status.textContent = '离线地图加载失败';
      }
    };
    $('.book-map-search').onsubmit = async (e) => {
      e.preventDefault();
      const token = ++sequence,
        button = e.target.querySelector('button');
      button.disabled = true;
      status.textContent = '正在搜索地点…';
      try {
        const matches = await api(
          '/places?' + new URLSearchParams({ q: e.target.querySelector('input').value.trim() }),
        );
        if (disposed || token !== sequence) return;
        $('.book-map-results').innerHTML = matches
          .map((p, i) => `<button type="button" data-map-result="${i}">${E(p.label)}</button>`)
          .join('');
        $('.book-map-results')
          .querySelectorAll('button')
          .forEach(
            (b, i) =>
              (b.onclick = () => {
                setPoint({ ...matches[i], name: matches[i].label });
                $('.book-map-results').innerHTML = '';
              }),
          );
        status.textContent = matches.length
          ? '点击搜索结果定位地图'
          : '未找到地点，可直接在地图落点或输入坐标';
      } catch (err) {
        if (!disposed) status.textContent = err.message;
      } finally {
        button.disabled = false;
      }
    };
    $('[data-map-insert]').onclick = async () => {
      if (!point || busy) return;
      busy = true;
      $('[data-map-insert]').disabled = true;
      status.textContent = '正在保存地图画面…';
      try {
        await document.fonts.load('20px BookSans');
        const canvas = document.createElement('canvas'),
          ctx = canvas.getContext('2d');
        canvas.width = 1200;
        const offline = $('[data-map-style]').value === 'offline',
          mapRect = mapHost.getBoundingClientRect();
        const area = crop || { x: 0, y: 0, w: 1, h: 1 };
        const sourceRect = stage.getBoundingClientRect();
        const h = Math.round(((sourceRect.height * area.h) / (sourceRect.width * area.w)) * 1200);
        const scaleX = 1200 / (sourceRect.width * area.w),
          scaleY = h / (sourceRect.height * area.h);
        canvas.height = h + 100;
        ctx.fillStyle = '#faf8f2';
        ctx.fillRect(0, 0, 1200, canvas.height);
        if (offline) {
          await updateOffline();
          await $('.book-map-offline').decode();
          const img = $('.book-map-offline');
          // The preview uses contain; capture the same letterboxing and selection.
          const source = document.createElement('canvas');
          source.width = Math.round(sourceRect.width * 2);
          source.height = Math.round(sourceRect.height * 2);
          const sc = source.getContext('2d'),
            factor = Math.min(source.width / img.naturalWidth, source.height / img.naturalHeight);
          sc.fillStyle = '#e7edf0';
          sc.fillRect(0, 0, source.width, source.height);
          sc.drawImage(
            img,
            (source.width - img.naturalWidth * factor) / 2,
            (source.height - img.naturalHeight * factor) / 2,
            img.naturalWidth * factor,
            img.naturalHeight * factor,
          );
          ctx.drawImage(
            source,
            area.x * source.width,
            area.y * source.height,
            area.w * source.width,
            area.h * source.height,
            0,
            0,
            1200,
            h,
          );
        } else {
          if (!map || !layer) throw Error('地图尚未就绪');
          map.stop();
          const tiles = [...layer.getContainer().querySelectorAll('img.leaflet-tile')].filter(
            (img) => {
              const r = img.getBoundingClientRect();
              return (
                r.right > mapRect.left + area.x * mapRect.width &&
                r.left < mapRect.left + (area.x + area.w) * mapRect.width &&
                r.bottom > mapRect.top + area.y * mapRect.height &&
                r.top < mapRect.top + (area.y + area.h) * mapRect.height
              );
            },
          );
          if (!tiles.length || tiles.some((img) => !img.complete || !img.naturalWidth))
            throw Error('地图底图尚未加载完成；请稍候重试，或选择离线地理示意图');

          ctx.save();
          ctx.beginPath();
          ctx.rect(0, 0, 1200, h);
          ctx.clip();
          for (const img of tiles) {
            const r = img.getBoundingClientRect();
            ctx.drawImage(
              img,
              (r.left - mapRect.left - area.x * mapRect.width) * scaleX,
              (r.top - mapRect.top - area.y * mapRect.height) * scaleY,
              r.width * scaleX,
              r.height * scaleY,
            );
          }
          const p = map.latLngToContainerPoint([point.latitude, point.longitude]);

          ctx.beginPath();
          ctx.arc(
            (p.x - area.x * mapRect.width) * scaleX,
            (p.y - area.y * mapRect.height) * scaleY,
            10,
            0,
            Math.PI * 2,
          );
          ctx.fillStyle = '#385a4c';
          ctx.fill();
          ctx.strokeStyle = '#fff';
          ctx.lineWidth = 3;
          ctx.stroke();
          ctx.restore();
          ctx.fillStyle = '#fff';
          ctx.fillRect(876, h - 24, 324, 24);
          ctx.fillStyle = '#33463d';
          ctx.font = '16px BookSans';
          ctx.fillText('© OpenStreetMap contributors', 883, h - 7);
        }
        if (offline) {
          ctx.fillStyle = '#fff';
          ctx.fillRect(880, h - 24, 320, 24);
          ctx.fillStyle = '#33463d';
          ctx.font = '16px BookSans';
          ctx.fillText('Natural Earth · 地理示意图', 888, h - 7);
        }
        const name = $('[data-map-label]').value.trim() || '拍摄地点';
        ctx.fillStyle = '#283c32';
        ctx.font = '22px BookSans';
        let title = name;
        while (ctx.measureText(title).width > 1150) title = title.slice(0, -2) + '…';
        ctx.fillText(title, 24, h + 36);
        ctx.font = '18px BookSans';
        ctx.fillText(
          `${point.latitude.toFixed(5)}, ${point.longitude.toFixed(5)} · WGS84`,
          24,
          h + 72,
        );
        let snapshot;
        try {
          const output = document.createElement('canvas'),
            factor = Math.min(1, 2400 / canvas.height);
          output.width = Math.round(canvas.width * factor);
          output.height = Math.round(canvas.height * factor);
          output.getContext('2d').drawImage(canvas, 0, 0, output.width, output.height);
          snapshot = output.toDataURL('image/png');
        } catch {
          throw Error('底图不允许保存，请选择离线地理示意图');
        }
        if (disposed) return;
        const center = map ? map.wrapLatLng(map.getCenter()) : null;
        resolve({
          type: 'map',
          points: [{ ...point, name }],
          snapshot,
          mapCrop: crop,
          mapStyle: offline ? 'offline' : 'street',
          connect: false,
          mapView: center
            ? {
                latitude: Math.max(-85, Math.min(85, center.lat)),
                longitude: center.lng,
                zoom: map.getZoom(),
              }
            : undefined,
          ratio: canvas.width / canvas.height,
        });
        d.close();
      } catch (err) {
        if (!disposed) status.textContent = err.message;
      } finally {
        busy = false;
        $('[data-map-insert]').disabled = false;
      }
    };
    try {
      const L = await leaflet();
      if (disposed) return;
      map = L.map(mapHost, {
        zoomAnimation: false,
        fadeAnimation: false,
        worldCopyJump: true,
        maxZoom: 18,
      }).setView([35, 104], 4);
      layer = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 18,
        crossOrigin: 'anonymous',
        attribution:
          '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap contributors</a>',
      }).addTo(map);
      marker = L.circleMarker([0, 0], {
        radius: 7,
        color: '#fff',
        weight: 2,
        fillColor: '#385a4c',
        fillOpacity: 1,
      });
      map.on('click', (e) => {
        const p = map.wrapLatLng(e.latlng);
        setPoint({ latitude: p.lat, longitude: p.lng, name: $('[data-map-label]').value }, false);
      });
      layer.on('tileerror', () => {
        if (!disposed) status.textContent = '在线底图暂不可用，可切换离线地理示意图';
      });
      if (point) {
        setPoint(point);
        if (initial?.mapView)
          map.setView([initial.mapView.latitude, initial.mapView.longitude], initial.mapView.zoom);
      } else status.textContent = '搜索地点，或点击地图放置标记';
      map.invalidateSize();
      if (initial?.mapStyle === 'offline') {
        $('[data-map-style]').value = 'offline';
        mapHost.hidden = true;
        $('.book-map-offline').hidden = false;
        await updateOffline();
      }
      showCrop();
    } catch (err) {
      if (!disposed) {
        status.textContent = '地图组件暂不可用；仍可输入坐标，选择离线地理示意图';
        if (point) setPoint(point, false);
      }
    }
  });
}
