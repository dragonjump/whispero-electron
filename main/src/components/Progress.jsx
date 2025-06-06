function formatBytes(size) {
  const i = size == 0 ? 0 : Math.floor(Math.log(size) / Math.log(1024));
  return (
    +(size / Math.pow(1024, i)).toFixed(2) * 1 +
    ["B", "kB", "MB", "GB", "TB"][i]
  );
}

export default function Progress({ text, percentage, total }) {
  percentage ??= 0;
  return (
    <div className="w-full bg-gray-800/50 dark:bg-gray-900/30 text-left rounded-lg overflow-hidden mb-0.5">
      <div
        className="bg-emerald-500/70 whitespace-nowrap px-1 text-xs text-white/90"
        style={{ width: `${percentage}%` }}
      >
        {text} ({percentage.toFixed(2)}%
        {isNaN(total) ? "" : ` of ${formatBytes(total)}`})
      </div>
    </div>
  );
}
