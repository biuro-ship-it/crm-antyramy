type ActiveTab = 'clients' | 'calendar' | 'kanban' | 'products' | 'promotions' | 'email-templates' | 'notes' | 'suppliers' | 'archive' | 'admin';

interface MobileNavProps {
  activeTab: ActiveTab;
  onTabChange: (tab: ActiveTab) => void;
}

const BOTTOM_TABS: { id: ActiveTab; icon: string; label: string }[] = [
  { id: 'clients',  icon: '👥', label: 'Klienci' },
  { id: 'calendar', icon: '📅', label: 'Kalendarz' },
  { id: 'kanban',   icon: '📋', label: 'Kanban' },
  { id: 'notes',    icon: '📝', label: 'Notatki' },
];

export default function MobileNav({ activeTab, onTabChange }: MobileNavProps) {
  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-30 bg-canvas border-t border-hairline
                    flex items-stretch h-16">
      {BOTTOM_TABS.map(tab => {
        const active = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={`flex-1 flex flex-col items-center justify-center gap-0.5 transition-colors
                        ${active ? 'text-primary' : 'text-ink opacity-50'}`}
          >
            <span className="text-xl leading-none">{tab.icon}</span>
            <span className={`text-[10px] font-semibold ${active ? 'opacity-100' : ''}`}>
              {tab.label}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
