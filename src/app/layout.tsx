import type { Metadata } from 'next';
import localFont from 'next/font/local';
import 'primereact/resources/themes/lara-light-amber/theme.css';
import 'primereact/resources/primereact.min.css';
import 'primeicons/primeicons.css';
import './globals.css';

const poppins = localFont({
  src: [
    { path: '../../fonts/Poppins-Regular.ttf', weight: '400', style: 'normal' },
    { path: '../../fonts/Poppins-SemiBold.ttf', weight: '600', style: 'normal' },
    { path: '../../fonts/Poppins-Bold.ttf', weight: '700', style: 'normal' }
  ],
  display: 'swap',
  variable: '--font-poppins'
});

export const metadata: Metadata = {
  title: 'LYNX._PLUS',
  description: 'Multi-language, multi-category news publishing dashboard.'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={poppins.variable}>
      <body>{children}</body>
    </html>
  );
}
