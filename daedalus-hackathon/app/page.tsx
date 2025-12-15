import { SantaGame } from "./components/santa-game";

export default function Home() {
    return (
        <div className="relative min-h-screen overflow-hidden bg-linear-to-br from-rose-900 via-amber-800 to-emerald-800 px-6 py-12 text-amber-50">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_18%,rgba(248,113,113,0.3),transparent_32%),radial-gradient(circle_at_82%_28%,rgba(52,211,153,0.28),transparent_30%),radial-gradient(circle_at_50%_78%,rgba(251,191,36,0.3),transparent_28%)]" />
            <main className="relative mx-auto flex w-full max-w-7xl flex-col gap-8 drop-shadow-[0_28px_80px_rgba(0,0,0,0.26)]">
                <SantaGame compact />
            </main>
        </div>
    );
}
