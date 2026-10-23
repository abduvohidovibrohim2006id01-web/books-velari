/**
 * Qidiruv so'rovini normalizatsiya qilish — typo, transliteratsiya va sinonimlar.
 * Tashqi API'siz, darhol ishlaydi (0ms). O'zbek/Rus elektron savdo uchun moslangan.
 */

// Brend transliteratsiyasi: kirill/lotin/typo → kanonik
const BRAND_MAP: Record<string, string> = {
    // Apple
    "ayfon": "iPhone", "айфон": "iPhone", "iphone": "iPhone", "ifon": "iPhone",
    "apple": "Apple", "айпад": "iPad", "ipad": "iPad", "aypad": "iPad",
    "макбук": "MacBook", "makbuk": "MacBook", "macbook": "MacBook",
    "эйрподс": "AirPods", "эирподс": "AirPods", "airpods": "AirPods", "erpods": "AirPods",
    "airpod": "AirPods", "arpods": "AirPods", "arpod": "AirPods", "ayrpods": "AirPods", "ayrpod": "AirPods",
    "airpos": "AirPods", "erpod": "AirPods",
    "dayson": "Dyson", "daysin": "Dyson", "dyson": "Dyson", "дайсон": "Dyson",
    "podsmax": "Pods Max", "клиппер": "clipper", "клипер": "clipper", "kliper": "clipper",
    // Samsung
    "самсунг": "Samsung", "samsung": "Samsung", "samsng": "Samsung", "самсунк": "Samsung",
    "галакси": "Galaxy", "galaxy": "Galaxy", "galaksi": "Galaxy",
    // Xiaomi
    "сяоми": "Xiaomi", "xiaomi": "Xiaomi", "shaomi": "Xiaomi", "ксиоми": "Xiaomi", "siyomi": "Xiaomi",
    "редми": "Redmi", "redmi": "Redmi", "poco": "Poco", "поко": "Poco",
    // Boshqalar
    "хуавей": "Huawei", "huawei": "Huawei", "хонор": "Honor", "honor": "Honor",
    "реалми": "Realme", "realme": "Realme", "оппо": "Oppo", "oppo": "Oppo", "виво": "Vivo", "vivo": "Vivo",
    "ноутбук": "noutbuk", "notebook": "noutbuk", "laptop": "noutbuk",
};

// Mahsulot turi sinonimlari (uz/ru aralash)
const SYNONYM_MAP: Record<string, string> = {
    "telefon": "smartfon", "телефон": "smartfon", "smartphone": "smartfon",
    "naushnik": "quloqchin", "наушник": "quloqchin", "headphone": "quloqchin", "earphone": "quloqchin",
    "airpods": "quloqchin", "earpods": "quloqchin",
    // Dyson — sochda asosan multi-stayler (Airwrap) va fen; do'konda Dyson yo'q, o'xshash stayler/fen-cho'tkalar bor
    "dyson": "stayler", "airwrap": "stayler",
    "soatlar": "soat", "часы": "soat", "watch": "soat", "smartwatch": "soat",
    "kompyuter": "kompyuter", "комп": "kompyuter", "pc": "kompyuter",
    "zaryadnik": "zaryad", "зарядка": "zaryad", "charger": "zaryad",
    "kabel": "kabel", "кабель": "kabel", "cable": "kabel", "provod": "kabel",
    "soch olish": "trimmer", "soch kesish": "trimmer", "mashinka": "trimmer", "стрижка": "trimmer",
    "clipper": "trimmer", "klipper": "trimmer", "kliper": "trimmer",
    "fen": "fen", "фен": "fen", "hairdryer": "fen",
};

// Kirill → lotin transliteratsiya jadvali (uz/ru). Fallback uchun:
// agar kirillcha so'rov natija bermasa, lotincha shaklini ham sinaymiz
// (mahsulot nomlari ko'pincha lotin: "клиппер" → "klipper" ≈ "clipper").
const CYRILLIC_MAP: Record<string, string> = {
    "а": "a", "б": "b", "в": "v", "г": "g", "д": "d", "е": "e", "ё": "yo",
    "ж": "j", "з": "z", "и": "i", "й": "y", "к": "k", "л": "l", "м": "m",
    "н": "n", "о": "o", "п": "p", "р": "r", "с": "s", "т": "t", "у": "u",
    "ф": "f", "х": "x", "ц": "ts", "ч": "ch", "ш": "sh", "щ": "sh",
    "ъ": "", "ы": "i", "ь": "", "э": "e", "ю": "yu", "я": "ya",
    "қ": "q", "ғ": "g", "ҳ": "h", "ў": "o",
};

/** Matndagi kirill harflarni lotinga o'giradi. Lotin/raqamlar tegmaydi. */
export function transliterateLatin(raw: string): string {
    const s = (raw || "").toLowerCase();
    let out = "";
    let hadCyrillic = false;
    for (const ch of s) {
        if (CYRILLIC_MAP[ch] !== undefined) { out += CYRILLIC_MAP[ch]; hadCyrillic = true; }
        else out += ch;
    }
    return hadCyrillic ? out : raw;
}

export function normalizeQuery(raw: string): string {
    const q = (raw || "").trim();
    if (!q) return q;

    const lower = q.toLowerCase();

    // 1) To'liq so'rov brend xaritasida bo'lsa
    if (BRAND_MAP[lower]) return BRAND_MAP[lower];
    if (SYNONYM_MAP[lower]) return SYNONYM_MAP[lower];

    // 2) So'zma-so'z almashtirish
    const words = lower.split(/\s+/);
    const mapped = words.map(w => BRAND_MAP[w] || SYNONYM_MAP[w] || w);

    // Agar hech narsa o'zgarmasa, original (katta-kichik harf) qaytariladi —
    // trigram qidiruv kichik typo'larni o'zi ushlaydi
    const result = mapped.join(" ");
    return result === lower ? q : result;
}

// Qidiruvda ahamiyatsiz yordamchi so'zlar ("maktab uchun sumka" → maktab, sumka)
const STOPWORDS = new Set(["uchun", "va", "bilan", "ham", "yoki", "для", "и", "с", "в", "на", "или", "for", "and", "with", "the"]);

/**
 * So'rov matnini tozalaydi: NFKC ("𝐔𝐳𝐮𝐤𝐥𝐚𝐫" → "uzuklar"), o'zbek apostroflari bitta ko'rinishga,
 * harf/raqam/probel/'/./- dan boshqa belgilar (vergul, qavs, % va h.k.) olib tashlanadi.
 */
export function cleanSearchText(raw: string): string {
    return (raw || "")
        .normalize("NFKC")
        .toLowerCase()
        .replace(/[ʻʼ‘’`´]/g, "'")
        // lotin (+kengaytma), kirill, raqam, probel, ' . - qoladi (ES5 target: \p{L} va /u ishlatilmaydi)
        .replace(/[^a-z0-9À-ɏЀ-ӿ\s'.\-]/g, " ")
        .replace(/(^|\s)[.'\-]+/g, " ")
        .replace(/[.'\-]+(?=\s|$)/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

/** O'zbekcha ko'plik/egalik qo'shimchasi: "kiyimlar" → "kiyim", "mashinkasi" → "mashinka", "dazmoli" → "dazmol". */
function uzStem(w: string): string | null {
    const m = w.match(/^(.{4,}?)(larni|larga|lari|lar|si)$/);
    if (m) return m[1];
    // undoshdan keyingi egalik "-i": "dazmoli" → "dazmol" (asos ≥ 5 harf)
    const p = w.match(/^(.{4,}[bcdfghjklmnpqrstvxz])i$/);
    return p ? p[1] : null;
}

/**
 * So'rovni token GURUHLARIGA ajratadi. Har guruh — bitta so'zning variantlari:
 * [asl so'z, o'zak, kirill→lotin, brend/typo xaritasi, sinonim, admin lug'ati].
 * Sinonim asl so'zni ALMASHTIRMAYDI, faqat qo'shiladi: mahsulot nomlari uz/ru, lug'atdagi
 * inglizcha variant ("fen" → "hair dryer") yolg'iz qolsa asl so'z bilan topiladigan tovar yo'qolardi.
 * Ikki so'zli lug'at kalitlari ("soch olish") bitta guruh bo'ladi.
 */
export function expandQuery(raw: string, dbSynonyms: Record<string, string> = {}): string[][] {
    const q = cleanSearchText(raw);
    if (!q) return [];
    let words = q.split(" ").filter(Boolean);
    const content = words.filter(w => !STOPWORDS.has(w));
    if (content.length) words = content;
    // 1-2 harfli raqamsiz bo'laklar ("bu", yozilayotgan "st") — boshqa so'z bo'lsa tashlanadi
    const meaningful = words.filter(w => w.length >= 3 || /\d/.test(w));
    if (meaningful.length) words = meaningful;

    // brend/typo xaritasi natijasiga ham sinonim qo'llanadi: "airpos" → "airpods" → "quloqchin"
    const mapped = (k: string) => {
        const direct = [BRAND_MAP[k], SYNONYM_MAP[k], dbSynonyms[k]].filter((v): v is string => !!v).map(v => cleanSearchText(v));
        const chained = direct.map(v => SYNONYM_MAP[v]).filter((v): v is string => !!v).map(v => cleanSearchText(v));
        return [...direct, ...chained];
    };

    // fuzzy: faqat xaridor yozgan so'z (va uning lotin transliti). O'zak/sinonim — "=" bilan, faqat aniq moslik
    // ("tarozi" → o'zak "taroz" fuzzy'da "taroq"ga yopishardi).
    type Alt = { v: string; exact: boolean };
    const groups: Alt[][] = words.map(w => {
        const alts: Alt[] = [{ v: w, exact: false }];
        const tr = transliterateLatin(w);
        if (tr !== w) alts.push({ v: tr, exact: false });
        const stem = uzStem(w);
        if (stem) alts.push({ v: stem, exact: true }, ...mapped(stem).map(v => ({ v, exact: true })));
        alts.push(...mapped(w).map(v => ({ v, exact: true })));
        if (tr !== w) alts.push(...mapped(tr).map(v => ({ v, exact: true })));
        return alts;
    });
    // Ikki so'zli lug'at kaliti ("soch dazmoli" → "utyujok"): so'zlar alohida qoladi, sinonim ikkalasiga variant
    for (let i = 0; i + 1 < words.length; i++) {
        const pairAlts = mapped(`${words[i]} ${words[i + 1]}`).map(v => ({ v, exact: true }));
        if (pairAlts.length) { groups[i].push(...pairAlts); groups[i + 1].push(...pairAlts); }
    }
    return groups.map(g => {
        const seen = new Set<string>();
        const out: string[] = [];
        for (const a of g) {
            if (!a.v || seen.has(a.v)) continue;
            seen.add(a.v);
            out.push(a.exact ? `=${a.v}` : a.v);
        }
        return out.slice(0, 6);
    });
}
