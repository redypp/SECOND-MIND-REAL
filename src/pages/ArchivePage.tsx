import CollectionsPage from './CollectionsPage';

interface ArchivePageProps {
  embedded?: boolean;
  onNavigateToSpace?: (spaceId: string) => void;
}

export default function ArchivePage({ embedded = false, onNavigateToSpace }: ArchivePageProps) {
  return <CollectionsPage embedded={embedded} onNavigateToSpace={onNavigateToSpace} />;
}
