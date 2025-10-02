import express from "express";
import axios from "axios";
import * as cheerio from "cheerio";

const app = express();
const PORT = 3000;

async function scrape(id_tactics) {
  try {
    const url = "https://attack.mitre.org/tactics/" + id_tactics;
    const { data } = await axios.get(url);
    const $ = cheerio.load(data);
    const results = [];

    $('tr.technique').each((i, el) => {
      const $row = $(el);
      if ($row.hasClass('sub')) return;

      const $tdCode = $row.find('td').eq(0);
      const code = $tdCode.find('a').first().text().trim();
      const codeHref = $tdCode.find('a').first().attr('href') || null;

      const title = $row.find('td').eq(1).find('a').first().text().trim();
      const desc = $row.find('td').last().text().replace(/\u00A0/g, ' ').replace(/\s+/g, ' ').trim();

      const subs = [];
      let $next = $row.next();
      while ($next.length && $next.hasClass('sub')) {
        const $subTdCode = $next.find('td').eq(1);
        const subCodeHref = $subTdCode.find('a').first().attr('href') || null;
        const subCode = subCodeHref ? subCodeHref.split('/').pop() : $subTdCode.find('a').first().text().trim();
        const subTitle = $next.find('td').eq(2).find('a').first().text().trim();
        const subDesc = $next.find('td').last().text().replace(/\u00A0/g, ' ').replace(/\s+/g, ' ').trim();

        subs.push({ subCode, subCodeHref, subTitle, subDesc });
        $next = $next.next();
      }

      results.push({ code, codeHref, title, description: desc, subs });
    });
    return results
  } catch (err) {
    return { error: err.message };
  }
}

app.get("/tactics/:id_tactics", async (req, res) => {
  const { id_tactics } = req.params;
  const data = await scrape(id_tactics);
  res.json(data);
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
