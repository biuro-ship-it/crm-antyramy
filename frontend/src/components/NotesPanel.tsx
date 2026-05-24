import React, { useEffect, useState } from 'react';
import { getNotes, deleteNote, Note, NoteColor } from '../services/api';
import NoteModal from './NoteModal';

const colorClasses: Record<NoteColor, string> = {
  default: 'bg-canvas border-hairline text-ink',
  blue: 'bg-block-lilac border-hairline text-ink',
  yellow: 'bg-block-cream border-hairline text-ink',
  red: 'bg-block-pink border-hairline text-ink',
  green: 'bg-block-mint border-hairline text-ink',
};

export default function NotesPanel() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [activeNote, setActiveNote] = useState<Note | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const fetchNotes = async () => {
    try {
      setLoading(true);
      const data = await getNotes();
      setNotes(data);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Błąd pobierania notatek');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNotes();
  }, []);

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation(); // Zapobiega otwarciu modalu przy kliknięciu w "Usuń"
    if (!confirm('Czy na pewno chcesz usunąć tę notatkę?')) return;
    try {
      await deleteNote(id);
      setNotes(prev => prev.filter(n => n.id !== id));
    } catch (err) {
      alert('Nie udało się usunąć notatki');
    }
  };

  // KASKADOWE SORTOWANIE: Pilne (Dynamit) -> Ważne (Gwiazdka) -> Data modyfikacji
  const sortedAndFilteredNotes = [...notes]
    .filter(note => note.title.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      if (a.isUrgent && !b.isUrgent) return -1;
      if (!a.isUrgent && b.isUrgent) return 1;
      if (a.isImportant && !b.isImportant) return -1;
      if (!a.isImportant && b.isImportant) return 1;
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Nagłówek i Akcje */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        <div>
          <h1 className="page-title">Tablica notatek</h1>
          <p className="text-body-sm font-light mt-2">Twój podręczny scratchpad i baza procedur.</p>
        </div>
        <button
          type="button"
          onClick={() => { setActiveNote(null); setIsModalOpen(true); }}
          className="btn-primary"
        >
          + Nowa notatka
        </button>
      </div>

      {/* Wyszukiwarka */}
      <div className="mb-6">
        <input
          type="text"
          placeholder="Szukaj notatki po temacie..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="input-field max-w-md"
        />
      </div>

      {/* Siatka Notatek */}
      {loading ? (
        <div className="text-center py-12 text-ink font-light">Ładowanie tablicy notatek...</div>
      ) : sortedAndFilteredNotes.length === 0 ? (
        <div className="text-center py-12 text-ink font-light border-2 border-dashed border-hairline rounded-xl">
          Brak notatek do wyświetlenia.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {sortedAndFilteredNotes.map(note => (
            <div
              key={note.id}
              onClick={() => { setActiveNote(note); setIsModalOpen(true); }}
              className={`p-5 rounded-md border-2 cursor-pointer transition hover:-translate-y-0.5 flex flex-col justify-between h-48 relative ${colorClasses[note.color] || colorClasses.default}`}
            >
              {/* Ikony znaczników priorytetu */}
              <div className="absolute top-3 right-3 flex gap-1.5 text-lg">
                {note.isUrgent && <span title="Pilne">🧨</span>}
                {note.isImportant && <span title="Ważne">⭐</span>}
              </div>

              <div>
                <span className="text-xs font-mono text-ink font-light block mb-1">{note.createdAt}</span>
                <h3 className="font-semibold text-lg line-clamp-1 pr-12">{note.title}</h3>
                {/* Prosty podgląd czystego tekstu zamiast HTML stripu dla optymalizacji */}
                <div 
                  className="text-sm opacity-75 line-clamp-3 mt-2" 
                  dangerouslySetInnerHTML={{ __html: note.content }}
                />
              </div>

              <div className="flex justify-between items-center mt-4 pt-2 border-t border-black/5">
                <span className="text-xs opacity-60">
                  📎 Pliki: {note.attachments?.length || 0}
                </span>
                <button
                  onClick={(e) => handleDelete(note.id, e)}
                  className="btn-tertiary text-caption py-1"
                >
                  Usuń
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal Obsługi Formularza */}
      {isModalOpen && (
        <NoteModal
          note={activeNote}
          onClose={() => setIsModalOpen(false)}
          onSaved={fetchNotes}
        />
      )}
    </div>
  );
}