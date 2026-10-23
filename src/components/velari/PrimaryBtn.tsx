"use client";
import { ReactNode } from "react";
import Tap from "./Tap";
import { videoPreWarmer } from "@/lib/videoPreWarmer";

interface PrimaryBtnProps {
  children: ReactNode;
  onClick?: () => void;
  full?: boolean;
  icon?: ReactNode;
  style?: React.CSSProperties;
  className?: string;
  variant?: "solid" | "prominent" | "tinted" | "glass" | "outline";
  size?: "sm" | "md" | "lg";
  disabled?: boolean;
  type?: "button" | "submit" | "reset";
}

const GREEN = "#2D6E3E";
const GREEN_DARK = "#1F5A30";

export default function PrimaryBtn({
  children,
  onClick,
  full = true,
  icon,
  style = {},
  className = "",
  variant = "solid",
  size = "md",
  disabled = false,
  type = "button",
}: PrimaryBtnProps) {
  const isSolid = variant === "solid" || variant === "prominent";
  const isTinted = variant === "tinted";
  const isGlass = variant === "glass";
  const isOutline = variant === "outline";

  const height = size === "sm" ? 44 : size === "lg" ? 56 : 50;
  const radius = size === "sm" ? 22 : size === "lg" ? 28 : 25;
  const fontSize = size === "sm" ? 14 : size === "lg" ? 17 : 15;

  let bg = GREEN;
  let color = "#fff";
  let border = "none";
  let shadow = "none";

  if (isSolid) {
    bg = disabled ? "#9AA29C" : `linear-gradient(135deg, ${GREEN} 0%, ${GREEN_DARK} 100%)`;
    color = "#fff";
    shadow = (!disabled) ? "0 8px 24px rgba(45,110,62,0.24), inset 0 1px 0 rgba(255,255,255,0.2)" : "none";
  } else if (isTinted) {
    bg = disabled ? "#F0F2F0" : "#EAF3EC";
    color = disabled ? "#9AA29C" : GREEN;
    border = "1px solid rgba(45,110,62,0.12)";
  } else if (isGlass) {
    bg = "rgba(255,255,255,0.72)";
    color = "#111612";
    border = "1px solid rgba(255,255,255,0.85)";
    shadow = "0 8px 24px rgba(0,0,0,0.06)";
  } else if (isOutline) {
    bg = "transparent";
    color = disabled ? "#9AA29C" : GREEN;
    border = `1.5px solid ${disabled ? "#9AA29C" : GREEN}`;
  }

  const handleClick = () => {
    if (disabled) return;
    videoPreWarmer.triggerHaptic("medium");
    onClick?.();
  };

  return (
    <Tap
      as="button"
      onClick={handleClick}
      className={className}
      style={{
        width: full ? "100%" : "auto",
        height,
        borderRadius: radius,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        background: bg,
        color,
        border,
        fontSize,
        fontWeight: 600,
        letterSpacing: -0.2,
        boxShadow: shadow,
        backdropFilter: isGlass ? "blur(20px)" : undefined,
        WebkitBackdropFilter: isGlass ? "blur(20px)" : undefined,
        opacity: disabled ? 0.65 : 1,
        cursor: disabled ? "not-allowed" : "pointer",
        ...style,
      }}
      {...({ type } as Record<string, unknown>)}
    >
      {icon}
      <span>{children}</span>
    </Tap>
  );
}
