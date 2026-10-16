import { useState, useEffect } from 'react';
import api from '../lib/api';

export function useFetch<T>(url: string) {
  const [data, setData] = useState<T | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setIsLoading(true);
        const response = await api.get(url);
        setData(response.data.data); // Menyesuaikan dengan standar Laravel API Anda
      } catch (err: any) {
        setError(err.response?.data?.message || 'Terjadi kesalahan saat memuat data');
      } finally {
        setIsLoading(false);
      }
    };

    if (url) fetchData();
  }, [url]);

  return { data, isLoading, error };
}