import { useLocation, useNavigate } from 'react-router-dom';
import { Clock, CheckCircle2, LayoutGrid, Target, BookOpen, FlaskConical } from 'lucide-react';
import { motion } from 'framer-motion';

interface NavItem {
  path: string;
  icon: React.ReactNode;
  label: string;
}

const navItems: NavItem[] = [
  { path: '/', icon: <Clock className="w-5 h-5" />, label: 'Clock' },
  { path: '/todos', icon: <CheckCircle2 className="w-5 h-5" />, label: 'To-Do' },
  { path: '/habits', icon: <Target className="w-5 h-5" />, label: 'Habits' },
  { path: '/collections', icon: <LayoutGrid className="w-5 h-5" />, label: 'Archives' },
  { path: '/journal', icon: <BookOpen className="w-5 h-5" />, label: 'Journal' },
  { path: '/ask', icon: <FlaskConical className="w-5 h-5" />, label: 'Ask' },
];

export function BottomNavigation() {
  const location = useLocation();
  const navigate = useNavigate();

  // Determine active path - handle nested routes for collections
  const getActivePath = () => {
    if (location.pathname.startsWith('/space/')) return '/collections';
    return location.pathname;
  };

  const activePath = getActivePath();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-background/95 backdrop-blur-md border-t border-border safe-area-bottom">
      <div className="flex items-center justify-around h-14 max-w-lg mx-auto px-4 pb-1">
        {navItems.map((item) => {
          const isActive = activePath === item.path;
          
          return (
            <motion.button
              key={item.path}
              whileTap={{ scale: 0.9 }}
              onClick={() => navigate(item.path)}
              className={`flex flex-col items-center justify-center gap-1 px-6 py-2 rounded-xl transition-colors touch-manipulation ${
                isActive
                  ? 'text-primary'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              aria-label={item.label}
            >
              <div className="relative">
                {item.icon}
                {isActive && (
                  <motion.div
                    layoutId="nav-indicator"
                    className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 bg-primary rounded-full"
                    transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                  />
                )}
              </div>
              <span className={`text-[10px] font-medium ${isActive ? 'text-primary' : ''}`}>
                {item.label}
              </span>
            </motion.button>
          );
        })}
      </div>
    </nav>
  );
}
