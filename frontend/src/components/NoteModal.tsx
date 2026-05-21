import React, { useState, useEffect } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Table } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table-row';
import { TableCell } from '@tiptap/extension-table-cell';
import { TableHeader } from '@tiptap/extension-table-header';
import { createNote, updateNote, uploadImage, Note, NoteColor, NoteAttachment } from '../services/api';

interface NoteModalProps {
  note: Note | null; // Jeśli przekazany - edycja, jeśli null - nowa
  onClose: () => void;
  onSaved: () => void;
}

export default function NoteModal({ note, onClose, onSaved }: NoteModalProps) {
  const [title, setTitle] = useState(note?.title || '');
  const [color, setColor] = useState<NoteColor>(note?.color || 'default');
  const [isImportant, setIsImportant] = useState(note?.isImportant || false);
  const [isUrgent, setIsUrgent] = useState(note?.isUrgent || false);
  const [attachments, setAttachments] = useState<NoteAttachment[]>(note?.attachments || []);
  const [uploading, setUploading] = useState(false);

  // Inicjalizacja bogatego edytora tekstu TipTap
  const editor = useEditor({
    extensions: [
      StarterKit,
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
    ],
    content: note?.content || '',
  });

  // Skrót klawiszowy CMD+Enter / CTRL+Enter zapisuje formularz
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        handleSubmit();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [title, color, isImportant, isUrgent, attachments, editor]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const file = e.target.files[0];
    try {
      setUploading(true);
      // Wykorzystujemy istniejący mechanizm wgrywania na mydevil.net z Twojego api.ts
      const fileUrl = await uploadImage(file);
      setAttachments(prev => [...prev, {
        name: file.name,
        url: fileUrl,
        type: file.type
      }]);
    } catch (err) {
      alert('Nie udało się wgrać pliku na serwer');
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async () => {
    if (!title.trim()) return alert('Temat notatki jest wymagany');
    const htmlContent = editor?.getHTML() || '';

    const formData = {
      title,
      content: htmlContent,
      color,
      isImportant,
      isUrgent,
      attachments,
    };

    try {
      if (note) {
        await updateNote(note.id, formData);
      } else {
        await createNote(formData);
      }
      onSaved();
      onClose();
    } catch (err) {
      alert('Błąd podczas zapisywania notatki');
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex justify-center items-center p-4">
      <div className="bg-white w-full max-w-3xl rounded-xl shadow-xl flex flex-col max-h-[90vh]">
        
        {/* Modal Header */}
        <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50 rounded-t-xl">
          <h2 className="text-lg font-semibold text-slate-900">
            {note ? '📝 Edytuj Notatkę' : '✨ Nowa Notatka'}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 font-bold text-xl">✕</button>
        </div>

        {/* Modal Body (Scrollable) */}
        <div className="p-6 overflow-y-auto space-y-4 flex-1">
          {/* Tytuł */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">Temat</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Wpisz krótki temat..."
              className="w-full border border-slate-300 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {/* Kolor i Priorytety */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-slate-50 p-3 rounded-lg border border-slate-200">
            {/* Wybór Koloru */}
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Kolor kafelka</label>
              <div className="flex gap-2 mt-1">
                {(['default', 'blue', 'yellow', 'red', 'green'] as NoteColor[]).map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(c)}
                    className={`w-7 h-7 rounded-full border-2 transition ${
                      c === 'default' ? 'bg-white border-slate-300' :
                      c === 'blue' ? 'bg-blue-300 border-blue-400' :
                      c === 'yellow' ? 'bg-yellow-300 border-yellow-400' :
                      c === 'red' ? 'bg-red-300 border-red-400' : 'bg-green-300 border-green-400'
                    } ${color === c ? 'scale-110 ring-2 ring-indigo-500' : 'opacity-70'}`}
                  />
                ))}
              </div>
            </div>

            {/* Flagi */}
            <div className="flex items-center justify-start md:justify-end gap-6 h-full pt-4 md:pt-0">
              <label className="flex items-center gap-2 cursor-pointer select-none font-medium text-sm">
                <input
                  type="checkbox"
                  checked={isImportant}
                  onChange={(e) => setIsImportant(e.target.checked)}
                  className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500"
                />
                ⭐ Ważne
              </label>
              <label className="flex items-center gap-2 cursor-pointer select-none font-medium text-sm text-red-700">
                <input
                  type="checkbox"
                  checked={isUrgent}
                  onChange={(e) => setIsUrgent(e.target.checked)}
                  className="w-4 h-4 text-red-600 rounded border-slate-300 focus:ring-red-500"
                />
                🧨 Pilne (Na górę)
              </label>
            </div>
          </div>

          {/* Pasek narzędzi TipTap */}
          <div className="border border-slate-300 rounded-lg overflow-hidden focus-within:ring-2 focus-within:ring-indigo-500">
            <div className="bg-slate-50 p-2 border-b border-slate-200 flex flex-wrap gap-1 text-xs">
              <button type="button" onClick={() => editor?.chain().focus().toggleBold().run()} className={`px-2 py-1 rounded ${editor?.isActive('bold') ? 'bg-indigo-200 font-bold' : 'hover:bg-slate-200'}`}>B</button>
              <button type="button" onClick={() => editor?.chain().focus().toggleItalic().run()} className={`px-2 py-1 rounded ${editor?.isActive('italic') ? 'bg-indigo-200 italic' : 'hover:bg-slate-200'}`}>I</button>
              <span className="text-slate-300 px-1">|</span>
              <button type="button" onClick={() => editor?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()} className="px-2 py-1 rounded hover:bg-slate-200 bg-white border border-slate-200">➕ Tabela 3x3</button>
              <button type="button" onClick={() => editor?.chain().focus().addColumnAfter().run()} className="px-2 py-1 rounded hover:bg-slate-200 text-slate-600">Kolumna +</button>
              <button type="button" onClick={() => editor?.chain().focus().addRowAfter().run()} className="px-2 py-1 rounded hover:bg-slate-200 text-slate-600">Wiersz +</button>
            </div>

            {/* Pole Edytora */}
            <EditorContent 
              editor={editor} 
              className="p-3 min-h-[180px] outline-none max-h-[300px] overflow-y-auto prose prose-sm max-w-none"
            />
          </div>

          {/* Załączniki */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">Załączniki (PDF, Zdjęcia)</label>
            <div className="flex items-center gap-3">
              <input
                type="file"
                id="modal-file-upload"
                onChange={handleFileUpload}
                disabled={uploading}
                className="hidden"
              />
              <label
                htmlFor="modal-file-upload"
                className={`cursor-pointer text-xs font-semibold px-3 py-2 border rounded-lg shadow-sm transition ${uploading ? 'bg-slate-100 text-slate-400 border-slate-200' : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-300'}`}
              >
                {uploading ? 'Wgrywanie pliku...' : '📎 Wybierz plik'}
              </label>
            </div>

            {/* Lista wgranych plików z podglądem */}
            {attachments.length > 0 && (
              <div className="mt-3 space-y-2">
                {attachments.map((file, idx) => (
                  <div key={idx} className="flex justify-between items-center p-2 bg-slate-50 border border-slate-200 rounded-lg text-sm">
                    <div className="flex items-center gap-2 truncate">
                      <span className="text-xs">
                        {file.type.startsWith('image/') ? '🖼️' : '📄'}
                      </span>
                      <a href={file.url} target="_blank" rel="noreferrer" className="text-indigo-600 hover:underline truncate font-medium">
                        {file.name}
                      </a>
                    </div>
                    <button
                      type="button"
                      onClick={() => setAttachments(prev => prev.filter((_, i) => i !== idx))}
                      className="text-xs text-red-500 hover:text-red-700 font-bold px-2"
                    >
                      Usuń
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-between items-center rounded-b-xl">
          <span className="text-xs text-slate-400 hidden sm:inline">💡 Zapisuj szybciej skrótem <kbd className="bg-white px-1 py-0.5 border rounded shadow-sm">Ctrl+Enter</kbd></span>
          <div className="flex gap-2 ml-auto">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 rounded-lg"
            >
              Anuluj
            </button>
            <button
              onClick={handleSubmit}
              className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow"
            >
              Zapisz
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}