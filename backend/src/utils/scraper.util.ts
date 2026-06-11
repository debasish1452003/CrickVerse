import axios from "axios";
import * as cheerio from "cheerio";

export const fetchNextDataJson = async (url: string) => {
  try {
    console.log(`📡 Fetching data from: ${url}`);
    const { data } = await axios.get(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
        Referer: "https://www.google.com/",
      },
    });

    const $ = cheerio.load(data);
    const nextDataStr = $("#__NEXT_DATA__").html();

    if (!nextDataStr) {
      throw new Error(
        "❌ No __NEXT_DATA__ found. Blocked by WAF or page structure changed.",
      );
    }

    return JSON.parse(nextDataStr);
  } catch (error: any) {
    console.error(`❌ Failed to fetch JSON for ${url}:`, error.message);
    return null;
  }
};
