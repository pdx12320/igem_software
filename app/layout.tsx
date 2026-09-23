import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = { title: 'ORCA · SUSTech | Programmable RNA editing', description: 'A research workbench for programmable PUF design, RNA sequence screening and transparent LAMAR evidence.', icons: {icon:'/favicon.svg'} };
export default function RootLayout({children}:{children:React.ReactNode}) {return <html lang="en"><body>{children}</body></html>;}
