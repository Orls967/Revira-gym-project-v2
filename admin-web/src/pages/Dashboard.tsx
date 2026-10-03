import PageHeader from '../components/common/PageHeader';

export default function Dashboard() {
  return (
    <div>
      <PageHeader title="Dashboard" />
      <div className="p-8 bg-white rounded-lg shadow-sm border border-gray-200 text-center text-gray-500">
        Modul ini sedang dikembangkan
      </div>
    </div>
  );
}