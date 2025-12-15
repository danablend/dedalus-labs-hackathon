"use client";

import Snowfall from "react-snowfall";

export function SnowOverlay() {
    return (
        <div className="pointer-events-none fixed inset-0 z-50 overflow-hidden">
            <Snowfall
                color="#ffffff"
                snowflakeCount={220}
                speed={[1.2, 2.6]}
                wind={[0.2, 1.2]}
                radius={[1.4, 3.2]}
                style={{ position: "absolute", width: "100%", height: "100%" }}
            />
        </div>
    );
}

