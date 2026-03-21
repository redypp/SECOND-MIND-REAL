import { motion } from 'framer-motion';

export const PRESET_COLORS = [
  { name: 'Teal', value: '#14b8a6' },
  { name: 'Blue', value: '#3b82f6' },
  { name: 'Purple', value: '#8b5cf6' },
  { name: 'Pink', value: '#ec4899' },
  { name: 'Rose', value: '#f43f5e' },
  { name: 'Orange', value: '#f97316' },
  { name: 'Amber', value: '#f59e0b' },
  { name: 'Green', value: '#22c55e' },
];

interface ColorPickerProps {
  value?: string;
  onChange: (color: string) => void;
  size?: 'sm' | 'md';
}

export function ColorPicker({ value, onChange, size = 'md' }: ColorPickerProps) {
  const buttonSize = size === 'sm' ? 'w-6 h-6' : 'w-8 h-8';
  const ringSize = size === 'sm' ? 'ring-2 ring-offset-1' : 'ring-2 ring-offset-2';

  return (
    <div className="flex flex-wrap gap-2">
      {PRESET_COLORS.map((color) => (
        <motion.button
          key={color.value}
          type="button"
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => onChange(color.value)}
          className={`${buttonSize} rounded-full transition-all ${
            value === color.value 
              ? `${ringSize} ring-foreground ring-offset-background` 
              : 'hover:ring-2 hover:ring-muted-foreground/30 hover:ring-offset-2 hover:ring-offset-background'
          }`}
          style={{ backgroundColor: color.value }}
          title={color.name}
        />
      ))}
    </div>
  );
}
