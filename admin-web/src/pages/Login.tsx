import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';
import { setAuth } from '../lib/auth';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault(); 
    
    setError('');
    setIsLoading(true);

    try {
      const response = await api.post('/login', {
        email,
        password,
        device_name: 'admin-web',
      });

      const { token, user } = response.data.data;

      if (user.role !== 'admin') {
        setError('Akses ditolak: Akun ini bukan akun admin.');
        return;
      }

      setAuth(token, user);
      navigate('/');
    } catch (err: any) {
      setError(
        err.response?.data?.message || 'Email atau password salah. Gagal terhubung ke server.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    // bg-zinc-950 setara dengan --color-bg-base (#09090b)
    <div className="min-h-screen flex items-center justify-center bg-zinc-950 py-12 px-4 sm:px-6 lg:px-8">
      {/* bg-zinc-900 setara dengan --color-surface (#18181b) */}
      <div className="max-w-md w-full bg-zinc-900 p-8 rounded-xl shadow-lg border border-zinc-800 space-y-8">
        <div className="text-center">
          <h2 className="text-3xl font-bold text-white">Revira Gym Admin</h2>
          <p className="mt-2 text-sm text-zinc-400">Silakan masuk ke akun Anda</p>
        </div>

        {error && (
          // Warna error menyesuaikan tema gelap
          <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-3 rounded-md text-sm text-center">
            {error}
          </div>
        )}

        <form className="space-y-6" onSubmit={handleLogin}>
          <div>
            <label className="block text-sm font-medium text-zinc-300">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              // Input field gelap dengan focus ring warna amber
              className="mt-1 block w-full px-3 py-2 bg-zinc-950 border border-zinc-700 rounded-md shadow-sm text-white focus:outline-none focus:ring-amber-400 focus:border-amber-400"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-300">Password</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 block w-full px-3 py-2 bg-zinc-950 border border-zinc-700 rounded-md shadow-sm text-white focus:outline-none focus:ring-amber-400 focus:border-amber-400"
            />
          </div>

          <button
            type="submit"
            disabled={isLoading}
            // bg-amber-400 setara dengan --color-primary (#fbbf24)
            className={`w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-bold transition-colors ${
              isLoading 
                ? 'bg-amber-600 text-zinc-900 cursor-not-allowed' 
                : 'bg-amber-400 text-zinc-950 hover:bg-amber-500'
            }`}
          >
            {isLoading ? 'Memproses...' : 'Masuk'}
          </button>
        </form>
      </div>
    </div>
  );
}