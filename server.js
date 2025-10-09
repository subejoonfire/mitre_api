import mysql from "mysql2/promise";
import express from "express";
import axios from "axios";
import * as cheerio from "cheerio";

const db = await mysql.createConnection({
  // host: "192.168.92.2",
  host: "localhost",
  port: "3306",
  user: "root",
  // password: "M4gs3r@s",
  password: "Harlan123@",
  database: "msa_v2",
  charset: "utf8mb4", // pastikan pakai utf8mb4
  rowsAsArray: false, // defaultnya false, biar return object
  namedPlaceholders: true
})

const app = express();
app.use(express.json());
const PORT = 3000;

async function get_id_tactic(url) {
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
    const id_tactic = idHref ? idHref.split('/').pop() : null;
    const title = $row.find('td').eq(1).text().trim();
    const description = $row.find('td').eq(2).text().replace(/\s+/g, ' ').trim();
    if (id_tactic) {
      results.push({ id_tactic, title, description });
    }
  });

  return results;
}

async function techniques() {
  const url_get_data = "https://attack.mitre.org/tactics/enterprise/";
  const get_data = await get_id_tactic(url_get_data);
  const results = [];

  for (const id_tactic of get_data) {
    try {
      const get_tactics = `https://attack.mitre.org/tactics/${id_tactic}`;
      const { data } = await axios.get(get_tactics);
      const $ = cheerio.load(data);

      $('tr.technique').each((i, el) => {
        const $row = $(el);
        if ($row.hasClass('sub')) return;

        const $td_id_technique = $row.find('td').eq(0);
        const id_technique = $td_id_technique.find('a').first().text().trim();

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
            title,
            description
          });
          $next = $next.next();
        }

        results.push({
          id_tactic,
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
      results.push({ error: err.message });
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

app.get("/update_api", (req, res) => {
  save_tactics_techniques_subtechniques()
    .then(() => {
      res.status(200).json({
        'status': 'OK'
      })
    })
    .catch((err) => {
      res.status(500).json({
        'error': err
      })
    })
})
async function get_ttp(list_rule_name, msa_number) {
  const placeholders = list_rule_name.map(() => '?').join(', ');

  // Destructure dua hasil dari db.execute: rows dan fields
  const [rows] = await db.execute(
    `SELECT
      ttp_ttp.id AS id,
      ttp_ttp.id_ttp AS id_ttp,
      ttp_ttp.name AS ttp_name,
      ttp_ttp.override_id AS override_id,
      ttp_ttp.has_ibm_default AS has_ibm_default,
      ttp_ttp.last_updated AS last_updated,
      ttp_ttp.msa_number AS msa_number,
      ttp_ttp.min_mitre_version AS min_mitre_version,
      ttp_ttptactics.tactics_id AS tactics_id,
      ttp_ttptactics.name AS tactics_name,
      ttp_ttptactics.confidence AS tactics_confidence,
      ttp_ttptactics.user_override AS tactics_user_override,
      ttp_ttptactics.enabled AS tactics_enabled,
      ttp_ttptactics.ibm_default AS tactics_ibm_default,
      ttp_ttptacticstechniques.techniques_id AS technique_id,
      ttp_ttptacticstechniques.name AS technique_name,
      ttp_ttptacticstechniques.confidence AS technique_confidence,
      ttp_ttptacticstechniques.enabled AS technique_enabled,
      ttp_ttptacticstechniques.parent_technique_name AS parent_technique_name,
      ttp_tactics.id_tactics AS tactics_id_tactics,
      ttp_tactics.title AS tactics_title,
      ttp_tactics.description AS tactics_description,
      ttp_techniques.id_techniques AS technique_id_techniques,
      ttp_techniques.title AS technique_title,
      ttp_techniques.description AS technique_description,
      ttp_subtechniques.techniques_id AS subtechnique_techniques_id,
      ttp_subtechniques.id_sub_technique AS subtechnique_id_sub_technique,
      ttp_subtechniques.title AS subtechnique_title,
      ttp_subtechniques.description AS subtechnique_description
    FROM ttp_ttp
    INNER JOIN ttp_ttptactics
      ON ttp_ttptactics.ttp_id = ttp_ttp.id
    INNER JOIN ttp_ttptacticstechniques
      ON ttp_ttptacticstechniques.tactic_id = ttp_ttptactics.ttp_id
    LEFT JOIN ttp_tactics
      ON ttp_tactics.id_tactics = ttp_ttptactics.tactics_id
    LEFT JOIN ttp_techniques  
      ON ttp_techniques.tactics_id = ttp_tactics.id_tactics
    LEFT JOIN ttp_subtechniques
      ON ttp_subtechniques.techniques_id = ttp_techniques.id_techniques
    WHERE ttp_ttp.name IN (${placeholders})
    AND ttp_ttp.msa_number = ?`,
    [...list_rule_name, msa_number]
  );

  return rows; // ✅ return hanya data barisnya
}
function mapTTPData(rows) {
  const result = {};
  const rulesArr = [];
  const tacticsArr = [];
  const tacticIdArr = [];
  const techniquesArr = [];
  const techniqueIdArr = [];

  for (const row of rows) {
    const ruleName = row.ttp_name || row.name;
    if (!ruleName) continue;

    // --- RULE ---
    if (!result[ruleName]) {
      if (!rulesArr.includes(ruleName)) rulesArr.push(ruleName);
      result[ruleName] = {
        id: row.id_ttp || row.id,
        override_id: row.override_id,
        has_ibm_default: row.has_ibm_default,
        last_updated: row.last_updated,
        mapping: {},
        min_mitre_version: row.min_mitre_version
      };
    }

    const mapping = result[ruleName].mapping;

    // --- TACTIC ---
    const tacticsTitle = row.tactics_title;
    const tacticsName = row.tactics_name;
    const tacticsIdTactics = row.tactics_id_tactics;
    const tacticsId = row.tactics_id;
    const tacticKey = tacticsTitle || tacticsName || tacticsId || 'UNKNOWN_TACTIC';

    if (!tacticsArr.includes(tacticsTitle)) tacticsArr.push(tacticsTitle);
    if (!mapping[tacticKey]) {
      if (!tacticIdArr.includes(tacticsIdTactics)) tacticIdArr.push(tacticsIdTactics);
      mapping[tacticKey] = {
        confidence: row.tactics_confidence,
        user_override: row.tactics_user_override,
        enabled: row.tactics_enabled,
        ibm_default: row.tactics_ibm_default,
        id: tacticsId,
        title: tacticsTitle,
        description: row.tactics_description,
        techniques: {}
      };
    }

    const techniques = mapping[tacticKey].techniques;

    // --- TECHNIQUE ---
    const techniqueTitle = row.technique_title;
    const techniqueName = row.technique_name;
    const techniqueId = row.technique_id_techniques;
    const techniqueKey = techniqueTitle || techniqueName || techniqueId || 'UNKNOWN_TECHNIQUE';

    if (!techniquesArr.includes(techniqueTitle)) techniquesArr.push(techniqueTitle);
    if (!techniques[techniqueKey]) {
      if (!techniqueIdArr.includes(techniqueId)) techniqueIdArr.push(techniqueId);
      techniques[techniqueKey] = {
        id: techniqueId,
        title: techniqueTitle || techniqueName,
        description: row.technique_description,
        subtechniques: {}
      };
    }

    const subtechniques = techniques[techniqueKey].subtechniques;

    // --- SUBTECHNIQUE ---
    const subId = row.subtechnique_id_sub_technique || row.id_sub_technique;
    const subTitle = row.subtechnique_title;
    const subDesc = row.subtechnique_description;
    const subTechniquesId = row.subtechnique_techniques_id || row.techniques_id;

    if (subId) {
      if (!subtechniques[subId]) {
        subtechniques[subId] = {
          id_sub_technique: `${subTechniquesId}.${subId}`,
          title: subTitle,
          description: subDesc
        };
      } else {
        const existing = subtechniques[subId];
        if (!existing.title && subTitle) existing.title = subTitle;
        if (!existing.description && subDesc) existing.description = subDesc;
      }
    } else if (subTitle) {
      const autoKey = `sub_${Object.keys(subtechniques).length + 1}`;
      subtechniques[autoKey] = {
        id_sub_technique: `${subTechniquesId}`,
        title: subTitle,
        description: subDesc
      };
    }
  }

  // --- Konversi subtechniques jadi list ---
  for (const rule of Object.values(result)) {
    for (const tactic of Object.values(rule.mapping)) {
      for (const tech of Object.values(tactic.techniques)) {
        const subDict = tech.subtechniques;
        tech.subtechniques = Object.values(subDict);
      }
    }
  }

  return { result, rulesArr, tacticsArr, tacticIdArr, techniquesArr, techniqueIdArr };
}


app.post("/get_ttp/:msa_number", async (req, res) => {
  const { msa_number } = req.params;
  const { list_rule_name } = req.body;
  try {
    const data = await get_ttp(list_rule_name, msa_number);
    const mapped = mapTTPData(data);
    return res.status(200).json(mapped);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

async function save_tactics() {
  const data = await tactics()
  for (const item of data) {
    console.log('Proses Insert/Update Tactics:')
    const [check_data] = await db.execute(
      `SELECT * FROM ttp_tactics WHERE id_tactics = ?`, [item.id_tactic]
    );
    if (check_data.length === 0) {
      console.log('Insert.....')
      db.execute(`INSERT INTO ttp_tactics VALUES (?, ?, ?)`, [item.id_tactic, item.title, item.description])
    }
    else {
      console.log('Update.....')
      db.execute(`UPDATE ttp_tactics SET title = ?, description = ? WHERE id_tactics = ?`, [item.title, item.description, item.id_tactic])
    }
  }
}

async function save_tactics_techniques_subtechniques() {
  // === 1. Insert / Update Tactics ===
  save_tactics()
  const data = await techniques();
  for (const item of data) {
    console.log("Proses Insert/Update Techniques dan Sub-Techniques:", item.id_tactic);
    // === 2. Insert / Update Techniques ===
    if (!item.techniques) {
      console.log("⚠️ Skip karena item.techniques undefined untuk tactic:", item.id_tactic);
      continue;
    }

    const tech = item.techniques;
    if (!tech.id_technique) {
      console.log("⚠️ Skip karena id_technique kosong:", item.id_tactic);
      continue;
    }

    const [check_tech] = await db.execute(
      "SELECT * FROM ttp_techniques WHERE id_techniques = ?",
      [tech.id_technique]
    );

    if (check_tech.length === 0) {
      await db.execute(
        "INSERT INTO ttp_techniques (id_techniques, title, description, tactics_id) VALUES (?, ?, ?, ?)",
        [tech.id_technique, tech.title, tech.description, item.id_tactic]
      );
      console.log("Insert Technique:", tech.id_technique);
    } else {
      await db.execute(
        "UPDATE ttp_techniques SET title = ?, description = ?, tactics_id = ? WHERE id_techniques = ?",
        [tech.title, tech.description, item.id_tactic, tech.id_technique]
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

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
  console.log('=============================')
  // save_tactics_techniques_subtechniques()
});
