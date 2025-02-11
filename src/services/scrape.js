const puppeteer = require("puppeteer");

async function getRanking(keyword, siteUrl) {
  const browser = await puppeteer.launch({
    headless: "new",
    args: ["--no-sandbox"], // Required for deployment
  });
  const page = await browser.newPage();

  try {
    await page.goto(
      `https://www.google.com/search?q=${encodeURIComponent(keyword)}`,
      { waitUntil: "domcontentloaded", timeout: 30000 } // Timeout for page load
    );

    // Scrape Google search results
    const results = await page.evaluate(() => {
      return [...document.querySelectorAll("div.tF2Cxc a")].map((a) => a.href);
    });

    await browser.close();

    const position = results.findIndex((url) => url.includes(siteUrl)) + 1;
    return position > 0 ? position : "Not found";
  } catch (error) {
    console.error("Error scraping rankings:", error);
    await browser.close();
    return "Error fetching ranking";
  }
}

module.exports = { getRanking };
