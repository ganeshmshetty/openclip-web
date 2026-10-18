import { permanentRedirect } from 'next/navigation';

export default function DevelopersPage() {
  permanentRedirect('/docs/manifest-spec');
}