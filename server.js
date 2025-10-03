import express from "express";
import axios from "axios";
import * as cheerio from "cheerio";

const app = express();
const PORT = 3000;

async function tactics_list_id(url) {
  const { data } = await axios.get(url);
  const $ = cheerio.load(data);
  const results = [];
  $('div.tables-mobile table tbody tr').each((i, row) => {
    const $row = $(row);
    const link = $row.find('td a').first().attr('href');
    const idFromHref = link ? link.split('/').pop() : null;
    if (idFromHref) results.push(idFromHref);
  });
  return results;
}

async function tactics() {
  const url = "https://attack.mitre.org/tactics/enterprise/";
  const { data } = await axios.get(url);
  const $ = cheerio.load(data);
  const results = [];
  $('div.tables-mobile table tbody tr').each((i, row) => {
    const $row = $(row);
    const idHref = $row.find('td').eq(0).find('a').attr('href') || null;
    const id_mapping = idHref ? idHref.split('/').pop() : null;
    const title = $row.find('td').eq(1).text().trim();
    const description = $row.find('td').eq(2).text().replace(/\s+/g, ' ').trim();
    if (id_mapping) {
      results.push({ id_mapping, title, description });
    }
  });

  return results;
}

async function techniques() {
  const url_get_data = "https://attack.mitre.org/tactics/enterprise/";
  const get_data = await tactics_list_id(url_get_data); // array of ids
  const results = [];

  for (const id_mapping of get_data) {
    try {
      const get_tactics = `https://attack.mitre.org/tactics/${id_mapping}`;
      const { data } = await axios.get(get_tactics);
      const $ = cheerio.load(data);

      $('tr.technique').each((i, el) => {
        const $row = $(el);
        if ($row.hasClass('sub')) return;

        const $td_id_technique = $row.find('td').eq(0);
        const id_technique = $td_id_technique.find('a').first().text().trim();
        const id_technique_href = $td_id_technique.find('a').first().attr('href') || null;

        const title = $row.find('td').eq(1).find('a').first().text().trim();
        const description = $row.find('td').last().text().replace(/\u00A0/g, ' ').replace(/\s+/g, ' ').trim();

        const sub_techniques = [];
        let $next = $row.next();
        while ($next.length && $next.hasClass('sub')) {
          const $subTdCode = $next.find('td').eq(1);
          const id_sub_technique_href = $subTdCode.find('a').first().attr('href') || null;
          const id_sub_technique = id_sub_technique_href ? id_sub_technique_href.split('/').pop() : $subTdCode.find('a').first().text().trim();
          const title = $next.find('td').eq(2).find('a').first().text().trim();
          const description = $next.find('td').last().text().replace(/\u00A0/g, ' ').replace(/\s+/g, ' ').trim();

          sub_techniques.push({
            id_sub_technique,
            // id_sub_technique_href,
            title,
            description
          });
          $next = $next.next();
        }

        results.push({
          id_mapping,
          title,
          description,
          techniques: {
            id_technique,
            title,
            description,
            sub_techniques
          },
        });
      });
    } catch (err) {
      results.push({ id, error: err.message });
    }
  }

  return results;
}

app.get("/techniques", async (req, res) => {
  try {
    const data = await techniques();
    // console.log(data);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/tactics", async (req, res) => {
  try {
    const data = await tactics();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
})

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
