"use client";
import { useState, ElementType, ReactNode, MouseEvent } from "react";

const EASE = "cubic-bezier(0.22, 1, 0.36, 1)";

interface TapProps {
  onClick?: (e: MouseEvent<HTMLElement>) => void;
  children: ReactNode;
  scale?: number;
  style?: React.CSSProperties;
  as?: ElementType;
  className?: string;
  [key: string]: unknown;
}

export default function Tap({
  onClick,
  children,
  scale = 0.96,
  style = {},
  as: As = "button",
  className = "",
  ...rest
}: TapProps) {
  const [pressed, setPressed] = useState(false);
  return (
    <As
      onPointerDown={() => setPressed(true)}
      onPointerUp={() => setPressed(false)}
      onPointerLeave={() => setPressed(false)}
      onPointerCancel={() => setPressed(false)}
      onClick={onClick}
      className={className}
      style={{
        transform: pressed ? `scale(${scale})` : "scale(1)",
        transition: `transform 200ms ${EASE}`,
        cursor: "pointer",
        border: "none",
        background: "transparent",
        padding: 0,
        WebkitTapHighlightColor: "transparent",
        ...style,
      }}
      {...rest}
    >
      {children}
    </As>
  );
}
