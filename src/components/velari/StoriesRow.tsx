"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import Image from "next/image";
import { buildStoryGroups, storySlideImage, type StoryGroupShape, type StoryImageMeta } from "@/lib/stories";
import { ShoppingBag, Send, X, Zap } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { PUBLIC_PRODUCT_COLUMNS } from "@/lib/public-product";
import dynamic from "next/dynamic";
// Tezkor xarid oynasi (~39 KB) — faqat story'dagi tugma bosilganda yuklanadi
const QuickBuySheet = dynamic(() => import("@/components/reels/QuickBuySheet").then(m => m.QuickBuySheet), { ssr: false });
import { videoPreWarmer } from "@/lib/videoPreWarmer";

interface Story {
    id: string;
    title_uz: string;
    title_ru: string;
    image: string;
    link: string;
    audio?: string;
    video?: string;
    is_active: boolean;
    sort_order: number;
    group_key?: string | null;
    group_title_uz?: string | null;
    group_title_ru?: string | null;
    cta_type?: "none" | "product" | "category" | "brand" | null;
    cta_ids?: string[] | null;
    cta_label_uz?: string | null;
    cta_label_ru?: string | null;
    image_meta?: StoryImageMeta;
}

type StoryGroup = StoryGroupShape<Story>;

const SEEN_KEY = "velari_seen_stories";
const IMG_DURATION = 5000;   // ms — rasm slayd davomiyligi
const VIDEO_DURATION = 15000; // ms — video slayd maksimal davomiyligi
const EASE = "cubic-bezier(0.22, 1, 0.36, 1)";
const CUBE_EASE = "cubic-bezier(0.45, 0.05, 0.2, 1)";
const CUBE_MS = 480;
const GREEN = "#2D6E3E";

function getSeenIds(): Set<string> {
    try { return new Set<string>(JSON.parse(localStorage.getItem(SEEN_KEY) || "[]")); }
    catch { return new Set<string>(); }
}
function markSeen(ids: string[]) {
    try {
        const set = getSeenIds();
        ids.forEach(id => set.add(id));
        localStorage.setItem(SEEN_KEY, JSON.stringify(Array.from(set)));
    } catch {}
}

// CTA tugmasi uchun manzil yasash
function ctaHref(lang: string, s: Story): string | null {
    const ids = Array.isArray(s.cta_ids) ? s.cta_ids : [];
    const type = s.cta_type || "none";
    if (type === "product" && ids[0]) return `/${lang}/products/${ids[0]}`;
    if (type === "category" && ids[0]) return `/${lang}/?category=${ids[0]}`;
    if (type === "brand" && ids[0]) return `/${lang}/?brand=${ids[0]}`;
    if (s.link) return s.link; // legacy oddiy URL
    return null;
}

export default function StoriesRow({
    language,
    device = "both",
    initialGroups
}: {
    language: "uz" | "ru";
    device?: "mobile" | "desktop" | "both";
    initialGroups?: StoryGroup[];
}) {
    const [groups, setGroups] = useState<StoryGroup[]>(initialGroups || []);
    const [seenIds, setSeenIds] = useState<Set<string>>(new Set());

    // Viewer holati
    const [open, setOpen] = useState(false);
    const [groupIdx, setGroupIdx] = useState(0);
    const [slideIdx, setSlideIdx] = useState(0);
    const [progress, setProgress] = useState(0);
    const [paused, setPaused] = useState(false);
    const [quickBuyProduct, setQuickBuyProduct] = useState<any | null>(null);

    const handleOpenQuickBuy = async (e: React.MouseEvent, s: Story) => {
        e.preventDefault();
        e.stopPropagation();
        videoPreWarmer.triggerHaptic("medium");
        setPaused(true);
        pausedRef.current = true;

        const productId = s.cta_ids?.[0];
        if (productId) {
            try {
                const { data } = await supabase.from("products").select(PUBLIC_PRODUCT_COLUMNS).eq("id", productId).single();
                if (data) {
                    setQuickBuyProduct(data);
                    return;
                }
            } catch {}
        }
        // Fallback: s dan product shakllantirish
        setQuickBuyProduct({
            id: s.id,
            name: s[`title_${language}`] || s.title_uz || s.title_ru,
            price: 180000,
            image: s.image,
            category: "Velari"
        });
    };

    // Kub o'tish holati
    const [rot, setRot] = useState(0);
    const [rotAnim, setRotAnim] = useState(false);
    const [transGroup, setTransGroup] = useState<number | null>(null);
    const [transDir, setTransDir] = useState<1 | -1>(1);

    const audioRef = useRef<HTMLAudioElement | null>(null);
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const pausedRef = useRef(false);
    const busyRef = useRef(false); // kub aylanayotganda progress to'xtaydi
    const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const ptr = useRef({ x: 0, y: 0, t: 0, moved: false, held: false });

    const groupsRef = useRef<StoryGroup[]>([]);
    groupsRef.current = groups;

    // — Data fetch + guruhlash —
    useEffect(() => {
        setSeenIds(getSeenIds());
        if (initialGroups && initialGroups.length > 0) return;
        supabase
            .from("stories")
            .select("*")
            .eq("is_active", true)
            .order("sort_order", { ascending: true })
            .then(({ data }) => {
                if (!data) return;
                setGroups(buildStoryGroups(data as Story[]));
            });
    }, [initialGroups]);

    const curGroup = groups[groupIdx];
    const curSlide = curGroup?.slides[slideIdx];

    // Refs for rAF closure
    const curSlideRef = useRef<Story | undefined>(undefined);
    curSlideRef.current = curSlide;

    // — Audio —
    const stopAudio = useCallback(() => {
        if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
    }, []);
    const playAudio = useCallback((s?: Story) => {
        stopAudio();
        if (s?.audio) {
            const a = new Audio(s.audio);
            a.loop = true; a.volume = 0.7;
            a.play().catch(() => {});
            audioRef.current = a;
        }
    }, [stopAudio]);

    // — Yopish —
    const handleClose = useCallback(() => {
        stopAudio();
        busyRef.current = false;
        setOpen(false);
        setPaused(false);
        pausedRef.current = false;
    }, [stopAudio]);

    // — Slayd ichida o'tish —
    const advanceRef = useRef<() => void>(() => {});

    const startCube = useCallback((dir: 1 | -1) => {
        if (busyRef.current) return;
        const list = groupsRef.current;
        const target = groupIdx + dir;
        if (target < 0) return;            // birinchi guruhdan oldin — hech narsa
        if (target >= list.length) { handleClose(); return; } // oxirgidan keyin — yopiladi

        busyRef.current = true;
        stopAudio();
        setTransGroup(target);
        setTransDir(dir);
        // animatsiyani yoqib, kubni aylantiramiz
        requestAnimationFrame(() => {
            setRotAnim(true);
            setRot(dir === 1 ? -90 : 90);
        });
        // tugagach holatni yangilaymiz
        window.setTimeout(() => {
            markSeen([list[target].slides[0].id]);
            setSeenIds(prev => new Set<string>([...Array.from(prev), list[target].slides[0].id]));
            setRotAnim(false);
            setRot(0);
            setTransGroup(null);
            setGroupIdx(target);
            setSlideIdx(0);
            setProgress(0);
            busyRef.current = false;
            playAudio(list[target].slides[0]);
        }, CUBE_MS);
    }, [groupIdx, handleClose, stopAudio, playAudio]);

    const nextSlide = useCallback(() => {
        if (busyRef.current) return;
        const g = groupsRef.current[groupIdx];
        if (!g) return;
        if (slideIdx < g.slides.length - 1) {
            const ni = slideIdx + 1;
            markSeen([g.slides[ni].id]);
            setSeenIds(prev => new Set<string>([...Array.from(prev), g.slides[ni].id]));
            setSlideIdx(ni);
            setProgress(0);
        } else {
            startCube(1); // guruhning oxirgi slaydi — keyingi guruhga kub bilan
        }
    }, [groupIdx, slideIdx, startCube]);
    advanceRef.current = nextSlide;

    const prevSlide = useCallback(() => {
        if (busyRef.current) return;
        if (slideIdx > 0) {
            setSlideIdx(slideIdx - 1);
            setProgress(0);
        } else {
            startCube(-1); // birinchi slayd — oldingi guruhga
        }
    }, [slideIdx, startCube]);

    // — rAF progress (pauza/davom bilan) —
    useEffect(() => {
        if (!open) return;
        let raf = 0;
        let last = performance.now();
        let elapsed = 0;
        setProgress(0);
        const dur = curSlideRef.current?.video ? VIDEO_DURATION : IMG_DURATION;
        const tick = (now: number) => {
            const dt = now - last; last = now;
            if (!pausedRef.current && !busyRef.current) {
                elapsed += dt;
                const p = Math.min(1, elapsed / dur);
                setProgress(p);
                if (p >= 1) { advanceRef.current(); return; }
            }
            raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(raf);
    }, [open, groupIdx, slideIdx]);

    // — Pauza: video/audio —
    useEffect(() => {
        pausedRef.current = paused;
        const v = videoRef.current;
        if (paused) {
            if (v) v.pause();
            if (audioRef.current) audioRef.current.pause();
        } else {
            if (v) v.play().catch(() => {});
            if (audioRef.current) audioRef.current.play().catch(() => {});
        }
    }, [paused]);

    // — Body scroll lock —
    useEffect(() => {
        if (open) {
            document.body.style.overflow = "hidden";
            document.body.style.touchAction = "none";
        } else {
            document.body.style.overflow = "";
            document.body.style.touchAction = "";
        }
        return () => {
            document.body.style.overflow = "";
            document.body.style.touchAction = "";
        };
    }, [open]);

    // — Klaviatura —
    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") handleClose();
            if (e.key === "ArrowRight") nextSlide();
            if (e.key === "ArrowLeft") prevSlide();
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [open, handleClose, nextSlide, prevSlide]);

    // — Tozalash —
    useEffect(() => () => { stopAudio(); if (holdTimer.current) clearTimeout(holdTimer.current); }, [stopAudio]);

    // — Pufakni ochish —
    const openGroup = (gi: number) => {
        const g = groupsRef.current[gi];
        if (!g) return;
        markSeen([g.slides[0].id]);
        setSeenIds(prev => new Set<string>([...Array.from(prev), g.slides[0].id]));
        setGroupIdx(gi);
        setSlideIdx(0);
        setProgress(0);
        setRot(0);
        setRotAnim(false);
        setTransGroup(null);
        setPaused(false);
        pausedRef.current = false;
        busyRef.current = false;
        setOpen(true);
        playAudio(g.slides[0]);
    };

    // — Gesture overlay —
    const onPointerDown = (e: React.PointerEvent) => {
        ptr.current = { x: e.clientX, y: e.clientY, t: performance.now(), moved: false, held: false };
        if (holdTimer.current) clearTimeout(holdTimer.current);
        holdTimer.current = setTimeout(() => {
            ptr.current.held = true;
            setPaused(true);
        }, 220);
    };
    const onPointerMove = (e: React.PointerEvent) => {
        const dx = e.clientX - ptr.current.x;
        const dy = e.clientY - ptr.current.y;
        if (Math.abs(dx) > 10 || Math.abs(dy) > 10) {
            ptr.current.moved = true;
            if (holdTimer.current) { clearTimeout(holdTimer.current); holdTimer.current = null; }
        }
    };
    const onPointerUp = (e: React.PointerEvent) => {
        if (holdTimer.current) { clearTimeout(holdTimer.current); holdTimer.current = null; }
        const dx = e.clientX - ptr.current.x;
        const dy = e.clientY - ptr.current.y;

        if (ptr.current.held) { setPaused(false); return; } // hold tugadi — navigatsiya yo'q

        if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) {
            startCube(dx < 0 ? 1 : -1); // chapga surish → keyingi mavzu, o'ngga → oldingi
            return;
        }
        if (dy > 90 && Math.abs(dy) > Math.abs(dx)) { handleClose(); return; } // pastga — yopiladi

        // oddiy tap — chap 35% oldingi, qolgani keyingi slayd
        const w = (e.currentTarget as HTMLElement).clientWidth || window.innerWidth;
        const rel = e.clientX - (e.currentTarget as HTMLElement).getBoundingClientRect().left;
        if (rel < w * 0.35) prevSlide(); else nextSlide();
    };
    const onPointerCancel = () => {
        if (holdTimer.current) { clearTimeout(holdTimer.current); holdTimer.current = null; }
        if (ptr.current.held) setPaused(false);
    };

    // — Slayd mediasi —
    const renderMedia = (s: Story | undefined) => {
        if (!s) return null;
        if (s.video) {
            return (
                <video
                    ref={s === curSlide ? videoRef : undefined}
                    key={s.id + "-v"}
                    src={s.video}
                    autoPlay playsInline loop
                    muted={!!s.audio}
                    style={{ width: "100%", height: "100%", objectFit: "cover", background: "#000" }}
                />
            );
        }
        return (
            <Image
                key={s.id + "-i"}
                src={storySlideImage(s) || "/placeholder.png"}
                alt={language === "uz" ? s.title_uz : s.title_ru}
                fill sizes="100vw" priority
                style={{ objectFit: "cover" }}
            />
        );
    };

    if (groups.length === 0) return null;

    return (
        <>
            {/* — Story pufaklari qatori (MOBIL) — */}
            {device !== "desktop" && <div className="md:hidden mt-4 mb-0 min-h-[106px]">
                <div
                    style={{ display: "flex", gap: 14, overflowX: "auto", padding: "4px 20px 8px", scrollbarWidth: "none" }}
                    className="no-scrollbar"
                >
                    {groups.map((g, idx) => {
                        const seen = g.slides.every(s => seenIds.has(s.id));
                        const name = language === "uz" ? g.title_uz : g.title_ru;
                        const hasVideo = g.coverIsVideo;
                        return (
                            <button
                                key={g.key}
                                onClick={() => openGroup(idx)}
                                style={{
                                    flexShrink: 0, display: "flex", flexDirection: "column",
                                    alignItems: "center", gap: 6, background: "none", border: "none",
                                    padding: 0, cursor: "pointer", WebkitTapHighlightColor: "transparent",
                                }}
                            >
                                <div style={{
                                    width: 80, height: 80, borderRadius: "50%", padding: 3,
                                    background: seen ? "rgba(15,20,16,0.08)" : `conic-gradient(${GREEN} 0%, #7DC492 50%, ${GREEN} 100%)`,
                                    boxSizing: "border-box", position: "relative",
                                }}>
                                    <div style={{
                                        width: "100%", height: "100%", borderRadius: "50%",
                                        border: "2.5px solid #FAFAF6", overflow: "hidden",
                                        position: "relative", background: "#F0F0EC",
                                    }}>
                                        {g.coverImage ? (
                                            // eng kichik variant + blur; 1–2-aylana fetchpriority=high, qolganlari lazy
                                            <Image src={g.coverThumb || g.coverImage} alt={name} fill sizes="80px" style={{ objectFit: "cover" }}
                                                priority={idx < 2} loading={idx < 2 ? undefined : "lazy"}
                                                placeholder={g.coverBlur ? "blur" : "empty"} blurDataURL={g.coverBlur} />
                                        ) : hasVideo ? (
                                            <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#111" }}>
                                                <span style={{ fontSize: 20, color: "#fff" }}>▶</span>
                                            </div>
                                        ) : null}
                                    </div>
                                    {g.slides.length > 1 && (
                                        <div style={{
                                            position: "absolute", bottom: 0, right: 0, minWidth: 20, height: 20,
                                            padding: "0 5px", borderRadius: 10, background: GREEN, color: "#fff",
                                            fontSize: 11, fontWeight: 700, display: "flex", alignItems: "center",
                                            justifyContent: "center", border: "2px solid #FAFAF6",
                                        }}>{g.slides.length}</div>
                                    )}
                                </div>
                                <span style={{
                                    fontSize: 11, fontWeight: seen ? 500 : 700,
                                    color: seen ? "#9AA29C" : "#0F1410", letterSpacing: -0.1,
                                    maxWidth: 80, textAlign: "center", whiteSpace: "nowrap",
                                    overflow: "hidden", textOverflow: "ellipsis",
                                }}>{name}</span>
                            </button>
                        );
                    })}
                </div>
            </div>}

            {/* — Story pufaklari (DESKTOP, kattaroq) — */}
            {device !== "mobile" && <div className="hidden md:block px-10 mt-10 min-h-[140px]">
                <div style={{ display: "flex", gap: 22, overflowX: "auto", paddingBottom: 6 }} className="no-scrollbar">
                    {groups.map((g, idx) => {
                        const seen = g.slides.every(s => seenIds.has(s.id));
                        const name = language === "uz" ? g.title_uz : g.title_ru;
                        const hasVideo = g.coverIsVideo;
                        return (
                            <button
                                key={g.key}
                                onClick={() => openGroup(idx)}
                                style={{
                                    flexShrink: 0, display: "flex", flexDirection: "column",
                                    alignItems: "center", gap: 10, background: "none", border: "none",
                                    padding: 0, cursor: "pointer",
                                }}
                            >
                                <div style={{
                                    width: 100, height: 100, borderRadius: "50%", padding: 4,
                                    background: seen ? "rgba(15,20,16,0.08)" : `conic-gradient(${GREEN} 0%, #7DC492 50%, ${GREEN} 100%)`,
                                    boxSizing: "border-box", position: "relative",
                                }}>
                                    <div style={{
                                        width: "100%", height: "100%", borderRadius: "50%",
                                        border: "3px solid #FAFAF6", overflow: "hidden",
                                        position: "relative", background: "#F0F0EC",
                                    }}>
                                        {g.coverImage ? (
                                            <Image src={g.coverThumb || g.coverImage} alt={name} fill sizes="100px" style={{ objectFit: "cover" }}
                                                priority={idx < 2} loading={idx < 2 ? undefined : "lazy"}
                                                placeholder={g.coverBlur ? "blur" : "empty"} blurDataURL={g.coverBlur} />
                                        ) : hasVideo ? (
                                            <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#111" }}>
                                                <span style={{ fontSize: 26, color: "#fff" }}>▶</span>
                                            </div>
                                        ) : null}
                                    </div>
                                    {g.slides.length > 1 && (
                                        <div style={{
                                            position: "absolute", bottom: 2, right: 2, minWidth: 24, height: 24,
                                            padding: "0 6px", borderRadius: 12, background: GREEN, color: "#fff",
                                            fontSize: 12, fontWeight: 700, display: "flex", alignItems: "center",
                                            justifyContent: "center", border: "2.5px solid #FAFAF6",
                                        }}>{g.slides.length}</div>
                                    )}
                                </div>
                                <span style={{
                                    fontSize: 13, fontWeight: seen ? 500 : 700,
                                    color: seen ? "#9AA29C" : "#0F1410", letterSpacing: -0.1,
                                    maxWidth: 104, textAlign: "center", whiteSpace: "nowrap",
                                    overflow: "hidden", textOverflow: "ellipsis",
                                }}>{name}</span>
                            </button>
                        );
                    })}
                </div>
            </div>}

            {/* — Story viewer — */}
            {open && curGroup && (
                <div style={{ position: "fixed", inset: 0, zIndex: 9999, background: "#000", animation: "velari-fade-in 180ms ease both" }}>
                    {/* 3D kub sahna */}
                    <div style={{ position: "absolute", inset: 0, perspective: "1400px", overflow: "hidden" }}>
                        <div style={{
                            position: "absolute", inset: 0, transformStyle: "preserve-3d",
                            transform: `translateZ(-50vw) rotateY(${rot}deg)`,
                            transition: rotAnim ? `transform ${CUBE_MS}ms ${CUBE_EASE}` : "none",
                        }}>
                            {/* Old (joriy) yuza */}
                            <div style={{ position: "absolute", inset: 0, overflow: "hidden", WebkitBackfaceVisibility: "hidden", backfaceVisibility: "hidden", transform: "rotateY(0deg) translateZ(50vw)", background: "#000" }}>
                                {renderMedia(curSlide)}
                            </div>
                            {/* Yon (keyingi/oldingi) yuza */}
                            {transGroup != null && (
                                <div style={{
                                    position: "absolute", inset: 0, overflow: "hidden",
                                    WebkitBackfaceVisibility: "hidden", backfaceVisibility: "hidden",
                                    transform: `rotateY(${transDir === 1 ? 90 : -90}deg) translateZ(50vw)`, background: "#000",
                                }}>
                                    {renderMedia(groups[transGroup]?.slides[0])}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Gesture overlay (mediadan ustun, lekin UI dan past) */}
                    <div
                        style={{ position: "absolute", inset: 0, zIndex: 2, touchAction: "none" }}
                        onPointerDown={onPointerDown}
                        onPointerMove={onPointerMove}
                        onPointerUp={onPointerUp}
                        onPointerCancel={onPointerCancel}
                    />

                    {/* Progress bars (faqat joriy guruh slaydlari) */}
                    <div style={{ position: "absolute", top: 0, left: 0, right: 0, zIndex: 5, display: "flex", gap: 4, padding: "16px 16px 0", opacity: paused ? 0.4 : 1, transition: "opacity 200ms ease" }}>
                        {curGroup.slides.map((s, i) => (
                            <div key={s.id} style={{ flex: 1, height: 2.5, borderRadius: 2, background: "rgba(255,255,255,0.28)", overflow: "hidden" }}>
                                <div style={{
                                    height: "100%", borderRadius: 2, background: "#fff",
                                    width: i < slideIdx ? "100%" : i === slideIdx ? `${progress * 100}%` : "0%",
                                    transition: i === slideIdx ? "width 80ms linear" : "none",
                                }} />
                            </div>
                        ))}
                    </div>

                    {/* Header */}
                    <div style={{ position: "absolute", top: 22, left: 0, right: 0, zIndex: 5, display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", opacity: paused ? 0.4 : 1, transition: "opacity 200ms ease" }}>
                        <div style={{ width: 36, height: 36, borderRadius: "50%", overflow: "hidden", border: "2px solid rgba(255,255,255,0.4)", position: "relative", flexShrink: 0, background: GREEN }}>
                            {curGroup.coverImage && (
                                <Image src={curGroup.coverThumb || curGroup.coverImage} alt="" fill sizes="36px" style={{ objectFit: "cover" }} />
                            )}
                        </div>
                        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
                            <span style={{ fontSize: 14, fontWeight: 700, color: "#fff", letterSpacing: -0.2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {language === "uz" ? curGroup.title_uz : curGroup.title_ru}
                            </span>
                            {curSlide?.audio && (
                                <span style={{ fontSize: 10, color: "rgba(255,255,255,0.55)", fontWeight: 600, letterSpacing: 0.4 }}>
                                    ♪ {language === "uz" ? "Musiqa ijroda" : "Музыка играет"}
                                </span>
                            )}
                        </div>
                        <button onClick={handleClose} style={{
                            background: "rgba(255,255,255,0.15)", border: "none", borderRadius: "50%",
                            width: 32, height: 32, color: "#fff", cursor: "pointer", display: "flex",
                            alignItems: "center", justifyContent: "center", flexShrink: 0,
                        }}><X size={18} /></button>
                    </div>

                    {/* Instagram Shoppable Product Sticker */}
                    {!busyRef.current && curSlide && (curSlide.cta_type === "product" || curSlide.cta_ids?.[0]) && (
                        <div
                            onClick={(e) => handleOpenQuickBuy(e, curSlide)}
                            style={{
                                position: "absolute",
                                bottom: 94,
                                left: "50%",
                                transform: "translateX(-50%)",
                                zIndex: 10,
                                display: "flex",
                                alignItems: "center",
                                gap: 8,
                                padding: "9px 18px",
                                background: "rgba(255, 255, 255, 0.95)",
                                backdropFilter: "blur(16px)",
                                borderRadius: 30,
                                boxShadow: "0 12px 35px rgba(0,0,0,0.4)",
                                cursor: "pointer",
                                border: "1px solid rgba(255,255,255,0.8)",
                                WebkitTapHighlightColor: "transparent",
                            }}
                            className="active:scale-95 transition-transform"
                        >
                            <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#2D6E3E", boxShadow: "0 0 0 3px rgba(45, 110, 62, 0.25)" }} />
                            <ShoppingBag size={15} color="#2D6E3E" strokeWidth={2.5} />
                            <span style={{ fontSize: 11, fontWeight: 800, color: "#0F1410", letterSpacing: 0.2, textTransform: "uppercase" }}>
                                {curSlide.cta_label_uz || curSlide.cta_label_ru || (language === "uz" ? "Mahsulotni Xarid Qilish" : "Купить товар")}
                            </span>
                            <Zap size={13} color="#6335ED" fill="#6335ED" />
                        </div>
                    )}

                    {/* CTA — "Xarid qilish" tugmasi */}
                    {!busyRef.current && curSlide && ctaHref(language, curSlide) && (
                        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, zIndex: 5, padding: "16px 20px 36px", display: "flex", justifyContent: "center", gap: 10 }}>
                            {curSlide.cta_type === "product" || curSlide.cta_ids?.[0] ? (
                                <button
                                    type="button"
                                    onClick={(e) => handleOpenQuickBuy(e, curSlide)}
                                    style={{
                                        flex: 1, maxWidth: 360, display: "flex", alignItems: "center", justifyContent: "center",
                                        gap: 8, padding: "15px 18px", background: "#fff", borderRadius: 30, border: "none",
                                        color: "#0F1410", fontWeight: 800, fontSize: 14, cursor: "pointer",
                                        letterSpacing: -0.2, boxShadow: "0 6px 24px rgba(0,0,0,0.25)",
                                    }}
                                    className="active:scale-95 transition-transform"
                                >
                                    <ShoppingBag size={17} color={GREEN} strokeWidth={2.4} />
                                    <span>
                                        {curSlide.cta_label_uz || curSlide.cta_label_ru || (language === "uz" ? "Tezkor Xarid" : "Быстрая покупка")}
                                    </span>
                                </button>
                            ) : (
                                <a
                                    href={ctaHref(language, curSlide) || "#"}
                                    onClick={handleClose}
                                    style={{
                                        flex: 1, maxWidth: 360, display: "flex", alignItems: "center", justifyContent: "center",
                                        gap: 8, padding: "15px 18px", background: "#fff", borderRadius: 30,
                                        color: "#0F1410", fontWeight: 800, fontSize: 14, textDecoration: "none",
                                        letterSpacing: -0.2, boxShadow: "0 6px 24px rgba(0,0,0,0.25)",
                                    }}
                                >
                                    <ShoppingBag size={17} color={GREEN} strokeWidth={2.4} />
                                    {curSlide.cta_label_uz || curSlide.cta_label_ru
                                        ? (language === "uz" ? (curSlide.cta_label_uz || curSlide.cta_label_ru) : (curSlide.cta_label_ru || curSlide.cta_label_uz))
                                        : (curSlide.cta_type && curSlide.cta_type !== "none"
                                            ? (language === "uz" ? "Xarid qilish" : "Купить")
                                            : (language === "uz" ? "Ko'rish" : "Смотреть"))}
                                </a>
                            )}
                            <button
                                type="button"
                                aria-label={language === "uz" ? "Ulashish" : "Поделиться"}
                                onClick={async (e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    const rel = ctaHref(language, curSlide) || `/${language}`;
                                    const url = /^https?:\/\//.test(rel)
                                        ? rel
                                        : (typeof window !== "undefined" ? window.location.origin + rel : rel);
                                    const title = language === "uz" ? curGroup.title_uz : curGroup.title_ru;
                                    try {
                                        if (typeof navigator !== "undefined" && (navigator as any).share) {
                                            await (navigator as any).share({ title, url });
                                        } else if (typeof navigator !== "undefined" && navigator.clipboard) {
                                            await navigator.clipboard.writeText(url);
                                        }
                                    } catch { /* foydalanuvchi bekor qildi yoki qo'llab-quvvatlanmaydi */ }
                                }}
                                style={{
                                    width: 52, height: 52, borderRadius: 26, background: "rgba(255,255,255,0.16)",
                                    backdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "center",
                                    flexShrink: 0, border: "none", cursor: "pointer", WebkitTapHighlightColor: "transparent",
                                }}
                            >
                                <Send size={20} color="#fff" />
                            </button>
                        </div>
                    )}

                    {/* Quick Buy Sheet for Stories */}
                    {quickBuyProduct && (
                        <QuickBuySheet
                            product={quickBuyProduct}
                            onClose={() => {
                                setQuickBuyProduct(null);
                                setPaused(false);
                                pausedRef.current = false;
                            }}
                            language={language}
                            t={{}}
                        />
                    )}
                </div>
            )}
        </>
    );
}
