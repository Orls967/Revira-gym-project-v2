interface EmptyStateProps {
  message: string;
}

export default function EmptyState({ message }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center p-12 bg-white rounded-lg border border-dashed border-gray-300">
      <div className="text-gray-400 mb-2">📁</div>
      <p className="text-gray-500 text-sm">{message}</p>
    </div>
  );
}