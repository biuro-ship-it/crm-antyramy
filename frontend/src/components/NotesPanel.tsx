import React, { useEffect, useState } from 'react';
import { getNotes, deleteNote, Note, NoteColor } from '../services/api';
import NoteModal from './NoteModal';

const colorClasses: Record<NoteColor, string> = {
  default: 'bg-white border-slate-200 text-slate-800 shadow-sm',
  blue: 'bg-blue-50 border-blue-200 text-blue-900 shadow-blue-100/50',
  yellow: 'bg-yellow-50 border-yellow-200 text-yellow-900 shadow-yellow-100/50',
  red: 'bg-red-50 border-red-200 text-red-900 shadow-red-100/50',
  green: 'bg-green-50 border-green-200 text-green-900 shadow-green-100/50',
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
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            📋 Tablica Notatek
          </h1>
          <p className="text-sm text-slate-500">Twój podręczny scratchpad i baza procedur.</p>
        </div>
        <button
          onClick={() => { setActiveNote(null); setIsModalOpen(true); }}
          className="bg-indigo-600 hover:bg-indigo-700 text-white font-medium px-4 py-2 rounded-lg shadow transition duration-150"
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
          className="w-full max-w-md border border-slate-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
        />
      </div>

      {/* Siatka Notatek */}
      {loading ? (
        <div className="text-center py-12 text-slate-500">Ładowanie tablicy notatek...</div>
      ) : sortedAndFilteredNotes.length === 0 ? (
        <div className="text-center py-12 text-slate-400 border-2 border-dashed border-slate-200 rounded-xl">
          Brak notatek do wyświetlenia.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {sortedAndFilteredNotes.map(note => (
            <div
              key={note.id}
              onClick={() => { setActiveNote(note); setIsModalOpen(true); }}
              className={`p-5 rounded-xl border-2 cursor-pointer transition transform hover:-translate-y-1 hover:shadow-md flex flex-col justify-between h-48 relative ${colorClasses[note.color] || colorClasses.default}`}
            >
              {/* Ikony znaczników priorytetu */}
              <div className="absolute top-3 right-3 flex gap-1.5 text-lg">
                {note.isUrgent && <span title="Pilne">🧨</span>}
                {note.isImportant && <span title="Ważne">⭐</span>}
              </div>

              <div>
                <span className="text-xs font-mono text-slate-400 block mb-1">{note.createdAt}</span>
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
                  className="text-xs text-red-600 hover:text-red-800 font-medium px-2 py-1 rounded hover:bg-red-50"
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