import { useNavigate } from 'react-router-dom';
import { ChamberModal } from '@/components/ChamberModal';

export default function ChamberPage() {
  const navigate = useNavigate();

  return (
    <ChamberModal isOpen={true} onClose={() => navigate(-1)} />
  );
}
