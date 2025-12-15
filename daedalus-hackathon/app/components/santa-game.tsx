"use client";

import Snowfall from "react-snowfall";
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useChat } from "dedalus-react";

type House = {
    id: string;
    label: string;
    latitude: number;
    longitude: number;
    delivered: boolean;
};

type Position = {
    x: number;
    y: number;
};

type LogEntry = {
    id: string;
    text: string;
};

type ComplianceStage = "idle" | "alert" | "drafting" | "ready" | "submitted";

type ComplianceState = {
    active: boolean;
    agency: string | null;
    stage: ComplianceStage;
};

type ChatMessage = {
    role: "user" | "assistant" | "system";
    content: string;
};


type DraftSections = {
    issue: string;
    facts: string;
    analysis: string;
    actions: string;
    references: string[];
    raw: string;
};

type MapMask = {
    data: Uint8ClampedArray;
    width: number;
    height: number;
};

const clamp = (value: number, min: number, max: number): number => {
    if (value < min) {
        return min;
    }
    if (value > max) {
        return max;
    }
    return value;
};

const messageId = () => crypto.randomUUID();

const emptyDraft: DraftSections = {
    issue: "",
    facts: "",
    analysis: "",
    actions: "",
    references: [],
    raw: "",
};

const parseDraftContent = (content: string): DraftSections => {
    const text = content.replace(/\r\n/g, "\n").trim();
    const normalize = (val: string) => val.trim();
    const dash = "-–—";
    const getSection = (label: string) => {
        const regex = new RegExp(
            `PART\\s+${label}\\s*[${dash}]?\\s*:?\\s*([\\s\\S]*?)(?=\\nPART\\s+[IVX]+\\s*[${dash}]?\\s*:?|\\nREFERENCES|\\nReferences|$)`,
            "i",
        );
        const match = text.match(regex);
        return match ? normalize(match[1]) : "";
    };
    const refsMatch = text.match(/REFERENCES?\s*[:\-–—]*\s*([\s\S]*)/i);
    const refsBlock = refsMatch ? refsMatch[1] : "";
    const references = refsBlock
        .split("\n")
        .map((line) => line.replace(/^[-*\d.\s]+/, "").trim())
        .filter(Boolean);

    const sections = {
        issue: getSection("I"),
        facts: getSection("II"),
        analysis: getSection("III"),
        actions: getSection("IV"),
    };

    const hasContent = Object.values(sections).some((v) => v.length > 0);
    const issue = hasContent ? sections.issue : text;

    return {
        issue,
        facts: sections.facts,
        analysis: sections.analysis,
        actions: sections.actions,
        references,
        raw: text,
    };
};

const AGENCIES = [
    "Federal Aviation Administration (FAA) - United States",
    "European Union Aviation Safety Agency (EASA) - Europe",
    "Civil Aviation Administration of China (CAAC) - China",
    "International Civil Aviation Organization (ICAO) - United Nations agency (global)",
    "North American Aerospace Defense Command (NORAD) - United States & Canada",
    "Transport Canada Civil Aviation (TCCA) - Canada",
    "Civil Aviation Authority (CAA) - United Kingdom",
    "Civil Aviation Safety Authority (CASA) - Australia",
    "Directorate General of Civil Aviation (DGCA) - India",
    "NAV CANADA - Canada (air navigation services)",
    "Skeyes (formerly Belgocontrol) - Belgium",
    "Skyguide - Switzerland",
    "Deutsche Flugsicherung (DFS) - Germany",
    "ENAV - Italy",
    "ENAIRE - Spain",
    "Direction des Services de la Navigation Aérienne (DSNA) - France",
    "Civil Aviation Authority of Singapore - Singapore",
    "Civil Aviation Authority of Bangladesh - Bangladesh",
    "Civil Aviation Authority of Nepal - Nepal",
    "Civil Aviation Authority of the Philippines - Philippines",
    "Russian Federal Air Transport Agency (Rosaviatsiya) - Russia",
    "General Authority of Civil Aviation - Saudi Arabia",
    "Civil Aviation Administration (Sweden) - Sweden",
    "PANSA (Polska Agencja Żeglugi Powietrznej) - Poland",
    "State Air Traffic Management Corporation - South Africa",
];

const mulberry32 = (seed: number) => {
    let state = seed;
    return () => {
        state |= 0;
        state = (state + 0x6d2b79f5) | 0;
        let t = Math.imul(state ^ (state >>> 15), state | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
};

const generateHouses = (count: number, mask: MapMask | null): House[] => {
    const rand = mulberry32(20241214);
    const houses: House[] = [];
    const isLand = (latitude: number, longitude: number) => {
        if (!mask) {
            return true;
        }
        const pxX = Math.max(0, Math.min(mask.width - 1, Math.round((longitude / 100) * mask.width)));
        const pxY = Math.max(0, Math.min(mask.height - 1, Math.round((latitude / 100) * mask.height)));
        const idx = (pxY * mask.width + pxX) * 4;
        const alpha = mask.data[idx + 3];
        return alpha > 10; // only place on opaque land
    };

    let attempts = 0;
    const maxAttempts = count * 80;

    while (houses.length < count && attempts < maxAttempts) {
        attempts += 1;
        const latitude = 3 + rand() * 94; // avoid extreme edges
        const longitude = 3 + rand() * 94;
        if (!isLand(latitude, longitude)) {
            continue;
        }
        houses.push({
            id: `house-${houses.length + 1}`,
            label: `House ${houses.length + 1}`,
            latitude,
            longitude,
            delivered: false,
        });
    }

    // Fallback: if mask failed to place enough, fill remaining anywhere to avoid hanging
    while (houses.length < count) {
        const latitude = 3 + rand() * 94;
        const longitude = 3 + rand() * 94;
        houses.push({
            id: `house-${houses.length + 1}`,
            label: `House ${houses.length + 1}`,
            latitude,
            longitude,
            delivered: false,
        });
    }

    return houses;
};

const loadMapMask = (): Promise<MapMask | null> => {
    return new Promise((resolve) => {
        const image = new Image();
        image.src = "/simplified_world_map.png";
        image.crossOrigin = "anonymous";
        image.onload = () => {
            const canvas = document.createElement("canvas");
            canvas.width = image.naturalWidth;
            canvas.height = image.naturalHeight;
            const ctx = canvas.getContext("2d");
            if (!ctx) {
                resolve(null);
                return;
            }
            ctx.drawImage(image, 0, 0);
            const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height);
            resolve({ data, width, height });
        };
        image.onerror = () => resolve(null);
    });
};

type SantaGameProps = {
    compact?: boolean;
};

export function SantaGame({ compact = false }: SantaGameProps) {
    const [houses, setHouses] = useState<House[]>([]);
    const [maskLoaded, setMaskLoaded] = useState(false);
    const [santa, setSanta] = useState<Position>({ x: 48, y: 30 });
    const [targetId, setTargetId] = useState<string | null>(null);
    const [logs, setLogs] = useState<LogEntry[]>([
        {
            id: messageId(),
            text: "Autopilot engaged. Santa is handling every delivery on his own.",
        },
    ]);
    const [compliance, setCompliance] = useState<ComplianceState>({
        active: false,
        agency: null,
        stage: "idle",
    });
    const [isValidating, setIsValidating] = useState(false);
    const [draftSections, setDraftSections] = useState<DraftSections>(emptyDraft);
    const maskRef = useRef<MapMask | null>(null);

    // Use dedalus-react useChat hook for streaming (simple transport)
    const { messages: chatMessages, sendMessage, status: chatStatus, setMessages: setChatMessages, stop: stopChat } = useChat({
        transport: { api: "/api/compliance/draft" },
    });

    const isSending = chatStatus === "streaming";

    const santaRef = useRef<Position>(santa);
    const housesRef = useRef<House[]>(houses);
    const targetRef = useRef<string | null>(targetId);
    const complianceRef = useRef<ComplianceState>(compliance);
    const remainingRef = useRef<number>(0);

    const remainingDeliveries = useMemo(
        () => houses.filter((house) => !house.delivered).length,
        [houses],
    );

    useEffect(() => {
        santaRef.current = santa;
    }, [santa]);

    useEffect(() => {
        housesRef.current = houses;
    }, [houses]);

    useEffect(() => {
        targetRef.current = targetId;
    }, [targetId]);

    useEffect(() => {
        complianceRef.current = compliance;
        remainingRef.current = remainingDeliveries;
    }, [compliance, remainingDeliveries]);

    useEffect(() => {
        let cancelled = false;
        loadMapMask().then((mask) => {
            if (cancelled) {
                return;
            }
            maskRef.current = mask;
            const generated = generateHouses(200, mask);
            setHouses(generated);
            setMaskLoaded(true);
            setLogs((current) => [
                ...current.slice(-12),
                mask
                    ? { id: messageId(), text: "Loaded land mask. Houses placed only on land." }
                    : { id: messageId(), text: "Land mask unavailable. Houses placed anywhere." },
            ]);
        });
        return () => {
            cancelled = true;
        };
    }, []);

    useEffect(() => {
        let frame = 0;
        let last = performance.now();
        const speedPerSecond = 22;
        const arrivalRadius = 1.4;

        const pickNextTarget = () => {
            const remaining = housesRef.current.filter((house) => !house.delivered);
            if (remaining.length === 0) {
                targetRef.current = null;
                setTargetId(null);
                return;
            }
            const next = remaining[Math.floor(Math.random() * remaining.length)];
            targetRef.current = next.id;
            setTargetId(next.id);
            setLogs((current) => [
                ...current.slice(-12),
                { id: messageId(), text: `Routing to ${next.label} (${remaining.length} left after this).` },
            ]);
        };

        const step = (timestamp: number) => {
            const deltaSeconds = Math.min((timestamp - last) / 1000, 0.05);
            last = timestamp;

            if (compliance.active) {
                frame = requestAnimationFrame(step);
                return;
            }

            if (!targetRef.current) {
                pickNextTarget();
                frame = requestAnimationFrame(step);
                return;
            }

            const target = housesRef.current.find(
                (house) => house.id === targetRef.current && !house.delivered,
            );

            if (!target) {
                targetRef.current = null;
                setTargetId(null);
                frame = requestAnimationFrame(step);
                return;
            }

            const currentSanta = santaRef.current;
            const dx = target.longitude - currentSanta.x;
            const dy = target.latitude - currentSanta.y;
            const distance = Math.hypot(dx, dy);

            if (distance < arrivalRadius) {
                setHouses((prev) =>
                    prev.map((house) =>
                        house.id === target.id ? { ...house, delivered: true } : house,
                    ),
                );
                setLogs((current) => [
                    ...current.slice(-12),
                    { id: messageId(), text: `Delivered at ${target.label}.` },
                ]);
                targetRef.current = null;
                setTargetId(null);
                frame = requestAnimationFrame(step);
                return;
            }

            const magnitude = distance || 1;
            const deltaX = (dx / magnitude) * speedPerSecond * deltaSeconds;
            const deltaY = (dy / magnitude) * speedPerSecond * deltaSeconds;
            const nextSanta = {
                x: clamp(currentSanta.x + deltaX, 1, 99),
                y: clamp(currentSanta.y + deltaY, 1, 99),
            };
            santaRef.current = nextSanta;
            setSanta(nextSanta);

            frame = requestAnimationFrame(step);
        };

        frame = requestAnimationFrame(step);
        return () => cancelAnimationFrame(frame);
    }, [compliance.active]);

    const currentTarget = useMemo(
        () => houses.find((house) => house.id === targetId && !house.delivered),
        [houses, targetId],
    );

    const progressText = useMemo(() => {
        if (remainingDeliveries === 0) {
            return "All 200 houses received gifts. Autopilot is cooling down.";
        }
        if (remainingDeliveries < 10) {
            return "Finishing touches. Only a handful of rooftops left.";
        }
        return `${remainingDeliveries} houses in queue. Santa is auto-routing nonstop.`;
    }, [remainingDeliveries]);

    useEffect(() => {
        let timer: number | null = null;
        let cancelled = false;

        const triggerCompliance = () => {
            if (cancelled) {
                return;
            }
            const currentCompliance = complianceRef.current;
            const remaining = remainingRef.current;
            if (!currentCompliance.active && remaining > 0) {
                const agency = AGENCIES[Math.floor(Math.random() * AGENCIES.length)];
                setCompliance({ active: true, agency, stage: "alert" });
                // Clear previous chat and set initial context
                setChatMessages([
                    {
                        role: "assistant",
                        content: `Incident: ${agency} has flagged Santa's sleigh during Christmas Eve gift runs. Share the airspace segment, timing, reindeer-safe altitudes, and corrective steps so the elves can draft a festive, regulation-ready response.`,
                    },
                ] as Parameters<typeof setChatMessages>[0]);
                setDraftSections(emptyDraft);
                setLogs((current) => [
                    ...current.slice(-12),
                    { id: messageId(), text: `${agency} has filed an airspace compliance action. Deliveries paused.` },
                ]);
            }
            timer = window.setTimeout(triggerCompliance, 20000);
        };

        // quicker first hit so users see it soon
        timer = window.setTimeout(triggerCompliance, 5000);

        return () => {
            cancelled = true;
            if (timer) {
                clearTimeout(timer);
            }
        };
    }, []);

    const startDrafting = () => {
        setCompliance((prev) => ({ ...prev, stage: "drafting" }));
        setLogs((current) => [
            ...current.slice(-12),
            { id: messageId(), text: "Elf council is drafting the compliance case. Provide details." },
        ]);
    };

    const submitCase = () => {
        stopChat();
        setCompliance((prev) => ({ ...prev, stage: "submitted" }));
        setLogs((current) => [
            ...current.slice(-12),
            { id: messageId(), text: "Compliance case submitted. Resuming deliveries." },
        ]);
        setTimeout(() => {
            setCompliance({ active: false, agency: null, stage: "idle" });
            setChatMessages([] as Parameters<typeof setChatMessages>[0]);
            setDraftSections(emptyDraft);
        }, 1600);
    };

    // Update draft sections when assistant messages change
    useEffect(() => {
        const assistantMessages = chatMessages.filter((m) => m.role === "assistant");
        if (assistantMessages.length > 0) {
            const lastAssistant = assistantMessages[assistantMessages.length - 1];
            const content = lastAssistant.content;
            if (content && typeof content === "string") {
                setDraftSections(parseDraftContent(content));
            }
        }
    }, [chatMessages]);

    const sendChat = useCallback((content: string) => {
        if (!content.trim() || isSending) {
            return;
        }
        setDraftSections(emptyDraft);
        sendMessage(content);
    }, [isSending, sendMessage]);

    const validateCase = async () => {
        if (isValidating || chatMessages.length === 0) {
            return;
        }
        setIsValidating(true);
        try {
            const res = await fetch("/api/compliance/validate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ messages: chatMessages }),
            });
            const text = await res.text();
            setChatMessages((current) => [...current, { role: "assistant", content: text || "Validation complete." }]);
            setCompliance((prev) => ({ ...prev, stage: "ready" }));
        } catch (err) {
            setChatMessages((current) => [
                ...current,
                { role: "assistant", content: "Validation failed. Please retry." },
            ]);
        } finally {
            setIsValidating(false);
        }
    };

    return (
        <div
            className={
                compact
                    ? "relative isolate"
                    : "relative isolate grid gap-6 lg:grid-cols-[1.05fr,0.95fr] xl:grid-cols-[1.05fr,0.8fr]"
            }
        >
            <FestiveBackdrop />
            <SnowfallLayer />
            {compliance.active && (
                <ComplianceModal
                    agency={compliance.agency}
                    stage={compliance.stage}
                    onStartDrafting={startDrafting}
                    onSendMessage={sendChat}
                    onValidate={validateCase}
                    onSubmit={submitCase}
                    messages={chatMessages.map((m) => ({
                        role: m.role as "user" | "assistant" | "system",
                        content: typeof m.content === "string" ? m.content : "",
                    }))}
                    draft={draftSections}
                    isSending={isSending}
                    isValidating={isValidating}
                />
            )}
            <div className="flex flex-col gap-4">
                <div className="rounded-3xl border border-amber-100/80 bg-linear-to-br from-emerald-50/90 via-white to-rose-50/90 p-5 shadow-2xl backdrop-blur-md ring-2 ring-emerald-100/80 dark:border-white/10 dark:from-slate-900/80 dark:via-slate-900 dark:to-rose-950/70">
                    <div className="flex flex-wrap items-center justify-between gap-3 px-2 pb-2">
                        <div>
                            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-emerald-800 dark:text-emerald-300">
                                Santa Flight Map
                            </p>
                            <p className="text-sm text-emerald-950/80 dark:text-slate-200">{progressText}</p>
                        </div>
                        <div className="flex items-center gap-2 rounded-full bg-amber-50/90 px-3 py-1 text-xs font-semibold text-emerald-900 shadow-sm ring-1 ring-amber-200/80 dark:bg-emerald-900/70 dark:text-emerald-50">
                            🎁 Delivered {houses.length - remainingDeliveries}/{houses.length}
                        </div>
                    </div>

                    <div
                        className="relative w-full overflow-hidden rounded-2xl border border-emerald-100/80 bg-emerald-100/70 shadow-2xl ring-2 ring-emerald-200/60 dark:border-white/10 dark:bg-slate-900"
                        style={{ aspectRatio: "16 / 9" }}
                    >
                        <div className="absolute inset-x-0 top-0 h-2 bg-[repeating-linear-gradient(135deg,#f87171_0,#f87171_12px,#fef9c3_12px,#fef9c3_24px)] opacity-90" />
                        <div
                            className="absolute inset-0"
                            style={{
                                backgroundImage: "url('/simplified_world_map.png')",
                                backgroundSize: "cover",
                                backgroundPosition: "center",
                                filter: "saturate(1.08) contrast(1.05)",
                                opacity: 0.98,
                            }}
                            aria-hidden
                        />

                        <div className="pointer-events-none absolute inset-0 bg-linear-to-b from-white/15 via-transparent to-amber-50/60 dark:from-slate-950/40 dark:via-slate-950/15 dark:to-slate-950/45" />
                        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_30%,rgba(52,211,153,0.32),transparent_35%),radial-gradient(circle_at_80%_20%,rgba(248,113,113,0.25),transparent_30%),radial-gradient(circle_at_60%_70%,rgba(251,191,36,0.24),transparent_35%)] dark:bg-[radial-gradient(circle_at_20%_30%,rgba(52,211,153,0.18),transparent_35%),radial-gradient(circle_at_80%_20%,rgba(248,113,113,0.18),transparent_30%),radial-gradient(circle_at_60%_70%,rgba(251,191,36,0.14),transparent_35%)]" />
                        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(transparent_96%,rgba(248,113,113,0.24)_100%)] mix-blend-multiply" />

                        {houses.map((house) => (
                            <div
                                key={house.id}
                                className="absolute -translate-x-1/2 -translate-y-1/2"
                                style={{
                                    left: `${house.longitude}%`,
                                    top: `${house.latitude}%`,
                                }}
                            >
                                <img
                                    src="/house.png"
                                    alt={`${house.label}`}
                                    className={`h-8 w-8 object-contain transition drop-shadow-md ${house.delivered ? "drop-shadow-[0_0_16px_rgba(22,163,74,0.95)]" : "drop-shadow-[0_0_10px_rgba(248,113,113,0.65)]"}`}
                                />
                            </div>
                        ))}

                        <div
                            className="absolute -translate-x-1/2 -translate-y-1/2"
                            style={{ left: `${santa.x}%`, top: `${santa.y}%` }}
                        >
                            <div className="relative flex items-center gap-2">
                                <img
                                    src="/santa-sleigh.png"
                                    alt="Santa sleigh"
                                    className="h-14 w-20 object-contain drop-shadow-[0_10px_24px_rgba(190,24,93,0.65)]"
                                    style={{ minWidth: "56px" }}
                                />
                                <div className="rounded-full bg-amber-50/90 px-2 py-1 text-[10px] font-semibold text-emerald-900 shadow-sm ring-1 ring-amber-200/80 backdrop-blur dark:bg-slate-800/90 dark:text-slate-100">
                                    {santa.x.toFixed(1)}%, {santa.y.toFixed(1)}%
                                </div>
                            </div>
                            <div className="absolute inset-0 -z-10 h-20 w-20 -translate-x-[26%] -translate-y-[28%] animate-pulse rounded-full bg-emerald-500/20 blur-2xl" />
                            <div className="absolute left-1/2 top-12 -translate-x-1/2 rounded-full bg-emerald-600 px-2 py-1 text-[10px] font-semibold text-white shadow-sm ring-1 ring-emerald-700/70 dark:bg-emerald-500">
                                Elves on autopilot
                            </div>
                        </div>
                    </div>

                    {!compact && (
                        <div className="grid gap-3 rounded-2xl bg-white/90 p-4 shadow-lg ring-1 ring-emerald-100/80 backdrop-blur-sm dark:bg-slate-900/85 dark:ring-white/10 sm:grid-cols-3">
                            <HintCard title="Hands-free" body="Controls are disabled. Santa routes and flies himself." />
                            <HintCard title="Routing" body="He picks a random undelivered house, flies there, and drops gifts." />
                            <HintCard title="Indicators" body="Green ring = delivered. Red glow = Santa's current position." />
                        </div>
                    )}
                </div>
            </div>

            {!compact && (
                <aside className="flex h-full flex-col gap-4 rounded-3xl border border-emerald-100/80 bg-linear-to-b from-white/95 via-emerald-50/70 to-rose-50/70 p-4 shadow-2xl backdrop-blur-md ring-2 ring-emerald-200/80 dark:border-white/10 dark:bg-slate-900/85">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-emerald-800 dark:text-emerald-200">
                                Autopilot Status
                            </p>
                            <p className="text-sm text-emerald-900/80 dark:text-slate-300">
                                Santa keeps moving to the next random house until all {houses.length} are green.
                            </p>
                        </div>
                        <div className="rounded-full bg-emerald-100 px-3 py-1 text-[11px] font-semibold text-emerald-900 shadow-sm ring-1 ring-emerald-200/70 dark:bg-emerald-900/40 dark:text-emerald-100">
                            {remainingDeliveries === 0 ? "Complete" : `${remainingDeliveries} left`}
                        </div>
                    </div>

                    <div className="flex flex-col gap-3 rounded-2xl border border-emerald-100/90 bg-white/90 p-3 shadow-inner ring-1 ring-emerald-200/80 dark:border-white/10 dark:bg-slate-950/70">
                        <div className="flex items-center justify-between">
                            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-800 dark:text-emerald-200">
                                Current target
                            </p>
                            <span className="rounded-full bg-amber-50 px-3 py-1 text-[11px] font-semibold text-emerald-900 shadow-sm ring-1 ring-amber-200/70 dark:bg-emerald-900/50 dark:text-emerald-100">
                                {currentTarget ? currentTarget.label : "Searching"}
                            </span>
                        </div>
                        <p className="text-sm text-emerald-950/80 dark:text-slate-200">
                            {currentTarget
                                ? "Santa is en route to this house. He will pick another one instantly after delivery."
                                : remainingDeliveries === 0
                                    ? "Every house is complete."
                                    : "Selecting the next destination automatically."}
                        </p>
                    </div>

                    <div className="flex-1 overflow-hidden rounded-2xl border border-emerald-100/80 bg-white/90 shadow-inner ring-1 ring-emerald-200/80 dark:border-white/10 dark:bg-slate-950/70">
                        <div className="h-72 space-y-2 overflow-y-auto p-3 text-sm leading-6 text-emerald-950/80 dark:text-slate-100">
                            {logs.map((entry) => (
                                <div key={entry.id} className="rounded-xl bg-emerald-50/90 px-3 py-2 text-emerald-900 shadow-sm ring-1 ring-emerald-100/80 dark:bg-slate-800/80 dark:text-slate-100">
                                    {entry.text}
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="space-y-2 rounded-2xl bg-white/90 p-3 shadow-lg ring-1 ring-emerald-100/80 dark:bg-slate-950/80 dark:ring-white/10">
                        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-800 dark:text-emerald-200">
                            Delivery list
                        </p>
                        <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
                            {houses.map((house) => (
                                <div
                                    key={house.id}
                                    className={`flex items-center justify-between rounded-xl border px-3 py-2 text-sm font-semibold shadow-sm ${house.delivered
                                            ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-100"
                                            : "border-rose-100 bg-rose-50 text-rose-800 dark:border-rose-900/50 dark:bg-slate-900 dark:text-rose-100"
                                        }`}
                                >
                                    <p>{house.label}</p>
                                    <span className="text-lg">{house.delivered ? "🎁" : "🕒"}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </aside>
            )}
        </div>
    );
}

// (cards removed; using single transcript view)

function ChatInput({ disabled, onSend, isSending }: { disabled: boolean; onSend: (val: string) => void; isSending: boolean }) {
    const [value, setValue] = useState("");

    const handleSend = () => {
        if (!value.trim()) {
            return;
        }
        onSend(value);
        setValue("");
    };

    return (
        <div className="flex w-full flex-col items-stretch gap-2 sm:flex-row sm:items-center">
            <textarea
                className="h-20 min-w-[240px] flex-1 resize-none rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm text-emerald-950 shadow-inner outline-none ring-1 ring-emerald-100 focus:ring-2 focus:ring-emerald-400 disabled:opacity-60"
                placeholder="Draft compliance arguments with the elves…"
                value={value}
                disabled={disabled}
                onChange={(e) => setValue(e.target.value)}
                onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                        e.preventDefault();
                        handleSend();
                    }
                }}
            />
            <button
                onClick={handleSend}
                disabled={disabled || isSending}
                className="h-12 sm:h-20 rounded-xl bg-emerald-500 px-4 text-sm font-semibold text-white shadow-md transition hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-60 sm:self-stretch"
            >
                {isSending ? "Sending…" : "Send"}
            </button>
        </div>
    );
}

function HintCard({ title, body }: { title: string; body: string }) {
    return (
        <div className="rounded-2xl border border-emerald-100 bg-white/90 p-3 text-sm text-emerald-900 shadow-sm ring-1 ring-emerald-100/70 dark:border-slate-800 dark:bg-slate-900/90 dark:text-slate-200">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-200">
                {title}
            </p>
            <p className="mt-1 leading-6">{body}</p>
        </div>
    );
}

function SnowfallLayer() {
    return (
        <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
            <Snowfall
                color="#ffffff"
                snowflakeCount={180}
                speed={[1.2, 2.4]}
                wind={[0.2, 1.1]}
                radius={[1.4, 3.2]}
                style={{ position: "absolute", width: "100%", height: "100%" }}
            />
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_15%_20%,rgba(255,255,255,0.14),transparent_32%),radial-gradient(circle_at_80%_15%,rgba(248,113,113,0.12),transparent_30%),radial-gradient(circle_at_60%_80%,rgba(52,211,153,0.12),transparent_35%)]" />
        </div>
    );
}

function FestiveBackdrop() {
    return (
        <div className="pointer-events-none absolute inset-0 -z-20 bg-linear-to-br from-emerald-800/70 via-rose-700/65 to-amber-700/70 blur-[1px]" />
    );
}

function ComplianceModal({
    agency,
    stage,
    onStartDrafting,
    onSendMessage,
    onValidate,
    onSubmit,
    messages,
    draft,
    isSending,
    isValidating,
}: {
    agency: string | null;
    stage: ComplianceStage;
    onStartDrafting: () => void;
    onSendMessage: (content: string) => void;
    onValidate: () => void;
    onSubmit: () => void;
    messages: ChatMessage[];
    draft: DraftSections;
    isSending: boolean;
    isValidating: boolean;
}) {
    const isDrafting = stage === "drafting";
    const isReady = stage === "ready";
    const isSubmitted = stage === "submitted";
    const showStart = stage === "alert";

    const imageSrc =
        isReady || isSubmitted
            ? "/elves_happy.png"
            : stage === "alert"
                ? "/santa-getting-served.png"
                : "/elves_unhappy.png";
    const aspect = stage === "alert" ? "1264 / 1904" : "2860 / 1896";

    return (
        <div className="pointer-events-auto fixed inset-0 z-40 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
            <div className="relative w-full max-w-[80vw] max-h-[85vh] overflow-hidden rounded-3xl border-2 border-amber-200/70 bg-linear-to-br from-rose-900 via-amber-800 to-emerald-900 p-6 shadow-3xl">
                <div className="absolute -left-10 -top-10 h-40 w-40 animate-ping rounded-full bg-red-500/40 blur-3xl" />
                <div className="absolute -right-10 -bottom-10 h-40 w-40 animate-ping rounded-full bg-amber-400/40 blur-3xl" />
                <div className="relative z-10 grid items-start gap-6 md:grid-cols-[1.05fr,0.95fr]">
                    <div className="space-y-4">
                        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-amber-100">
                            Airspace Compliance Action
                        </p>
                        <h3 className="mt-2 text-2xl font-semibold text-white drop-shadow">
                            {agency ?? "Airspace regulator"} has halted Santa&apos;s flight.
                        </h3>
                        <p className="mt-3 text-sm text-amber-100/90">
                            Deliveries are paused. Draft a compliance case with the Dedalus MCP agent (akakak/sonar) and
                            submit to resume.
                        </p>

                        <div className="mt-4 flex flex-wrap items-center gap-3">
                            {showStart && (
                                <button
                                    onClick={onStartDrafting}
                                    className="rounded-full bg-amber-200 px-4 py-2 text-sm font-semibold text-rose-900 shadow-lg ring-2 ring-amber-300 transition hover:scale-[1.02]"
                                >
                                    Start Drafting Compliance Case
                                </button>
                            )}
                            {isDrafting && (
                                <div className="flex items-center gap-2 rounded-full bg-amber-100/90 px-4 py-2 text-sm font-semibold text-rose-900 shadow">
                                    <span className="h-2 w-2 animate-ping rounded-full bg-red-500" />
                                    Drafting with Dedalus MCP…
                                </div>
                            )}
                            {isDrafting && (
                                <>
                                    <button
                                        onClick={onValidate}
                                        disabled={isValidating}
                                        className="rounded-full bg-amber-200 px-4 py-2 text-sm font-semibold text-rose-900 shadow ring-1 ring-amber-300 transition hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-60"
                                    >
                                        {isValidating ? "Elves validating..." : "Validate with Elves"}
                                    </button>
                                    <button
                                        onClick={onSubmit}
                                        disabled={!isReady}
                                        className="rounded-full bg-emerald-400 px-4 py-2 text-sm font-semibold text-emerald-950 shadow ring-1 ring-emerald-500 transition hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-60"
                                    >
                                        Submit Compliance Case
                                    </button>
                                </>
                            )}
                            {isReady && (
                                <button
                                    onClick={onSubmit}
                                    className="rounded-full bg-emerald-400 px-4 py-2 text-sm font-semibold text-emerald-950 shadow-lg ring-2 ring-emerald-500 transition hover:scale-[1.02]"
                                >
                                    Submit Compliance Case
                                </button>
                            )}
                            {isSubmitted && (
                                <span className="rounded-full bg-emerald-200 px-4 py-2 text-sm font-semibold text-emerald-900 shadow">
                                    Case submitted. Resuming flight.
                                </span>
                            )}
                        </div>
                    </div>

                    <div className="grid gap-3 md:grid-cols-5">
                        <div className="overflow-hidden rounded-2xl border-2 border-amber-200/70 bg-black/40 shadow-2xl col-span-3">
                            <div
                                className="relative w-full max-h-[60vh]"
                                style={{ aspectRatio: aspect }}
                            >
                                {stage === "alert" && (
                                    <div className="pointer-events-none absolute inset-x-0 top-0 flex justify-center">
                                        <div className="mt-3 rounded-full bg-black/70 px-4 py-2 text-sm font-semibold uppercase tracking-[0.18em] text-amber-50 shadow-lg ring-2 ring-amber-300/70">
                                            SANTA HAS BEEN SERVED!
                                        </div>
                                    </div>
                                )}
                                <img src={imageSrc} alt="Compliance event" className="h-full w-full object-contain" />
                            </div>
                            <div className="bg-linear-to-r from-red-500/60 via-amber-400/60 to-emerald-500/60 px-3 py-2 text-center text-xs font-semibold uppercase tracking-[0.3em] text-white">
                                {stage === "alert"
                                    ? "Violation detected — deliveries halted"
                                    : isDrafting
                                        ? "Drafting compliance case with MCP agent"
                                        : isReady
                                            ? "Case ready — submit to continue"
                                            : "Case accepted — flight resuming"}
                            </div>
                            <div className="flex-1 min-w-[340px] p-4">
                                <ChatInput
                                    disabled={isSending || stage === "alert"}
                                    onSend={onSendMessage}
                                    isSending={isSending}
                                />
                            </div>
                        </div>

                        <div className="flex h-full min-h-0 flex-col gap-4 rounded-2xl border-2 border-emerald-200/60 bg-white/95 p-4 text-emerald-950 shadow-2xl col-span-2 max-h-[85vh]">
                            <div className="flex items-center justify-between">
                                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-800">
                                    Live compliance stream
                                </p>
                                <div className="rounded-full bg-amber-100 px-3 py-1 text-[11px] font-semibold text-rose-900 ring-1 ring-amber-200">
                                    akakak/sonar
                                </div>
                            </div>

                            <div className="flex-1 min-h-0 overflow-hidden rounded-2xl border border-emerald-100 bg-emerald-50/60 shadow-inner">
                                <div className="flex items-center justify-between border-b border-emerald-100 bg-white/70 px-4 py-2">
                                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-800">
                                        Live draft transcript
                                    </p>
                                    <span className="rounded-full bg-emerald-100 px-3 py-1 text-[11px] font-semibold text-emerald-900 ring-1 ring-emerald-200">
                                        Streaming
                                    </span>
                                </div>
                                <div className="max-h-72 overflow-y-auto px-5 py-4 text-sm leading-7 whitespace-pre-wrap">
                                    {draft.raw || "Waiting for elves to stream the memo…"}
                                </div>
                            </div>

                            <div className="rounded-2xl border border-emerald-100 bg-emerald-50/60 p-3 text-sm">
                                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-800">
                                    References
                                </p>
                                <div className="mt-2 max-h-40 overflow-y-auto space-y-2 pr-1">
                                    {draft.references.length === 0 && (
                                        <div className="text-emerald-800/80">Awaiting citations from sonar…</div>
                                    )}
                                    {draft.references.map((ref, idx) => (
                                        <div key={`${ref}-${idx}`} className="rounded-lg bg-white/90 px-3 py-2 text-emerald-900 shadow-sm ring-1 ring-emerald-100">
                                            <span className="font-semibold text-emerald-700">• </span>
                                            {ref}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
