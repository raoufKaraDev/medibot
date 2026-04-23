export const Badge = ({ text, color = 'gray' }: { text: string; color?: string }) => {
  const map: Record<string, string> = {
    red: 'bg-red-100 text-red-700 border-red-200',
    green: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    blue: 'bg-blue-100 text-blue-700 border-blue-200',
    gray: 'bg-gray-100 text-gray-600 border-gray-200',
    teal: 'bg-teal-100 text-teal-700 border-teal-200',
    amber: 'bg-amber-100 text-amber-700 border-amber-200',
  };
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${map[color] || map.gray}`}>{text}</span>
  );
};
