// Экран «Синхронизация» и значок состояния в шапке.
import { store } from '../store.js';
import { sync, getConfig, testConnection, connect, disconnect, pull } from '../sync.js';
import { esc, icon, pageHead, field, toast, openModal, closeModal, modalHead } from '../ui.js';

const STATUS = {
  off: { text: 'Только это устройство', cls: 'off' },
  ok: { text: 'Синхронизировано', cls: 'ok' },
  busy: { text: 'Сохраняю…', cls: 'busy' },
  offline: { text: 'Нет связи', cls: 'warn' },
  error: { text: 'Ошибка синхронизации', cls: 'err' },
};

export function syncPill() {
  const s = STATUS[sync.status] || STATUS.off;
  return `<a href="#/sync" class="sync-pill ${s.cls}" title="${esc(sync.message || s.text)}"><i></i><span>${s.text}</span></a>`;
}
export function paintSyncPill() {
  const el = document.getElementById('sync-pill');
  if (el) el.innerHTML = syncPill();
}

export function renderSync() {
  const cfg = getConfig();
  if (cfg) {
    const s = STATUS[sync.status] || STATUS.off;
    return `${pageHead('Синхронизация', 'Данные общие для телефона и компьютера')}
    <div class="card stack-12">
      <div class="row gap10"><span class="sync-pill ${s.cls}"><i></i><span>${s.text}</span></span>${sync.lastSync ? `<span class="muted small">последняя: ${sync.lastSync.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}</span>` : ''}</div>
      ${sync.message ? `<div class="${sync.status === 'error' ? 'warn' : 'note'}">${esc(sync.message)}</div>` : ''}
      <div class="kv"><span>Облако</span><b>github.com/${esc(cfg.repo)}</b></div>
      <p class="muted small">Изменения отправляются через пару секунд после сохранения. Свежие данные подтягиваются при открытии приложения и раз в минуту. Без интернета приложение работает как обычно и досылает изменения позже.</p>
      <div class="row wrap gap10">
        <button class="btn primary" data-act="sync-now">${icon.repeat(16)} Синхронизировать сейчас</button>
        <button class="btn ghost" data-act="sync-off">Отключить на этом устройстве</button>
      </div>
    </div>`;
  }
  return `${pageHead('Синхронизация', 'Чтобы телефон и компьютер видели одни и те же данные')}
  <div class="card stack-12">
    <div class="h3">Как подключить (один раз)</div>
    <ol class="steps">
      <li><b>Создайте закрытый репозиторий</b> для данных: <a class="link" href="https://github.com/new" target="_blank" rel="noopener">github.com/new</a> → название <code>print3d-data</code> → <b>Private</b> → отметьте «Add a README» → «Create repository».</li>
      <li><b>Создайте ключ доступа</b>: <a class="link" href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener">github.com/settings/personal-access-tokens/new</a>
        <ul>
          <li>Token name — <code>Мастерская 3D</code>, Expiration — самый долгий срок;</li>
          <li>Repository access → <b>Only select repositories</b> → <code>print3d-data</code>;</li>
          <li>Permissions → Repository permissions → <b>Contents</b> → <b>Read and write</b>;</li>
          <li>«Generate token» → скопируйте ключ (начинается с <code>github_pat_</code>).</li>
        </ul></li>
      <li><b>Вставьте ниже</b> и нажмите «Подключить». На втором устройстве — то же самое с тем же ключом.</li>
    </ol>
    <p class="muted small">Ключ даёт доступ только к репозиторию с данными и хранится только на этом устройстве. Код приложения и ваши данные лежат в разных репозиториях: данные — в закрытом.</p>
  </div>
  <form class="card stack-12" data-form="sync-connect">
    ${field('Репозиторий с данными', '<input name="repo" placeholder="ваш-логин/print3d-data" required autocomplete="off" autocapitalize="off" spellcheck="false">', 'например, Svetlana-Savelyeva/print3d-data')}
    ${field('Ключ доступа', '<input name="token" type="password" placeholder="github_pat_…" required autocomplete="off" autocapitalize="off" spellcheck="false">')}
    <button class="btn primary big" type="submit">Подключить</button>
  </form>`;
}

let pendingInfo = null;
export const syncActions = {
  'sync-now': () => pull().then(() => toast(sync.status === 'ok' ? 'Синхронизировано' : sync.message || 'Не удалось', sync.status === 'ok' ? 'ok' : 'err')),
  'sync-off': async () => {
    if (!confirm('Отключить синхронизацию на этом устройстве? Данные здесь останутся, но перестанут обновляться.')) return;
    await disconnect();
    toast('Синхронизация отключена');
  },
  'sync-choose': async (el) => {
    closeModal();
    await doConnect(pendingInfo, el.dataset.v);
  },
};

async function doConnect(info, mode) {
  try {
    toast('Подключаю…');
    await connect(info, mode);
    toast(sync.status === 'ok' ? 'Готово! Данные синхронизируются' : sync.message, sync.status === 'ok' ? 'ok' : 'err');
    location.hash = '#/home';
  } catch (e) { toast(e.message, 'err'); }
}

export const syncForms = {
  'sync-connect': async (form, f) => {
    let info;
    try {
      toast('Проверяю доступ…');
      info = await testConnection(f.repo, f.token);
    } catch (e) {
      return toast(e instanceof TypeError ? 'Нет связи с GitHub' : e.message, 'err');
    }
    const local = store.state;
    const localEmpty = !local.setupDone || (!local.prints.length && !local.spools.length && !local.purchases.length);
    if (!info.remote) {
      if (local.demo && !confirm('Сейчас открыты демо-данные. Отправить их в облако? Обычно сначала очищают демо (Ещё → Резервная копия).')) return;
      return doConnect(info, 'device');
    }
    if (localEmpty || local.demo) return doConnect(info, 'cloud');
    pendingInfo = info;
    openModal(`${modalHead('В облаке уже есть данные')}
      <div class="stack-12">
        <p class="muted">И на этом устройстве тоже. Что сделать?</p>
        <button class="btn primary big" data-act="sync-choose" data-v="merge">Объединить (рекомендую)</button>
        <p class="muted small">Записи с обоих устройств сложатся в одну базу.</p>
        <button class="btn soft big" data-act="sync-choose" data-v="cloud">Взять данные из облака</button>
        <p class="muted small">Данные этого устройства заменятся облачными.</p>
        <button class="btn ghost big" data-act="sync-choose" data-v="device">Отправить данные этого устройства</button>
        <p class="muted small">Облако заменится данными отсюда.</p>
      </div>`);
  },
};
