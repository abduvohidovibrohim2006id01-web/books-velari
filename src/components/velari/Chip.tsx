"use client";
import { ReactNode } from "react";
import Tap from "./Tap";
import { videoPreWarmer } from "@/lib/videoPreWarmer";

interface ChipProps {
  active?: boolean;
  children: ReactNode;
  onClick?: () => void;
  style?: React.CSSProperties;
  className?: string;
  count?: number;
}

export default function Chip({ active, children, onClick, style = {}, className = "", count }: ChipProps) {
  const handleClick = () => {
    videoPreWarmer.triggerHaptic("selection");
    onClick?.();
  };

  return (
    <Tap
      onClick={handleClick}
      className={className}
      style={{
        height: 38,
        padding: "0 16px",
        borderRadius: 19,
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        background: active
          ? "linear-gradient(135deg, #2D6E3E 0%, #1F5A30 100%)"
          : "rgba(255,255,255,0.78)",
        color: active ? "#fff" : "#111612",
        fontSize: 14,
        fontWeight: active ? 600 : 500,
        letterSpacing: -0.1,
        border: active ? "none" : "1px solid rgba(15,20,16,0.08)",
        boxShadow: active
          ? "0 4px 14px rgba(45,110,62,0.24)"
          : "0 2px 8px rgba(0,0,0,0.03)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        whiteSpace: "nowrap",
        ...style,
      }}
    >
      {children}
      {count !== undefined && (
        <span style={{
          fontSize: 11,
          color: active ? "rgba(255,255,255,0.8)" : "#737D75",
          fontWeight: 600,
        }}>
          {count}
        </span>
      )}
    </Tap>
  );
}

