import React, { useState } from 'react';
import { downloadArchiveZip, getArchiveData, ArchiveDump } from '../services/api';

// Wymusza pobranie pliku z Bloba.
const triggerDownload = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

const stripHtml = (v: any) => String(v ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const yesNo = (v: any) => (v ? 'Tak' : 'Nie');

const flatAddress = (a: any, prefix = '') => a ? {
  [`${prefix}Ulica`]: a.street ?? '',
  [`${prefix}Nr`]: a.number ?? '',
  [`${prefix}Miasto`]: a.city ?? '',
  [`${prefix}Kod`]: a.zipCode ?? '',
  [`${prefix}Województwo`]: a.province ?? '',
} : {};

// Zagnieżdżony dump (kolekcja → { docId: {...} }) spłaszczamy do tablicy rekordów.
// Podkolekcję _sub_interactions wyłuskujemy osobno (do własnego arkusza), więc usuwamy ją z wiersza rodzica.
const toRows = (rec: Record<string, any> | undefined) =>
  Object.entries(rec ?? {}).map(([id, doc]) => {
    const { _sub_interactions, ...rest } = (doc ?? {}) as Record<string, any>;
    return { id, ...rest };
  });

// Wyciąga interakcje z podkolekcji rodziców, wzbogacając o czytelną nazwę rodzica.
const subInteractions = (rec: Record<string, any> | undefined, parentName: (doc: any) => string) =>
  Object.values(rec ?? {}).flatMap((doc: any) => {
    const name = parentName(doc);
    return ((doc?._sub_interactions ?? []) as any[]).map(i => ({ parentName: name, ...i }));
  });

// Buduje wieloarkuszowy skoroszyt Excel z zagnieżdżonego archiwum antyramy.
const buildWorkbook = (XLSX: typeof import('xlsx'), dump: ArchiveDump) => {
  const wb = XLSX.utils.book_new();
  const addSheet = (rows: any[], name: string) => {
    const ws = XLSX.utils.json_to_sheet(rows.length ? rows : [{}]);
    XLSX.utils.book_append_sheet(wb, ws, name);
  };

  const clients = toRows(dump.clients);
  const suppliers = toRows(dump.suppliers);
  const products = toRows(dump.products);
  const followups = toRows(dump.followups);
  const notes = toRows(dump.notes);
  const templates = toRows(dump.emailTemplates);

  addSheet(clients.map(c => ({
    Firma: c.companyName ?? '',
    Typ: c.type ?? '',
    NIP: c.nip ?? '',
    Osoba: c.contactPerson ?? '',
    Email: c.email ?? '',
    Telefon: c.phone ?? '',
    ...flatAddress(c.address),
    Trasa: c.route ?? '',
    'Ostatni kontakt': c.lastContactAt ?? '',
    Utworzono: c.createdAt ?? '',
  })), 'Klienci');

  addSheet(subInteractions(dump.clients, c => c?.companyName ?? '').map(i => ({
    Klient: i.parentName ?? '',
    Data: i.contactDate ?? '',
    Kanał: i.channel ?? '',
    Notatka: stripHtml(i.notes),
    Ustalenia: i.tradeNotes ?? '',
    Produkty: Array.isArray(i.products) ? i.products.join(', ') : '',
    Autor: i.createdBy ?? '',
  })), 'Kontakty');

  addSheet(suppliers.map(s => ({
    Firma: s.companyName ?? '',
    Kategoria: s.category ?? '',
    Email: s.email ?? '',
    'Tel. firma': s.phoneCompany ?? '',
    'Tel. handlowiec': s.phoneSales ?? '',
    'Tel. właściciel': s.phoneOwner ?? '',
    ...flatAddress(s.address),
    Rabat: s.agreements?.discount ?? '',
    'Termin płatności': s.agreements?.paymentTerm ?? '',
    'Częstotliwość dostaw': s.agreements?.deliveryFreq ?? '',
    Notatki: stripHtml(s.notes),
    'Ostatni kontakt': s.lastContactAt ?? '',
    Utworzono: s.createdAt ?? '',
  })), 'Dostawcy');

  addSheet(subInteractions(dump.suppliers, s => s?.companyName ?? '').map(i => ({
    Dostawca: i.parentName ?? '',
    Data: i.contactDate ?? '',
    Kanał: i.channel ?? '',
    Notatka: stripHtml(i.notes),
    Ustalenia: i.tradeNotes ?? '',
    Autor: i.createdBy ?? '',
  })), 'Kontakty dostawców');

  addSheet(products.map(p => ({
    Nazwa: p.name ?? '',
    Kod: p.code ?? '',
    'Cena netto': p.priceNetto ?? '',
    Zdjęcie: p.imageUrl ?? '',
    Utworzono: p.createdAt ?? '',
  })), 'Produkty');

  addSheet(notes.map(n => ({
    Tytuł: n.title ?? '',
    Treść: stripHtml(n.content),
    Kolor: n.color ?? '',
    Ważne: yesNo(n.isImportant),
    Pilne: yesNo(n.isUrgent),
    Utworzono: n.createdAt ?? '',
  })), 'Notatki');

  addSheet(followups.map(f => ({
    Klient: f.clientName ?? '',
    Termin: f.dueDate ?? '',
    Przypomnienie: f.reminderText ?? '',
    Status: f.status ?? '',
    Utworzono: f.createdAt ?? '',
  })), 'Przypomnienia');

  addSheet(templates.map(t => ({
    Nazwa: t.name ?? '',
    Kategoria: t.category ?? '',
    Temat: t.subject ?? '',
  })), 'Szablony maili');

  return wb;
};

const ITEMS = [
  { icon: '🏢', label: 'Klienci + historia kontaktów (w tym wysłane promocje)' },
  { icon: '🚚', label: 'Dostawcy + historia kontaktów' },
  { icon: '📦', label: 'Produkty' },
  { icon: '✉️', label: 'Szablony maili' },
  { icon: '📝', label: 'Notatki' },
  { icon: '⏰', label: 'Przypomnienia (follow-upy)' },
  { icon: '🖼️', label: 'Zdjęcia produktów (tylko w ZIP)' },
];

const ArchivePanel: React.FC = () => {
  const [loading, setLoading] = useState<null | 'zip' | 'json' | 'xlsx'>(null);
  const [error, setError] = useState<string | null>(null);

  const today = new Date().toISOString().split('T')[0];

  const handleZip = async () => {
    setError(null);
    setLoading('zip');
    try {
      const blob = await downloadArchiveZip();
      triggerDownload(blob, `crm-antyramy-backup-${today}.zip`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nie udało się pobrać archiwum');
    } finally {
      setLoading(null);
    }
  };

  const handleJson = async () => {
    setError(null);
    setLoading('json');
    try {
      const data = await getArchiveData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      triggerDownload(blob, `crm-antyramy-backup-${today}.json`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nie udało się pobrać archiwum');
    } finally {
      setLoading(null);
    }
  };

  const handleExcel = async () => {
    setError(null);
    setLoading('xlsx');
    try {
      const data = await getArchiveData();
      const XLSX = await import('xlsx'); // ładowane dynamicznie — nie powiększa głównego bundla
      const wb = buildWorkbook(XLSX, data);
      XLSX.writeFile(wb, `crm-antyramy-backup-${today}.xlsx`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nie udało się przygotować Excela');
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="animate-in fade-in duration-300">
      <div className="mb-6">
        <h2 className="text-2xl font-extrabold text-slate-900 dark:text-slate-100">Archiwum danych</h2>
        <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
          Pobierz kompletną kopię bazy na swój komputer — jako zabezpieczenie.
        </p>
      </div>

      {error && (
        <div className="bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 text-red-700 dark:text-red-300 p-4 rounded-xl mb-4">⚠️ {error}</div>
      )}

      <div className="bg-white dark:bg-surface-soft rounded-2xl border border-slate-200 dark:border-white/10 shadow-sm p-6 max-w-2xl">
        <p className="text-sm font-bold text-slate-700 dark:text-slate-300 mb-3">Kopia obejmuje:</p>
        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-6">
          {ITEMS.map(it => (
            <li key={it.label} className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
              <span className="text-base">{it.icon}</span> {it.label}
            </li>
          ))}
        </ul>

        <button
          onClick={handleZip}
          disabled={loading !== null}
          className="w-full bg-slate-900 dark:bg-slate-700 hover:bg-blue-600 dark:hover:bg-blue-600 disabled:opacity-60 text-white font-bold py-3 rounded-xl transition-colors"
        >
          {loading === 'zip' ? '⏳ Przygotowuję archiwum...' : '⬇️ Pobierz pełną kopię (ZIP: dane + zdjęcia)'}
        </button>

        <div className="flex flex-col sm:flex-row gap-3 mt-3">
          <button
            onClick={handleJson}
            disabled={loading !== null}
            className="flex-1 bg-white dark:bg-surface-soft hover:bg-slate-50 dark:hover:bg-white/10 border border-slate-300 dark:border-white/10 disabled:opacity-60 text-slate-800 dark:text-slate-200 font-bold py-3 rounded-xl transition-colors"
          >
            {loading === 'json' ? '⏳ Przygotowuję...' : '🧩 Pobierz dane (JSON)'}
          </button>
          <button
            onClick={handleExcel}
            disabled={loading !== null}
            className="flex-1 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white font-bold py-3 rounded-xl transition-colors"
          >
            {loading === 'xlsx' ? '⏳ Przygotowuję...' : '📊 Pobierz Excel (.xlsx)'}
          </button>
        </div>

        <p className="text-xs text-slate-400 dark:text-slate-500 mt-4 leading-relaxed">
          <strong>ZIP</strong> to pełna kopia: <code>dane.json</code> (odtwarzalny zrzut bazy) + folder{' '}
          <code>zdjecia/</code> ze zdjęciami. <strong>JSON</strong> to same dane (bez zdjęć) w tym samym,
          odtwarzalnym kształcie. <strong>Excel</strong> to czytelne tabele do przeglądania. Pliki zapisują
          się jako <code>crm-antyramy-backup-{today}</code>.
        </p>
      </div>
    </div>
  );
};

export default ArchivePanel;
