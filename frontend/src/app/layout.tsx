import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PowerPoint Builder",
  description: "AI-powered presentation generator",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-gray-50 min-h-screen">
        <header className="bg-white border-b">
          <div className="max-w-4xl mx-auto px-4 py-4">
            <h1 className="text-xl font-bold text-gray-900">PowerPoint Builder</h1>
          </div>
        </header>
        <main className="max-w-4xl mx-auto px-4 py-8">
          {children}
        </main>
      </body>
    </html>
  );
}
