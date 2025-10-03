import mysql from "mysql2/promise";
import express from "express";
import axios from "axios";
import * as cheerio from "cheerio";

const db = await mysql.createConnection({
  host: "localhost",
  port: "3306",
  user: "root",
  // password: "M4gs3r@s",
  password: "Harlan123@",
  database: "msa_v2"
})

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

async function save_ttp_mapping() {
  const data = await tactics()
  for (const item of data) {
    console.log('=========================')
    console.log('Mencoba query MAPPING:')
    const [check_data] = await db.execute(
      `SELECT * FROM ttp_mapping WHERE id_mapping = ?`, [item.id_mapping]
    );
    if (check_data.length === 0) {
      console.log('Insert.....')
      db.execute(`INSERT INTO ttp_mapping VALUES (?, ?, ?)`, [item.id_mapping, item.title, item.description])
    }
    else {
      console.log('Update.....')
      db.execute(`UPDATE ttp_mapping SET title = ?, description = ? WHERE id_mapping = ?`, [item.title, item.description, item.id_mapping])
    }
    console.log('Berhasil!!!')
  }
  return data;
}

async function save_ttp_mapping_technique_subtechnique() {
  const data = await techniques();

  for (const item of data) {
    console.log("Proses Mapping:", item.id_mapping);

    // === 1. Insert / Update Mapping ===
    const [check_mapping] = await db.execute(
      "SELECT * FROM ttp_mapping WHERE id_mapping = ?",
      [item.id_mapping]
    );

    if (check_mapping.length === 0) {
      await db.execute(
        "INSERT INTO ttp_mapping (id_mapping, title, description) VALUES (?, ?, ?)",
        [item.id_mapping, item.title, item.description]
      );
      console.log("Insert Mapping:", item.id_mapping);
    } else {
      await db.execute(
        "UPDATE ttp_mapping SET title = ?, description = ? WHERE id_mapping = ?",
        [item.title, item.description, item.id_mapping]
      );
      console.log("Update Mapping:", item.id_mapping);
    }

    // === 2. Insert / Update Techniques ===
    const tech = item.techniques;
    const [check_tech] = await db.execute(
      "SELECT * FROM ttp_techniques WHERE id_techniques = ?",
      [tech.id_technique]
    );

    if (check_tech.length === 0) {
      await db.execute(
        "INSERT INTO ttp_techniques (id_techniques, title, description) VALUES (?, ?, ?)",
        [tech.id_technique, tech.title, tech.description]
      );
      console.log("Insert Technique:", tech.id_technique);
    } else {
      await db.execute(
        "UPDATE ttp_techniques SET title = ?, description = ? WHERE id_techniques = ?",
        [tech.title, tech.description, tech.id_technique]
      );
      console.log("Update Technique:", tech.id_technique);
    }

    // === 3. Insert / Update Sub-Techniques ===
    for (const sub of tech.sub_techniques) {
      const [check_sub] = await db.execute(
        "SELECT * FROM ttp_subtechniques WHERE id_sub_technique = ? AND techniques_id = ?",
        [sub.id_sub_technique, tech.id_technique]
      );

      if (check_sub.length === 0) {
        await db.execute(
          "INSERT INTO ttp_subtechniques (id_sub_technique, title, description, techniques_id) VALUES (?, ?, ?, ?)",
          [sub.id_sub_technique, sub.title, sub.description, tech.id_technique]
        );
        console.log("Insert Sub-Technique:", sub.id_sub_technique);
      } else {
        await db.execute(
          "UPDATE ttp_subtechniques SET title = ?, description = ? WHERE id_sub_technique = ? AND techniques_id = ?",
          [sub.title, sub.description, sub.id_sub_technique, tech.id_technique]
        );
        console.log("Update Sub-Technique:", sub.id_sub_technique);
      }
    }
  }

  console.log("=== Semua Data Berhasil Diproses ===");
}



async function get_data_mapping() {
  const data = await tactics();
  return data
}


app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
  save_ttp_mapping()
  // save_ttp_mapping_technique_subtechnique()
});
