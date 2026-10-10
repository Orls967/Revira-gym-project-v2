import { Link } from 'react-router-dom';

export default function NotFound() {
  return (
    <div className="min-h-[70vh] flex flex-col items-center justify-center text-center">
      <h1 className="text-6xl font-bold text-zinc-300 mb-4">404</h1>
      <h2 className="text-2xl font-semibold text-zinc-700 mb-2">Halaman Tidak Ditemukan</h2>
      <p className="text-zinc-500 mb-6">Maaf, URL yang Anda tuju tidak dikenali atau halaman telah dihapus.</p>
      <Link 
        to="/" 
        className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-zinc-950 font-medium rounded-md transition-colors"
      >
        Kembali ke Dashboard
      </Link>
    </div>
  );
}