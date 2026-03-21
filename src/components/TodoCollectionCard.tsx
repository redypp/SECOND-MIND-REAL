import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { CheckSquare } from 'lucide-react';

interface TodoCollectionCardProps {
  todoCount: number;
  eventCount: number;
  variant?: 'default' | 'compact';
}

export function TodoCollectionCard({ todoCount, eventCount, variant = 'default' }: TodoCollectionCardProps) {
  const navigate = useNavigate();
  const totalCount = todoCount + eventCount;

  const handleClick = () => {
    navigate('/todos');
  };

  if (variant === 'compact') {
    return (
      <motion.button
        onClick={handleClick}
        whileHover={{ scale: 1.01 }}
        whileTap={{ scale: 0.99 }}
        className="w-full flex items-center gap-3 p-3 bg-card shadow-card hover:shadow-elevated transition-all text-left"
      >
        <div 
          className="w-12 h-12 flex items-center justify-center shrink-0 bg-primary/10"
        >
          <CheckSquare className="w-5 h-5 text-primary" />
        </div>
        
        <div className="flex-1 min-w-0">
          <h3 className="text-[15px] font-medium text-foreground truncate">
            To Do
          </h3>
          <p className="text-[13px] text-muted-foreground">
            {totalCount} {totalCount === 1 ? 'item' : 'items'}
          </p>
        </div>
      </motion.button>
    );
  }

  return (
    <motion.button
      onClick={handleClick}
      whileHover={{ y: -3, scale: 1.01 }}
      whileTap={{ scale: 0.98 }}
      className="w-full bg-card shadow-card hover:shadow-elevated transition-all text-left group overflow-hidden"
    >
      {/* Cover */}
      <div 
        className="w-full aspect-[5/4] flex items-center justify-center overflow-hidden relative bg-primary/10"
      >
        <div className="flex flex-col items-center gap-2">
          <div className="w-16 h-16 flex items-center justify-center bg-primary/20">
            <CheckSquare className="w-8 h-8 text-primary" />
          </div>
        </div>
      </div>
      
      {/* Info */}
      <div className="p-4">
        <h3 className="text-base font-semibold text-foreground truncate">
          To Do
        </h3>
        <p className="text-sm text-muted-foreground mt-0.5">
          {totalCount} {totalCount === 1 ? 'item' : 'items'}
        </p>
      </div>
    </motion.button>
  );
}
