'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const memory = Object.create(null);
  const prefix = 'pp_s5_';
  const groups = ['424', '523'];
  let selected = '424';
  function read(key) {
    if (Object.prototype.hasOwnProperty.call(memory, key)) return memory[key];
    try { return localStorage.getItem(prefix + key) || ''; } catch { return ''; }
  }
  function write(key, value) {
    memory[key] = String(value);
    try { localStorage.setItem(prefix + key, String(value)); return true; } catch { return false; }
  }
  function team(code) { return $('team-select-' + code).value; }
  function key(code, kind) {
    return code + '_' + (kind === 'individual' ? 'individual' : 'team' + team(code) + '_' + kind);
  }
  function restore(code) {
    for (const kind of ['team', 'case', 'individual']) {
      $('draft-' + kind + '-' + code).value = read(key(code, kind));
      $('save-' + kind + '-' + code).textContent = '';
    }
  }
  function selectGroup(code, update = true) {
    if (!groups.includes(code)) return;
    selected = code;
    document.querySelectorAll('[data-group-panel]').forEach(p => p.hidden = p.dataset.groupPanel !== code);
    document.querySelectorAll('[data-group]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.group === code)));
    write('selected_group', code);
    if (update) {
      try { history.replaceState(null, '', '#g-' + code); } catch { /* File previews can restrict history. */ }
    }
  }
  function applyHash() {
    const match = location.hash.match(/^#(?:g|teams|case|individual)-(424|523)$/);
    if (match) selectGroup(match[1], false);
    return !!match;
  }
  document.querySelectorAll('[data-group]').forEach(b => b.addEventListener('click', () => selectGroup(b.dataset.group)));
  groups.forEach(code => {
    const storedTeam = read(code + '_selected_team');
    if (/^[1-5]$/.test(storedTeam)) $('team-select-' + code).value = storedTeam;
    $('team-select-' + code).addEventListener('change', () => {
      write(code + '_selected_team', team(code));
      restore(code);
      $('complete-' + code).textContent = '';
    });
    for (const kind of ['team', 'case', 'individual']) {
      $('draft-' + kind + '-' + code).addEventListener('input', event => {
        const persisted = write(key(code, kind), event.target.value);
        $('save-' + kind + '-' + code).textContent = persisted
          ? 'Сохранено на этом устройстве.'
          : 'Доступно до закрытия страницы. Скачайте ответы, чтобы сохранить их.';
        if (kind === 'individual') $('complete-' + code).textContent = '';
      });
    }
    restore(code);
    document.querySelectorAll('[data-check="' + code + '"]').forEach(check => check.addEventListener('change', () => {
      const count = document.querySelectorAll('[data-check="' + code + '"]:checked').length;
      $('progress-' + code).value = count;
      $('progress-label-' + code).textContent = 'Проверено ' + count + ' из 4';
    }));
  });
  if (!applyHash()) selectGroup(groups.includes(read('selected_group')) ? read('selected_group') : '424', false);
  window.addEventListener('hashchange', applyHash);
  document.querySelectorAll('[data-complete]').forEach(b => b.addEventListener('click', () => {
    const code = b.dataset.complete;
    $('complete-' + code).textContent = $('draft-individual-' + code).value.trim()
      ? 'Ответ записан. Проверьте наличие решения мини-кейса и четырех коротких ответов. Правильность оценивает преподаватель.'
      : 'Поле пока пустое. Запишите решение и ответы.';
  }));
  document.querySelectorAll('[data-export]').forEach(b => b.addEventListener('click', () => {
    const code = b.dataset.export;
    const label = code === '424' ? '4/24' : '5/23';
    const parts = ['Семинар 5 / Публичные закупки', 'Группа ' + label, 'Нормативный срез: 23.10.2026', ''];
    for (let n = 1; n <= 5; n++) {
      for (const kind of ['team', 'case']) {
        const text = read(code + '_team' + n + '_' + kind);
        if (text) parts.push('Команда ' + n + ' / ' + (kind === 'team' ? 'задача' : 'общий кейс'), text, '');
      }
    }
    parts.push('Индивидуальная работа', read(code + '_individual') || '(не заполнено)', '', 'Этот файл не отправлен преподавателю автоматически.');
    const blob = new Blob(['\uFEFF' + parts.join('\n')], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'seminar-5-group-' + code + '-answers.txt';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    $('export-' + code).textContent = 'Файл ответов подготовлен к скачиванию. Передайте его преподавателю согласованным способом.';
  }));
  document.querySelectorAll('[data-clear]').forEach(b => b.addEventListener('click', () => {
    const code = b.dataset.clear;
    if (!window.confirm('Удалить черновики всех команд и индивидуальный ответ этой группы на данном устройстве?')) return;
    for (let n = 1; n <= 5; n++) for (const kind of ['team', 'case']) write(code + '_team' + n + '_' + kind, '');
    write(code + '_individual', '');
    restore(code);
    $('complete-' + code).textContent = '';
    $('export-' + code).textContent = 'Записи этой группы очищены.';
  }));
  const total = 90 * 60;
  let remaining = total, deadline = null, interval = null;
  const stages = [
    [5, '0-5 мин · Распределение ролей'], [12, '5-12 мин · Разминка'],
    [30, '12-30 мин · Командная работа'], [45, '30-45 мин · Защита решений'],
    [62, '45-62 мин · Общий кейс'], [72, '62-72 мин · Взаимная проверка'],
    [84, '72-84 мин · Индивидуальная проверка'], [90, '84-90 мин · Итоги']
  ];
  function drawClock() {
    if (deadline !== null) remaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
    $('clock').textContent = String(Math.floor(remaining / 60)).padStart(2, '0') + ':' + String(remaining % 60).padStart(2, '0');
    const elapsed = (total - remaining) / 60;
    const stage = stages.find(s => elapsed < s[0]);
    const message = stage ? stage[1] : '90 минут завершены. Подведите итоги.';
    if ($('phase').textContent !== message) $('phase').textContent = message;
    if (remaining === 0 && interval !== null) {
      clearInterval(interval); interval = null; deadline = null;
      $('timer-start').textContent = 'Завершено'; $('timer-start').disabled = true;
    }
  }
  $('timer-start').addEventListener('click', () => {
    if (interval !== null) {
      drawClock(); clearInterval(interval); interval = null; deadline = null;
      $('timer-start').textContent = 'Продолжить';
    } else {
      deadline = Date.now() + remaining * 1000;
      interval = setInterval(drawClock, 250);
      $('timer-start').textContent = 'Пауза'; drawClock();
    }
  });
  $('timer-reset').addEventListener('click', () => {
    if (interval !== null) clearInterval(interval);
    interval = null; deadline = null; remaining = total;
    $('timer-start').textContent = 'Начать'; $('timer-start').disabled = false; drawClock();
  });
  let printStates = [];
  window.addEventListener('beforeprint', () => {
    printStates = [...document.querySelectorAll('.group:not([hidden]) details')].map(d => [d, d.open]);
    printStates.forEach(([d]) => d.open = true);
  });
  window.addEventListener('afterprint', () => printStates.forEach(([d, open]) => d.open = open));
})();
