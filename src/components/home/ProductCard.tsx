"use client";

import { memo, useState, useRef, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { Heart, Star, Minus, Plus, Sparkles, Truck, Store, BookOpen } from "lucide-react";
import { useStore } from "@/store/store";
import { Product, CartItem } from "@/types";
import { TranslationKeys } from "@/lib/translations";
import { getProductSlug } from "@/lib/slugify";
import { makeVariantLoader, hasVariants, getOptimizedImageUrl, getMetaForUrl } from "@/lib/imageVariants";
import { getDeliveryCardText } from "@/lib/date-utils";
import { sanitizeVideoUrl } from "@/lib/video-url";
import { videoPreWarmer } from "@/lib/videoPreWarmer";

const GREEN = "#2D6E3E";
const EASE = "cubic-bezier(0.22, 1, 0.36, 1)";

const DEVICE_SIZES = [640, 750, 828, 1080, 1200];
function getCarouselW(): number {
    if (typeof window === "undefined") return 828;
    const physicalPx = Math.ceil(window.innerWidth * 0.85 * (window.devicePixelRatio || 1));
    return DEVICE_SIZES.find(s => s >= physicalPx) ?? 1200;
}
function nextImgUrl(src: string, w: number, q = 75) {
    return `/_next/image?url=${encodeURIComponent(src)}&w=${w}&q=${q}`;
}

const prefetchedSet = new Set<string>();
function prefetchFirstImage(item: Product) {
    if (typeof document === "undefined" || prefetchedSet.has(item.id)) return;
    prefetchedSet.add(item.id);
    const first = (item.images || []).find(u => u && !u.toLowerCase().endsWith(".mp4"));
    if (!first) return;

    const meta = item.image_metadata?.[first];
    const w = getCarouselW();
    let href: string;
    if (meta?.lg && meta?.md && meta?.xs) {
        href = w <= 640 ? meta.xs : w <= 828 ? meta.md : meta.lg;
    } else {
        href = nextImgUrl(first, w);
    }

    const link = document.createElement("link");
    link.rel = "prefetch";
    link.as = "image";
    link.href = href;
    (link as any).fetchPriority = "high";
    document.head.appendChild(link);
}

interface ProductCardProps {
  item: Product;
  language: "uz" | "ru";
  t: TranslationKeys;
  cart: CartItem[];
  wishlist: Product[];
  toggleWishlist: (product: Product) => void;
  addToCart: (product: Product) => void;
  updateQuantity: (id: string, qty: number) => void;
  removeFromCart: (id: string) => void;
  priority?: boolean;
  reason?: string;
  brandLabel?: string;
}

function WishBtn({ isWished, onClick, language }: { isWished: boolean; onClick: (e: React.MouseEvent) => void; language: "uz" | "ru" }) {
  const [pressed, setPressed] = useState(false);
  const ariaLabel = isWished
    ? (language === "uz" ? "Saralanganlardan o'chirish" : "Удалить из избранного")
    : (language === "uz" ? "Saralanganlarga qo'shish" : "Добавить в избранное");

  return (
    <button
      type="button"
      aria-label={ariaLabel}
      onPointerDown={() => {
        setPressed(true);
        videoPreWarmer.triggerHaptic(isWished ? "light" : "double");
      }}
      onPointerUp={() => setPressed(false)}
      onPointerLeave={() => setPressed(false)}
      onClick={onClick}
      style={{
        position: "absolute",
        top: 8,
        right: 8,
        width: 38,
        height: 38,
        borderRadius: 19,
        background: "rgba(255, 255, 255, 0.85)",
        backdropFilter: "blur(14px)",
        WebkitBackdropFilter: "blur(14px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        border: "1px solid rgba(255, 255, 255, 0.9)",
        boxShadow: "0 4px 12px rgba(0, 0, 0, 0.08)",
        cursor: "pointer",
        transform: pressed ? "scale(0.86)" : "scale(1)",
        transition: `transform 150ms ${EASE}`,
        WebkitTapHighlightColor: "transparent",
        zIndex: 3,
      }}
    >
      <Heart
        size={17}
        color={isWished ? "#EF4444" : "#111612"}
        fill={isWished ? "#EF4444" : "none"}
        strokeWidth={2}
      />
    </button>
  );
}

import { applyGlobalPromo } from "@/lib/promo-utils";

export const ProductCard = memo(({
  item: rawItem, language, t, cart, wishlist,
  toggleWishlist, addToCart, updateQuantity, removeFromCart,
  priority = false, reason, brandLabel,
}: ProductCardProps) => {
  const globalPromo = useStore(s => s.globalPromo);
  const item = applyGlobalPromo(rawItem, globalPromo);
  const imgWrapRef = useRef<HTMLDivElement>(null);
  const [imgLoaded, setImgLoaded] = useState(false);

  const isInCart = cart.find(ci => ci.id === item.id);
  const isWished = wishlist.some(w => w.id === item.id);
  const personalPct = useStore(s => s.personalOffers[item.id] || 0);
  const hasPersonal = personalPct > 0;
  const totalStock = item.stockDetails
    ? Object.values(item.stockDetails).reduce((a, b) => a + (Number(b) || 0), 0)
    : 0;

  // Mahsulot omborini (do'konini) aniqlab, yetkazish vaqtini hisoblaymiz
  const warehouses = useStore(s => s.warehouses);
  const selectedRegion = useStore(s => s.selectedRegion);
  const stockEntries = item.stockDetails ? Object.entries(item.stockDetails) : [];
  const whId = stockEntries.find(([, q]) => Number(q) > 0)?.[0] || stockEntries[0]?.[0];
  const warehouse = warehouses.find((w: any) => String(w.id) === String(whId)) || warehouses[0];
  // Yetkazish sanasi hozirgi vaqtga bog'liq — faqat brauzerda (mount'dan keyin) hisoblanadi.
  // Render paytida hisoblansa server HTML (ISR, boshqa vaqt/UTC) bilan farq qilib, hydration xatosi
  // (#425/#422) butun sahifani mijozda qayta chizdirardi.
  const [deliveryText, setDeliveryText] = useState<string | null>(null);
  const dbsConfig = warehouse?.dbs_config;
  useEffect(() => {
    if (!dbsConfig) {
      setDeliveryText(null);
      return;
    }
    setDeliveryText(getDeliveryCardText(language, dbsConfig, selectedRegion));
  }, [language, dbsConfig, selectedRegion]);

  const mainMedia = item.images?.[0] || item.image || "/placeholder.png";
  const isVideo = mainMedia.toLowerCase().endsWith(".mp4");

  const discount = (item.oldPrice && item.oldPrice > item.price)
    ? Math.round(((item.oldPrice - item.price) / item.oldPrice) * 100)
    : 0;

  const badge = discount > 0 ? `-${discount}%` : item.sales > 50 ? "HIT" : null;
  const badgeBg = badge === "HIT" ? "#0F1410" : "#FF3B30";

  const name = (language === "uz" ? item.name_uz : item.name_ru) || item.name;
  const brandName = brandLabel || "";

  const fmtPrice = (n: number) => {
    const s = n.toLocaleString("ru-RU");
    return s + (language === "ru" ? " сум" : " so'm");
  };

  return (
    <div 
      className="ios-tap-feedback active:scale-[0.98] transition-transform duration-150 ease-out select-none will-change-transform"
      style={{
        background: "#fff",
        borderRadius: 24,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        boxShadow: "0 4px 20px rgba(15,20,16,0.06)",
        border: "1px solid rgba(15,20,16,0.06)",
        WebkitTapHighlightColor: "transparent",
        transform: "translate3d(0,0,0)",
      }}>
      {/* Image area */}
      <Link
        href={`/${language}/products/${getProductSlug(item, language)}`}
        style={{ display: "flex", flexDirection: "column", flex: 1, textDecoration: "none", color: "inherit" }}
        prefetch={false}
        onPointerEnter={() => prefetchFirstImage(item)}
        onClick={() => {
          const query = useStore.getState().homeSearchQuery;
          if (query && query.trim().length >= 2) {
            fetch("/api/analytics/search-click", {
              method: "POST",
              body: JSON.stringify({ productId: item.id, query: query.trim() }),
            }).catch(() => null);
          }
        }}
      >
        <div style={{ position: "relative", width: "100%" }}>
          <div ref={imgWrapRef} style={{
            position: "relative",
            aspectRatio: "3 / 4",
            width: "100%",
            overflow: "hidden",
            background: "#F5F5F0",
          } as React.CSSProperties}>
            {isVideo ? (
              <video
                src={sanitizeVideoUrl(mainMedia)}
                style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
                autoPlay muted loop playsInline
              />
            ) : (
              <Image
                src={getOptimizedImageUrl(item.image_metadata, mainMedia, 'xs')}
                alt={name}
                fill
                sizes="(max-width: 639px) 50vw, (max-width: 1023px) 33vw, 25vw"
                className={`transition-opacity duration-300 ease-out ${imgLoaded ? "opacity-100" : "opacity-0"}`}
                onLoad={() => setImgLoaded(true)}
                style={{ objectFit: "cover" }}
                priority={priority}
                loader={hasVariants(item.image_metadata, mainMedia) ? makeVariantLoader(item.image_metadata) : undefined}
                placeholder={getMetaForUrl(item.image_metadata, mainMedia)?.blurDataURL ? "blur" : "empty"}
                blurDataURL={getMetaForUrl(item.image_metadata, mainMedia)?.blurDataURL}
              />
            )}

            {/* Badge */}
            {badge && (
              <div style={{
                position: "absolute",
                top: 8,
                left: 8,
                padding: "3px 9px",
                borderRadius: 9999,
                background: badge === "HIT" ? "rgba(17, 22, 18, 0.85)" : "rgba(239, 68, 68, 0.9)",
                backdropFilter: "blur(10px)",
                WebkitBackdropFilter: "blur(10px)",
                border: "1px solid rgba(255, 255, 255, 0.25)",
                color: "#fff",
                fontSize: 10.5,
                fontWeight: 600,
                letterSpacing: 0.3,
                zIndex: 2,
              }}>
                {badge}
              </div>
            )}

            <WishBtn
              isWished={isWished}
              language={language}
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggleWishlist(item); }}
            />
          </div>
        </div>

        {/* Info */}
        <div style={{ padding: "10px 12px 12px", display: "flex", flexDirection: "column", flex: 1 }}>
          {/* Do'kon (ombor) nomi — mahsulot nomidan tepada */}
          {warehouse?.name && (
            <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 3 }}>
              <Store size={11} color={GREEN} strokeWidth={2.2} style={{ flexShrink: 0 }} />
              <span style={{
                fontSize: 11, fontWeight: 600, color: GREEN, letterSpacing: -0.1,
                whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
              }}>
                {warehouse.name}
              </span>
            </div>
          )}
          {brandName && (
            <div style={{
              fontSize: 10,
              color: "#737D75",
              fontWeight: 600,
              letterSpacing: 0.3,
              textTransform: "uppercase",
              marginBottom: 2,
            }}>
              {brandName}
            </div>
          )}

          <div style={{
            fontSize: 13.5,
            fontWeight: 600,
            color: "#111612",
            lineHeight: 1.3,
            letterSpacing: -0.15,
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical" as const,
            overflow: "hidden",
          }}>
            {name}
          </div>

          {/* Personal reason — "nega bu senga" (halol, persona'dan) */}
          {reason && (
            <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 4 }}>
              <Sparkles size={11} color={GREEN} style={{ flexShrink: 0 }} />
              <span style={{
                fontSize: 10.5, fontWeight: 500, color: GREEN, letterSpacing: -0.1,
                lineHeight: 1.2, display: "-webkit-box", WebkitLineClamp: 1,
                WebkitBoxOrient: "vertical" as const, overflow: "hidden",
              }}>
                {reason}
              </span>
            </div>
          )}

          {/* Rating */}
          <div style={{ display: "flex", alignItems: "center", gap: 3.5, marginTop: 5 }}>
            <Star size={11} fill="#F6B100" color="#F6B100" />
            <span style={{ fontSize: 11, color: "#737D75", fontWeight: 500 }}>
              {(item.reviewCount || 0) > 0 ? (item.rating || 0).toFixed(1) : t.common.new}
            </span>
            {(item.reviewCount || 0) > 0 && (
              <>
                <span style={{ fontSize: 11, color: "#9AA29C" }}>·</span>
                <span style={{ fontSize: 11, color: "#737D75" }}>{item.reviewCount}</span>
              </>
            )}
          </div>

          {/* Status & Free badge */}
          <div style={{ marginTop: "auto", paddingTop: 8, display: "flex", alignItems: "baseline", gap: 5, flexWrap: "wrap" }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: "#16A34A", letterSpacing: -0.2 }}>
              {language === "uz" ? "Bepul mutolaa" : "Бесплатно"}
            </span>
            {item.model && (
              <span style={{ fontSize: 11, color: "#64748B", fontWeight: 500, background: "#F1F5F9", padding: "1px 6px", borderRadius: 4 }}>
                {item.model}
              </span>
            )}
          </div>
        </div>
      </Link>

      {/* Read action button */}
      <div style={{ marginTop: "auto", width: "100%" }}>
        <Link
          href={`/${language}/products/${getProductSlug(item, language)}?read=1`}
          onClick={() => videoPreWarmer.triggerHaptic("medium")}
          className="active:scale-[0.98] transition-transform duration-120 select-none"
          style={{
            width: "100%",
            height: 42,
            background: "linear-gradient(135deg, #1E293B 0%, #0F172A 100%)",
            color: "#fff",
            border: "none",
            fontSize: 13,
            fontWeight: 600,
            letterSpacing: -0.1,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            WebkitTapHighlightColor: "transparent",
            textDecoration: "none",
          }}
        >
          <BookOpen size={15} strokeWidth={2.4} />
          <span>{language === "uz" ? "Mutolaa qilish" : "Читать"}</span>
        </Link>
      </div>
    </div>
  );
}, (prev, next) => {
  if (prev.item !== next.item) return false;
  if (prev.language !== next.language || prev.priority !== next.priority || prev.reason !== next.reason || prev.brandLabel !== next.brandLabel) return false;
  const prevQty = (prev.cart || []).find(c => c.id === prev.item.id)?.quantity ?? 0;
  const nextQty = (next.cart || []).find(c => c.id === next.item.id)?.quantity ?? 0;
  if (prevQty !== nextQty) return false;
  const prevWish = (prev.wishlist || []).some(w => w.id === prev.item.id);
  const nextWish = (next.wishlist || []).some(w => w.id === next.item.id);
  if (prevWish !== nextWish) return false;
  return true;
});

ProductCard.displayName = "ProductCard";
