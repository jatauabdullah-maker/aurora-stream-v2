import { BrowserRouter, Routes, Route } from 'react-router-dom'
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

export default function App() {
  return (
    <AppProvider>
      <BrowserRouter>
        <div className="min-h-screen flex flex-col">
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
                <Route path="*" element={<PageWrapper><Home /></PageWrapper>} />
              </Routes>
            </AnimatePresence>
          </main>
          <Footer />
          <MobileNav />
          <InstallPrompt />
          <Toaster
            position="bottom-center"
            toastOptions={{
              style: { background: '#1a2038', color: '#fff', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '12px', fontSize: '14px' },
            }}
          />
        </div>
      </BrowserRouter>
    </AppProvider>
  )
}
