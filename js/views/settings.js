import {
  daysInWeekOrder,
  exportData,
  importData,
  isValidBackup,
  resetPlan,
  saveMeta,
  state,
} from '../store.js';
import { confirmDialog, icons, toast } from '../ui.js';
import { WEEKDAYS, esc, isoDate } from '../util.js';

export async function saveBackup() {
  const json = JSON.stringify(exportData());
  const name = `eisen-backup-${isoDate()}.json`;
  const file = new File([json], name, { type: 'application/json' });
  // Downloads are unreliable inside an installed iOS web app; the share sheet offers "In Dateien sichern".
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
    } catch (error) {
      if (error.name === 'AbortError') return false;
      download(file, name);
    }
  } else {
    download(file, name);
  }
  state.meta.lastBackupAt = Date.now();
  saveMeta();
  return true;
}

function download(file, name) {
  const url = URL.createObjectURL(file);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

function backupNote() {
  const last = state.meta.lastBackupAt;
  if (!last) return 'Noch kein Backup gespeichert. Deine Daten liegen nur auf diesem Handy.';
  return `Letztes Backup: ${new Date(last).toLocaleDateString('de-DE')}`;
}

export function viewSettings(root) {
  function render() {
    root.innerHTML = `
      <div class="page">
        <h1 class="page-title">Einstellungen</h1>

        <section class="group">
          <h2 class="section-title">Trainingsplan</h2>
          <div class="list">
            ${daysInWeekOrder().map((day) => `
              <a class="list-row" href="#/plan/${day.id}" data-color="${day.color}">
                <span class="day-edge"></span>
                <span class="list-text"><strong>${esc(day.title)}</strong><small>${WEEKDAYS[day.weekday]}, ${day.items.length} Übungen</small></span>
                ${icons.chevron}
              </a>`).join('')}
          </div>
        </section>

        <section class="group">
          <h2 class="section-title">Backup</h2>
          <p class="page-note backup-note">${backupNote()}</p>
          <button class="btn btn-solid btn-wide" data-act="backup">Backup speichern</button>
          <label class="btn btn-quiet btn-wide file-btn">
            Backup laden
            <input type="file" accept=".json,application/json" data-import>
          </label>
        </section>

        <section class="group">
          <button class="btn btn-quiet btn-wide btn-warn" data-act="reset">Standardplan wiederherstellen</button>
          <p class="page-note">Eisen 1.0. Keine Konten, keine Server. Alles bleibt auf deinem Handy.</p>
        </section>
      </div>`;

    root.querySelector('[data-import]').addEventListener('change', onImport);
  }

  async function onImport(event) {
    const [file] = event.target.files;
    event.target.value = '';
    if (!file) return;
    let data = null;
    try {
      data = JSON.parse(await file.text());
    } catch {
      // Handled below together with files that are valid JSON but no backup.
    }
    if (!isValidBackup(data)) {
      toast('Das ist kein Eisen-Backup. Wähle eine Datei, die „Backup speichern“ erstellt hat.', { duration: 6000 });
      return;
    }
    const yes = await confirmDialog({
      title: 'Backup laden?',
      text: `Das Backup enthält ${data.sessions.length} Trainings. Alles, was jetzt in der App steht, wird dadurch ersetzt.`,
      confirmLabel: 'Daten ersetzen',
      danger: true,
    });
    if (!yes) return;
    try {
      await importData(data);
      render();
      toast('Backup geladen');
    } catch {
      toast('Backup konnte nicht gespeichert werden. Prüfe den freien Speicher auf deinem Handy.');
    }
  }

  render();

  return {
    actions: {
      backup() {
        saveBackup().then((saved) => {
          if (!saved) return;
          root.querySelector('.backup-note').textContent = backupNote();
          toast('Backup gespeichert');
        });
      },
      async reset() {
        const yes = await confirmDialog({
          title: 'Standardplan wiederherstellen?',
          text: 'Deine Änderungen am Plan gehen verloren. Dein Verlauf bleibt erhalten.',
          confirmLabel: 'Plan zurücksetzen',
          danger: true,
        });
        if (!yes) return;
        await resetPlan();
        render();
        toast('Standardplan wiederhergestellt');
      },
    },
  };
}
