"use client";
import { ReactNode, useEffect, useState, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { videoPreWarmer } from "@/lib/videoPreWarmer";

interface SheetProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  height?: string | number;
  title?: string;
}

export default function Sheet({ open, onClose, children, height = "auto", title }: SheetProps) {
  const [mounted, setMounted] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [translateY, setTranslateY] = useState(0);

  useEffect(() => {
    setMounted(true);
  }, []);
  const [isDragging, setIsDragging] = useState(false);
  const isDraggingRef = useRef(false);
  const dragStartY = useRef(0);
  const lastTouchY = useRef(0);
  const lastTouchTime = useRef(0);
  const currentTranslateY = useRef(0);
  const sheetContentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
      setIsClosing(false);
      setTranslateY(0);
      currentTranslateY.current = 0;
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  const handleClose = useCallback(() => {
    if (isClosing) return;
    setIsClosing(true);
    setTimeout(() => {
      onClose();
      setIsClosing(false);
      setTranslateY(0);
      currentTranslateY.current = 0;
    }, 240);
  }, [isClosing, onClose]);

  // Non-passive touchmove listener to prevent browser pull-to-refresh
  useEffect(() => {
    const el = sheetContentRef.current;
    if (!el) return;

    const preventScrollWhenDragging = (e: TouchEvent) => {
      if (isDraggingRef.current && e.cancelable) {
        e.preventDefault();
      }
    };

    el.addEventListener("touchmove", preventScrollWhenDragging, { passive: false });
    return () => {
      el.removeEventListener("touchmove", preventScrollWhenDragging);
    };
  }, []);

  // Pointer drag handler on handle bar & header
  const handlePointerDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragStartY.current = e.clientY;
    lastTouchY.current = e.clientY;
    lastTouchTime.current = performance.now();
    isDraggingRef.current = true;
    setIsDragging(true);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDraggingRef.current) return;
    e.stopPropagation();
    const deltaY = e.clientY - dragStartY.current;
    if (deltaY < 0) {
      setTranslateY(0);
      currentTranslateY.current = 0;
      return;
    }

    lastTouchY.current = e.clientY;
    lastTouchTime.current = performance.now();
    currentTranslateY.current = deltaY;
    setTranslateY(deltaY);
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (!isDraggingRef.current) return;
    e.stopPropagation();
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {}

    isDraggingRef.current = false;
    setIsDragging(false);

    const dy = currentTranslateY.current;
    const dt = Math.max(1, performance.now() - lastTouchTime.current);
    const velocity = dt < 150 ? (lastTouchY.current - dragStartY.current) / dt : 0;

    // Dismiss threshold: dragged > 80px or flicked downward with velocity > 0.45 px/ms
    if (dy > 80 || velocity > 0.45) {
      videoPreWarmer.triggerHaptic("light");
      handleClose();
    } else {
      setTranslateY(0);
      currentTranslateY.current = 0;
    }
  };

  // Content scroll touch fallback
  const handleTouchStart = (e: React.TouchEvent) => {
    e.stopPropagation();
    const scrollEl = sheetContentRef.current;
    if (scrollEl && scrollEl.scrollTop > 0) {
      return;
    }
    const touch = e.touches[0];
    dragStartY.current = touch.clientY;
    lastTouchY.current = touch.clientY;
    lastTouchTime.current = performance.now();
    isDraggingRef.current = true;
    setIsDragging(true);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDraggingRef.current) return;
    e.stopPropagation();
    const touch = e.touches[0];
    const deltaY = touch.clientY - dragStartY.current;
    const scrollEl = sheetContentRef.current;

    if (deltaY < 0 || (scrollEl && scrollEl.scrollTop > 0)) {
      return;
    }

    lastTouchY.current = touch.clientY;
    lastTouchTime.current = performance.now();
    currentTranslateY.current = deltaY;
    setTranslateY(deltaY);
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    e.stopPropagation();
    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;
    setIsDragging(false);

    const dy = currentTranslateY.current;
    const dt = Math.max(1, performance.now() - lastTouchTime.current);
    const velocity = dt < 150 ? (lastTouchY.current - dragStartY.current) / dt : 0;

    if (dy > 80 || velocity > 0.45) {
      videoPreWarmer.triggerHaptic("light");
      handleClose();
    } else {
      setTranslateY(0);
      currentTranslateY.current = 0;
    }
  };

  if (!open && !isClosing) return null;
  if (!mounted) return null;

  const content = (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 200, overscrollBehavior: "none" }}
      onTouchStart={(e) => e.stopPropagation()}
      onTouchMove={(e) => e.stopPropagation()}
    >
      {/* Backdrop */}
      <div
        onClick={() => {
          videoPreWarmer.triggerHaptic("light");
          handleClose();
        }}
        style={{
          position: "absolute",
          inset: 0,
          background: "rgba(0,0,0,0.45)",
          backdropFilter: "blur(4px)",
          WebkitBackdropFilter: "blur(4px)",
          touchAction: "none",
          transition: "opacity 240ms ease-out",
          opacity: isClosing ? 0 : 1,
          animation: isClosing ? "none" : "velari-fade-in 240ms ease-out",
        }}
      />
      {/* Sheet Container */}
      <div
        ref={sheetContentRef}
        onClick={(e) => e.stopPropagation()}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        className="overscroll-contain [WebkitOverflowScrolling:touch]"
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          background: "rgba(255, 255, 255, 0.95)",
          backdropFilter: "blur(28px)",
          WebkitBackdropFilter: "blur(28px)",
          borderTopLeftRadius: 30,
          borderTopRightRadius: 30,
          borderTop: "1px solid rgba(255, 255, 255, 0.8)",
          zIndex: 201,
          height,
          maxHeight: "92dvh",
          overflowY: "auto",
          overscrollBehavior: "contain",
          paddingBottom: "max(16px, env(safe-area-inset-bottom, 16px))",
          transform: isClosing
            ? "translateY(100%)"
            : isDragging
            ? `translateY(${Math.max(0, translateY)}px)`
            : "translateY(0%)",
          transition: isDragging
            ? "none"
            : "transform 300ms cubic-bezier(0.32, 0.72, 0, 1)",
          animation: (!isClosing && !isDragging && translateY === 0)
            ? "velari-sheet-up 380ms cubic-bezier(0.22,1,0.36,1)"
            : "none",
          boxShadow: "0 -12px 40px rgba(0,0,0,0.14)",
          willChange: "transform",
        }}
      >
        {/* Drag Handle & Header Area (Dedicated Touch-Action None Zone) */}
        <div
          className="sheet-drag-handle select-none"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          style={{
            touchAction: "none",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            paddingTop: 12,
            paddingBottom: 8,
            cursor: "grab",
            width: "100%",
          }}
        >
          <div style={{ width: 42, height: 5, borderRadius: 3, background: "rgba(17,22,18,0.2)" }} />
          {title && (
            <div style={{
              paddingTop: 10,
              fontSize: 17,
              fontWeight: 600,
              color: "#111612",
              letterSpacing: -0.3,
              textAlign: "center",
              width: "100%",
            }}>
              {title}
            </div>
          )}
        </div>
        {children}
      </div>
    </div>
  );

  return createPortal(content, document.body);
}
