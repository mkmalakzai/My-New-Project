import type {Metadata} from "next";
import Script from "next/script";
import "./globals.css";
export const metadata:Metadata={title:"AFGlion",description:"AFGlion Telegram Mini App",robots:{index:false,follow:false}};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}<Script src="https://telegram.org/js/telegram-web-app.js" strategy="beforeInteractive"/></body></html>}
