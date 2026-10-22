import './globals.css';
import { Bricolage_Grotesque } from 'next/font/google';
const f = Bricolage_Grotesque({ subsets: ['latin'] });
export const metadata = { title: 'TechPulse' };
export default function L({ children }) { return <html lang="en"><body className={f.className}>{children}</body></html>; }
