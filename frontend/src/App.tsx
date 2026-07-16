import { Route, Routes } from 'react-router-dom';
import Footer from './components/Footer';
import Header from './components/Header';
import { DEMO_MODE } from './lib/api';
import HomePage from './pages/HomePage';
import SubmitPage from './pages/SubmitPage';

export default function App() {
  return (
    <div className="mx-auto flex min-h-screen max-w-[1440px] flex-col bg-white shadow-sm">
      {DEMO_MODE && (
        <div className="bg-ink px-4 py-1.5 text-center text-xs font-semibold text-white/90">
          Demó mód — beépített mintaadatokkal fut, Supabase nincs bekötve (.env)
        </div>
      )}
      <Header />
      <div className="flex-1">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/bekuldes" element={<SubmitPage />} />
        </Routes>
      </div>
      <Footer />
    </div>
  );
}
