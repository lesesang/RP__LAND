import type { Metadata } from 'next';
import './globals.css';
export const metadata:Metadata={title:'RP LAND · 함께 이어 쓰는 이야기',description:'우리의 이야기가 이어지는 곳. 스레드, 위키, 연습장을 함께 만들어 가세요.',icons:{icon:'/favicon.svg'}};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="ko"><body>{children}</body></html>}
