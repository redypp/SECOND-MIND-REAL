import CollectionsPage from './CollectionsPage';

interface ArchivePageProps {
  embedded?: boolean;
}

export default function ArchivePage({ embedded = false }: ArchivePageProps) {
  // ARCHIVE is simply the Collections surface — all logic unchanged
  return <CollectionsPage embedded={embedded} />;
}
