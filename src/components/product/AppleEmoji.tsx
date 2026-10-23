"use client";

const EMOJI_MAP: { [key: string]: string } = {
    "😂": "https://emojicdn.elk.sh/😂?style=apple",
    "👍": "https://emojicdn.elk.sh/👍?style=apple",
    "👎": "https://emojicdn.elk.sh/👎?style=apple",
    "❤️": "https://emojicdn.elk.sh/❤️?style=apple",
    "🔥": "https://emojicdn.elk.sh/🔥?style=apple",
    "💯": "https://emojicdn.elk.sh/💯?style=apple",
    "⚡": "https://emojicdn.elk.sh/⚡?style=apple",
    "🍌": "https://emojicdn.elk.sh/🍌?style=apple",
    "🏆": "https://emojicdn.elk.sh/🏆?style=apple",
    "💔": "https://emojicdn.elk.sh/💔?style=apple",
};

interface AppleEmojiProps {
    emoji: string;
    size?: number;
    className?: string;
}

export const AppleEmoji = ({ emoji, size = 20, className = "" }: AppleEmojiProps) => {
    return (
        <img
            src={EMOJI_MAP[emoji] || `https://emojicdn.elk.sh/${emoji}?style=apple`}
            alt={emoji}
            width={size}
            height={size}
            className={`inline-block object-contain flex-shrink-0 ${className}`}
            style={{ width: `${size}px`, height: `${size}px` }}
        />
    );
};
