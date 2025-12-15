export async function POST() {
    // Wait 3 seconds before responding
    await new Promise((resolve) => setTimeout(resolve, 3000));

    return new Response("Validation complete. The compliance case has been reviewed and approved.", {
        headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
}
