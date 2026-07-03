import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  DndContext, DragEndEvent, PointerSensor, TouchSensor,
  useSensor, useSensors, closestCorners,
} from '@dnd-kit/core';
import {
  SortableContext, useSortable, verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { useDroppable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import {
  getKanbanTasks, moveKanbanTask, deleteKanbanTask, getClients,
  KanbanTask, KanbanColumn, KanbanColor, Client,
} from '../services/api';
import KanbanModal from './KanbanModal';

const COLUMNS: { id: KanbanColumn; label: string; accent: string }[] = [
  { id: 'todo', label: 'Do zrobienia', accent: 'bg-block-pink' },
  { id: 'doing', label: 'W toku', accent: 'bg-block-cream' },
  { id: 'done', label: 'Zrobione', accent: 'bg-block-mint' },
];

const cardColor: Record<KanbanColor, string> = {
  default: 'bg-canvas border-hairline',
  blue: 'bg-block-lilac border-hairline',
  yellow: 'bg-block-cream border-hairline',
  red: 'bg-block-pink border-hairline',
  green: 'bg-block-mint border-hairline',
};

// ─── Karta (sortowalna) ────────────────────────────────────────────────────
interface CardProps {
  task: KanbanTask;
  onEdit: (t: KanbanTask) => void;
  onDelete: (id: string) => void;
}

function SortableCard({ task, onEdit, onDelete }: CardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    touchAction: 'none',
  };

  const isOverdue = task.dueDate && task.column !== 'done' && new Date().toISOString().split('T')[0] > task.dueDate;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={() => onEdit(task)}
      className={`p-3 rounded-md border-2 cursor-grab active:cursor-grabbing shadow-sm ${cardColor[task.color || 'default']}`}
    >
      <div className="flex justify-between items-start gap-2">
        <h4 className="font-semibold text-sm text-ink line-clamp-2">{task.title}</h4>
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); onDelete(task.id); }}
          className="text-xs text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 font-bold shrink-0"
          title="Usuń"
        >
          ✕
        </button>
      </div>
      {task.description && (
        <p className="text-xs text-ink opacity-70 mt-1 line-clamp-2">{task.description}</p>
      )}
      <div className="flex flex-wrap gap-1 mt-2">
        {task.clientName && <span className="badge badge-cream text-[10px]">🏢 {task.clientName}</span>}
        {task.dueDate && (
          <span className={`badge text-[10px] ${isOverdue ? 'badge-coral' : 'badge-cream'}`}>
            📅 {task.dueDate}
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Kolumna (strefa upuszczania) ───────────────────────────────────────────
interface ColumnProps {
  column: { id: KanbanColumn; label: string; accent: string };
  tasks: KanbanTask[];
  onEdit: (t: KanbanTask) => void;
  onDelete: (id: string) => void;
  onAdd: (col: KanbanColumn) => void;
}

function Column({ column, tasks, onEdit, onDelete, onAdd }: ColumnProps) {
  const { setNodeRef } = useDroppable({ id: column.id });
  return (
    <div className="flex flex-col bg-surface-soft rounded-xl p-3 min-h-[200px]">
      <div className="flex justify-between items-center mb-3">
        <div className="flex items-center gap-2">
          <span className={`w-3 h-3 rounded-full ${column.accent}`} />
          <h3 className="font-semibold text-ink text-sm">{column.label}</h3>
          <span className="text-xs text-ink opacity-60">{tasks.length}</span>
        </div>
        <button
          type="button"
          onClick={() => onAdd(column.id)}
          className="text-ink opacity-60 hover:opacity-100 font-bold text-lg leading-none"
          title="Dodaj zadanie"
        >
          ＋
        </button>
      </div>
      <SortableContext items={tasks.map(t => t.id)} strategy={verticalListSortingStrategy}>
        <div ref={setNodeRef} className="flex flex-col gap-2 flex-1">
          {tasks.map(task => (
            <SortableCard key={task.id} task={task} onEdit={onEdit} onDelete={onDelete} />
          ))}
          {tasks.length === 0 && (
            <div className="text-xs text-ink opacity-40 text-center py-6 border-2 border-dashed border-hairline rounded-lg">
              Przeciągnij tu zadanie
            </div>
          )}
        </div>
      </SortableContext>
    </div>
  );
}

// ─── Panel ──────────────────────────────────────────────────────────────────
export default function KanbanPanel() {
  const [tasks, setTasks] = useState<KanbanTask[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editTask, setEditTask] = useState<KanbanTask | null>(null);
  const [addColumn, setAddColumn] = useState<KanbanColumn>('todo');

  // Strażnik: po przeciągnięciu @dnd-kit potrafi odpalić click → blokujemy otwarcie modala edycji.
  const draggingRef = useRef(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
  );

  const load = async () => {
    try {
      setLoading(true);
      const [t, c] = await Promise.all([getKanbanTasks(), getClients()]);
      setTasks(t);
      setClients(c);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Błąd pobierania zadań');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const byColumn = useMemo(() => {
    const map: Record<KanbanColumn, KanbanTask[]> = { todo: [], doing: [], done: [] };
    for (const t of tasks) map[t.column]?.push(t);
    for (const k of Object.keys(map) as KanbanColumn[]) map[k].sort((a, b) => a.order - b.order);
    return map;
  }, [tasks]);

  const findColumn = (id: string): KanbanColumn | null => {
    if (id === 'todo' || id === 'doing' || id === 'done') return id;
    return tasks.find(t => t.id === id)?.column ?? null;
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) return;
    const activeId = String(active.id);
    const overId = String(over.id);
    const targetColumn = findColumn(overId);
    if (!targetColumn) return;

    const moved = tasks.find(t => t.id === activeId);
    if (!moved) return;

    // Karty w kolumnie docelowej (bez przeciąganej), wg order
    const targetItems = tasks
      .filter(t => t.column === targetColumn && t.id !== activeId)
      .sort((a, b) => a.order - b.order);

    // Pozycja wstawienia: przed kartą "over", albo na koniec gdy upuszczono na kolumnę
    const idx = targetItems.findIndex(t => t.id === overId);
    const prev = idx === -1 ? targetItems[targetItems.length - 1] : targetItems[idx - 1];
    const next = idx === -1 ? undefined : targetItems[idx];

    let newOrder: number;
    if (!prev && !next) newOrder = 0;
    else if (!prev) newOrder = next!.order - 1;
    else if (!next) newOrder = prev.order + 1;
    else newOrder = (prev.order + next.order) / 2;

    if (moved.column === targetColumn && moved.order === newOrder) return;

    // Optymistyczna aktualizacja
    setTasks(prevTasks => prevTasks.map(t =>
      t.id === activeId ? { ...t, column: targetColumn, order: newOrder } : t
    ));

    try {
      await moveKanbanTask(activeId, targetColumn, newOrder);
    } catch (err) {
      alert('Nie udało się przenieść zadania — odświeżam.');
      load();
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Usunąć to zadanie?')) return;
    setTasks(prev => prev.filter(t => t.id !== id));
    try {
      await deleteKanbanTask(id);
    } catch {
      alert('Nie udało się usunąć zadania — odświeżam.');
      load();
    }
  };

  const openAdd = (col: KanbanColumn) => { setEditTask(null); setAddColumn(col); setModalOpen(true); };
  const openEdit = (t: KanbanTask) => {
    // Pomiń klik wygenerowany tuż po przeciągnięciu karty
    if (draggingRef.current) { draggingRef.current = false; return; }
    setEditTask(t);
    setModalOpen(true);
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        <div>
          <h1 className="page-title">Tablica zadań (Kanban)</h1>
          <p className="text-body-sm font-light mt-2">Przeciągaj karty między kolumnami, aby zmieniać status.</p>
        </div>
        <button type="button" onClick={() => openAdd('todo')} className="btn-primary">
          ＋ Nowe zadanie
        </button>
      </div>

      {loading ? (
        <div className="text-center py-12 text-ink font-light">Ładowanie tablicy...</div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={() => { draggingRef.current = true; }}
          onDragEnd={handleDragEnd}
        >
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {COLUMNS.map(col => (
              <Column
                key={col.id}
                column={col}
                tasks={byColumn[col.id]}
                onEdit={openEdit}
                onDelete={handleDelete}
                onAdd={openAdd}
              />
            ))}
          </div>
        </DndContext>
      )}

      {modalOpen && (
        <KanbanModal
          task={editTask}
          defaultColumn={addColumn}
          clients={clients}
          onClose={() => setModalOpen(false)}
          onSaved={load}
        />
      )}
    </div>
  );
}
