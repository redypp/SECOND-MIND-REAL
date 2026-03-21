import { Search } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export function SearchBar() {
  const navigate = useNavigate();

  return (
    <button
      onClick={() => navigate('/search')}
      className="w-full flex items-center gap-3 bg-search-bg rounded-xl px-4 py-3 text-left transition-colors hover:bg-muted"
    >
      <Search className="w-4 h-4 text-muted-foreground" />
      <span className="text-muted-foreground text-sm">
        Search your mind...
      </span>
    </button>
  );
}
