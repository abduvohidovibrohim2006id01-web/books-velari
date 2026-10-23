export async function submitToIndexNow(urlList: string[]) {
    const key = "6f9b4c2d8e1a4f3b8c5d9e2a7f0b1c3d";
    const host = "velari.uz";

    try {
        console.log(`Submitting ${urlList.length} URLs to IndexNow...`);
        const response = await fetch("https://api.indexnow.org/indexnow", {
            method: "POST",
            headers: {
                "Content-Type": "application/json; charset=utf-8",
            },
            body: JSON.stringify({
                host: host,
                key: key,
                keyLocation: `https://${host}/${key}.txt`,
                urlList: urlList,
            }),
        });

        if (!response.ok) {
            const error = await response.text();
            console.error("IndexNow Submission Failed:", error);
            return false;
        }

        console.log("IndexNow Submission Successful");
        return true;
    } catch (error) {
        console.error("IndexNow Error:", error);
        return false;
    }
}
