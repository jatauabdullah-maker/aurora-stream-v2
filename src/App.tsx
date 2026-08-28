import { BrowserRouter, Routes, Route, useLocation, Link } from 'react-router-dom'
import { AnimatePresence } from 'framer-motion'
import { Toaster } from 'react-hot-toast'
import { AppProvider } from './context/AppContext'
import Header from './components/layout/Header'
import MobileNav from './components/layout/MobileNav'
import Footer from './components/layout/Footer'
import InstallPrompt from './components/common/InstallPrompt'
import PageWrapper from './components/common/PageWrapper'
import Home from './pages/Home'
import Search from './pages/Search'
import AnimeDetails from './pages/AnimeDetails'
import Watch from './pages/Watch'
import Downloads from './pages/Downloads'
import Library from './pages/Library'
import Settings from './pages/Settings'
import { IconInfo } from './components/common/Icons'

function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
      <IconInfo width={56} height={56} className="text-brand mb-6 opacity-60" />
      <h1 className="text-4xl font-extrabold text-gradient mb-3">404</h1>
      <p className="text-muted text-lg mb-6">This page doesn't exist yet.</p>
      <Link
        to="/"
        className="bg-gradient-to-r from-brand2 to-brand px-6 py-3 rounded-xl font-bold shadow-lg shadow-brand2/30 hover:scale-[1.03] transition-transform"
      >
        Back to Home
      </Link>
    </div>
  )
}

function AppContent() {
  const location = useLocation()
  const isWatchPage = location.pathname.startsWith('/watch/')

  return (
    <>
      {/* Aurora animated background — sits behind all content */}
      <div className="aurora-bg" aria-hidden="true">
        <div className="blob blob-1" />
        <div className="blob blob-2" />
        <div className="blob blob-3" />
      </div>
      <div className="wind-streaks" aria-hidden="true">
        <div className="streak streak-1" />
        <div className="streak streak-2" />
        <div className="streak streak-3" />
        <div className="streak streak-4" />
        <div className="streak streak-5" />
      </div>

      <div className="min-h-screen flex flex-col relative z-10">
        <Header />
      <main className="flex-1 pb-20 md:pb-0">
          <AnimatePresence mode="wait">
            <Routes>
              <Route path="/" element={<PageWrapper><Home /></PageWrapper>} />
              <Route path="/search" element={<PageWrapper><Search /></PageWrapper>} />
              <Route path="/anime/:id" element={<PageWrapper><AnimeDetails /></PageWrapper>} />
              <Route path="/watch/:id/:episodeId" element={<PageWrapper><Watch /></PageWrapper>} />
              <Route path="/downloads" element={<PageWrapper><Downloads /></PageWrapper>} />
              <Route path="/library" element={<PageWrapper><Library /></PageWrapper>} />
              <Route path="/settings" element={<PageWrapper><Settings /></PageWrapper>} />
              <Route path="*" element={<PageWrapper><NotFound /></PageWrapper>} />
            </Routes>
          </AnimatePresence>
        </main>
        {!isWatchPage && <Footer />}
        <MobileNav />
        <InstallPrompt />
        <Toaster
          position="bottom-center"
          toastOptions={{
            style: {
              background: 'rgba(16, 20, 38, 0.85)',
              color: '#fff',
              border: '1px solid rgba(107, 70, 255, 0.2)',
              borderRadius: '16px',
              fontSize: '14px',
              backdropFilter: 'blur(12px)',
              boxShadow: '0 8px 32px rgba(107, 70, 255, 0.15), inset 0 1px 0 rgba(255,255,255,0.05)',
            },
          }}
        />
      </div>
    </>
  )
}

export default function App() {
  return (
    <AppProvider>
      <BrowserRouter>
        <AppContent />
      </BrowserRouter>
    </AppProvider>
  )
}
