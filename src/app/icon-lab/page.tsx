import type { Metadata } from 'next';
import IconLab from './IconLab';

export const metadata: Metadata = {
  title: 'Icon lab',
  robots: { index: false, follow: false },
};

export default function Page() {
  return <IconLab />;
}
