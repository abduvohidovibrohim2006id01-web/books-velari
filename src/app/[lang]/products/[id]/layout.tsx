import { Suspense } from 'react';

type Props = {
  params: { id: string };
  children: React.ReactNode;
};

export default function ProductLayout({ children }: Props) {
  return <>{children}</>;
}
