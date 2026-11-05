import type { ReactNode } from 'react';
import './globals.css';

export const metadata = {
  title: 'ՍՈՒՐՈ ՇԻՆԱՆՅՈՒԹ | B2C & B2B Hardware & Construction Platform',
  description:
    'Professional Hardware, Fasteners, Power Tools & Construction Supplies (ShinShin.am × Bunnings.com.au Architecture).',
};

export default function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <html lang="hy" className="scroll-smooth">
      <body className="min-h-screen flex flex-col bg-[#F4F5F7] text-slate-900 antialiased">
        {children}
      </body>
    </html>
  );
}
