interface PageHeaderProps {
  title: string;
  children?: React.ReactNode;
}

export default function PageHeader({ title, children }: PageHeaderProps) {
  return (
    <div className="flex items-center justify-between pb-4 border-b border-gray-200 mb-6">
      <h1 className="text-2xl font-semibold text-gray-900">{title}</h1>
      <div>{children}</div>
    </div>
  );
}