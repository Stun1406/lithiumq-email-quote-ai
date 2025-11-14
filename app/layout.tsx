import "./globals.css";
import { ReactNode } from "react";

export const metadata = {
  title: "LithiumQ Email Quote AI",
  description: "Automated logistics quoting system",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="h-screen flex bg-white text-sm text-gray-900">
        {/* Sidebar */}
        <aside className="w-64 border-r bg-gray-50 flex flex-col">
          <div className="px-4 py-6 border-b">
            <h1 className="font-bold text-xl">LithiumQ</h1>
            <p className="text-xs text-gray-500">Email Quote AI</p>
          </div>

          <nav className="flex-1 px-2 py-4 space-y-1">
            <a href="/" className="block px-3 py-2 rounded hover:bg-gray-200">
               Inbox
            </a>
            <a href="/ai" className="block px-3 py-2 rounded hover:bg-gray-200">
               AI Breakdown
            </a>
            <a href="/logs" className="block px-3 py-2 rounded hover:bg-gray-200">
               Logs
            </a>
            <a href="/quotes" className="block px-3 py-2 rounded hover:bg-gray-200">
               Quotes
            </a>
          </nav>

          <div className="px-4 py-4 border-t text-xs text-gray-500">
            LithiumQ © {new Date().getFullYear()}
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 overflow-hidden">{children}</main>
      </body>
    </html>
  );
}
