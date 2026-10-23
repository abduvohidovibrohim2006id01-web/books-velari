interface SkeletonProps {
  w?: string | number;
  h?: string | number;
  r?: number;
  className?: string;
}

export default function Skeleton({ w = "100%", h = 12, r = 6, className = "" }: SkeletonProps) {
  return (
    <div
      className={className}
      style={{
        width: w,
        height: h,
        borderRadius: r,
        background: "linear-gradient(90deg, #F0F0EC 0%, #FAFAF6 50%, #F0F0EC 100%)",
        backgroundSize: "200% 100%",
        animation: "velari-shimmer 1.6s infinite",
      }}
    />
  );
}
