"use client";

import React from "react";
import {
  Search,
  Heart,
  ShoppingBag,
  User,
  MessageCircle,
  Home,
  LayoutGrid,
  Share2,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Check,
  X,
  Star,
  Truck,
  ShieldCheck,
  Clock,
  RefreshCw,
  Plus,
  Minus,
  Sparkles,
  SlidersHorizontal,
  ArrowUpDown,
  Send,
  Paperclip,
  Trash2,
  Edit3,
  ExternalLink,
  Copy,
  Info,
  AlertCircle,
  Phone,
  Settings,
  Package,
  Wallet,
  Gift,
  Eye,
  EyeOff,
  Bell,
  CheckCircle2,
  LucideIcon,
} from "lucide-react";
import { videoPreWarmer } from "@/lib/videoPreWarmer";

export const ICON_REGISTRY = {
  search: Search,
  heart: Heart,
  cart: ShoppingBag,
  bag: ShoppingBag,
  user: User,
  profile: User,
  message: MessageCircle,
  chat: MessageCircle,
  home: Home,
  catalog: LayoutGrid,
  grid: LayoutGrid,
  share: Share2,
  "chevron-left": ChevronLeft,
  "chevron-right": ChevronRight,
  "chevron-down": ChevronDown,
  "chevron-up": ChevronUp,
  back: ChevronLeft,
  check: Check,
  close: X,
  x: X,
  star: Star,
  truck: Truck,
  shield: ShieldCheck,
  clock: Clock,
  refresh: RefreshCw,
  plus: Plus,
  minus: Minus,
  sparkles: Sparkles,
  sort: ArrowUpDown,
  filter: SlidersHorizontal,
  send: Send,
  attach: Paperclip,
  trash: Trash2,
  edit: Edit3,
  external: ExternalLink,
  copy: Copy,
  info: Info,
  alert: AlertCircle,
  phone: Phone,
  settings: Settings,
  orders: Package,
  wallet: Wallet,
  gift: Gift,
  eye: Eye,
  "eye-off": EyeOff,
  bell: Bell,
  "check-circle": CheckCircle2,
} as const;

export type VelariIconName = keyof typeof ICON_REGISTRY;

export type VelariIconSize = "sm" | "md" | "lg" | "xl" | number;

interface VelariIconProps extends React.SVGProps<SVGSVGElement> {
  name: VelariIconName;
  size?: VelariIconSize;
  strokeWidth?: number;
  color?: string;
  className?: string;
  fill?: string;
}

const SIZE_MAP: Record<"sm" | "md" | "lg" | "xl", number> = {
  sm: 18,
  md: 20,
  lg: 24,
  xl: 28,
};

export function VelariIcon({
  name,
  size = "md",
  strokeWidth = 1.9,
  color = "currentColor",
  className = "",
  fill = "none",
  ...props
}: VelariIconProps) {
  const IconComponent: LucideIcon = ICON_REGISTRY[name] || HelpCircleFallback;
  const pixelSize = typeof size === "number" ? size : SIZE_MAP[size] || 20;

  return (
    <IconComponent
      size={pixelSize}
      strokeWidth={strokeWidth}
      color={color}
      fill={fill}
      className={`shrink-0 ${className}`}
      {...props}
    />
  );
}

function HelpCircleFallback(props: any) {
  return <Info {...props} />;
}

interface VelariIconButtonProps {
  name: VelariIconName;
  "aria-label": string;
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  size?: VelariIconSize;
  variant?: "glass" | "solid" | "ghost" | "tinted";
  active?: boolean;
  disabled?: boolean;
  className?: string;
  badge?: number | string;
  color?: string;
  haptic?: "light" | "selection" | "medium";
}

export function VelariIconButton({
  name,
  "aria-label": ariaLabel,
  onClick,
  size = "md",
  variant = "glass",
  active = false,
  disabled = false,
  className = "",
  badge,
  color,
  haptic = "selection",
}: VelariIconButtonProps) {
  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (disabled) return;
    videoPreWarmer.triggerHaptic(haptic);
    onClick?.(e);
  };

  const getVariantStyles = () => {
    switch (variant) {
      case "glass":
        return "glass-icon-button bg-white/70 backdrop-blur-xl border border-white/80 shadow-sm text-[#111612] hover:bg-white/90";
      case "tinted":
        return "min-w-[44px] min-height-[44px] h-11 w-11 inline-flex items-center justify-center rounded-full bg-[#EAF3EC] text-[#2D6E3E] border border-[#2D6E3E]/15 hover:bg-[#EAF3EC]/80";
      case "solid":
        return "min-w-[44px] min-height-[44px] h-11 w-11 inline-flex items-center justify-center rounded-full bg-[#2D6E3E] text-white shadow-md shadow-[#2D6E3E]/20 hover:bg-[#235831]";
      case "ghost":
      default:
        return "min-w-[44px] min-height-[44px] h-11 w-11 inline-flex items-center justify-center rounded-full text-[#111612] hover:bg-black/5";
    }
  };

  return (
    <button
      type="button"
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={handleClick}
      className={`relative select-none ios-icon-tap disabled:opacity-40 disabled:pointer-events-none ${getVariantStyles()} ${
        active ? "text-[#2D6E3E]" : ""
      } ${className}`}
      style={{ minWidth: 44, minHeight: 44 }}
    >
      <VelariIcon
        name={name}
        size={size}
        color={color}
        fill={active && name === "heart" ? "#FF3B30" : "none"}
      />
      {badge !== undefined && badge !== 0 && (
        <span
          className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-[#2D6E3E] text-white text-[10px] font-bold flex items-center justify-center border-2 border-white shadow-sm pointer-events-none"
        >
          {badge}
        </span>
      )}
    </button>
  );
}

export default VelariIcon;
