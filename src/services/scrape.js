const puppeteer = require("puppeteer");

async function getRanking(keyword, siteUrl) {
  const browser = await puppeteer.launch({
    executablePath: "/usr/bin/google-chrome", // Use system-installed Chrome
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"], // Required for deployment
  });

  const page = await browser.newPage();

  try {
    // Use a real browser user-agent to prevent detection
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36"
    );

    await page.goto(
      `https://www.google.com/search?q=${encodeURIComponent(keyword)}`,
      { waitUntil: "domcontentloaded", timeout: 30000 }
    );

    // Wait for search results to load
    await page.waitForSelector("div.tF2Cxc a", { timeout: 5000 });

    // Scrape Google search results
    const results = await page.evaluate(() => {
      return [...document.querySelectorAll("div.tF2Cxc a")].map((a) => a.href);
    });

    await browser.close();

    // Normalize URLs (remove 'www.' if present)
    const normalizeUrl = (url) => url.replace(/^https?:\/\/(www\.)?/, "");

    const position =
      results.findIndex((url) =>
        normalizeUrl(url).includes(normalizeUrl(siteUrl))
      ) + 1;

    return position > 0 ? position : "Not found";
  } catch (error) {
    console.error("Error scraping rankings:", error);
    await browser.close();
    return "Error fetching ranking";
  }
}

module.exports = { getRanking };
