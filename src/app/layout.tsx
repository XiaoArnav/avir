import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Avir — Urban Air Quality & Winter Smog Assistant',
  description:
    'Avir is a mathematically grounded GenAI assistant empowering families and communities to navigate severe winter smog, thermal inversions, and hazardous particulate pollution with multi-source atmospheric consensus.',
  authors: [{ name: 'XiaoArnav', url: 'https://github.com/XiaoArnav' }],
  icons: {
    icon: '/favicon.svg',
    apple: '/logo.svg',
  },
  keywords: [
    'Avir',
    'Urban Air Quality',
    'Winter Smog',
    'Thermal Inversion',
    'PM2.5',
    'AQI',
    'Multi-Source AQI',
    'Atmospheric Consensus',
    'Corsi-Rosenthal Box',
    'Routine Shifter',
    'GenAI Assistant',
    'PromptWars',
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body className="antialiased min-h-screen flex flex-col transition-colors duration-200">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-emerald-500 focus:text-black focus:font-semibold focus:rounded-md shadow-lg"
        >
          Skip to main content
        </a>
        {children}
      </body>
    </html>
  );
}
