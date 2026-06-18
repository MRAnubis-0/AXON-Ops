// Cloudflare Worker: parse AXON ClearView real-time detail XML into JSON.
// Accepts a POST whose body is the raw JSF partial-response XML returned by the
// `dsl:dateSelectorForm:dateSelector` request and returns the extracted fields.

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
};

export default {
  async fetch(request) {

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    if (request.method !== "POST") {
      return json(
        { error: "  بتعمل ايه هنا ؟؟    بطَل لعب يا حبيبي" },
        405
      );
    }

    try {
      const xml = await request.text();

      const result = {
        collectionDate: extractField(xml, "Collection Date"),
        profile: extractField(xml, "Profile"),
        runningStandard: extractField(xml, "Running Standard"),
        stability: extractField(xml, "Stability"),
        synchRate: parseRateField(extractField(xml, "Synch Rate")),
        maxAchievableBitRate: parseRateField(extractField(xml, "Max. Achievable Bit Rate")),
        cableDiagnostics: extractField(xml, "Cable Diagnostics (OSPM)"),
        profileOptimizationStatus: extractField(xml, "Profile Optimization Status"),
        diagnostics: extractField(xml, "Diagnostics"),
        dispatchScore: extractField(xml, "Dispatch Score"),
        messagePanel: extractMessagePanel(xml),
        history: {
          dsMabr: extractChartSeries(xml, "Estimated DS MABR \\(kbps\\)"),
          dsSyncRate: extractChartSeries(xml, "DS Sync Rate\\(kbps\\)")
        }
      };

      return json(result, 200);

    } catch (err) {
      return json({ success: false, error: err.message }, 500);
    }
  }
};

function json(body, status) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS }
  });
}

function extractField(xml, label) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  // Anchor on the bold detail-label span so "Diagnostics" does not match inside
  // "Cable Diagnostics (OSPM)" and grab the wrong cell.
  let rowMatch = xml.match(
    new RegExp(">" + escaped + "</span></td>\\s*<td>([\\s\\S]*?)</td>", "i")
  );

  // Fallback to the looser match if the anchored one fails.
  if (!rowMatch) {
    rowMatch = xml.match(new RegExp(escaped + "[\\s\\S]*?<td>([\\s\\S]*?)<\\/td>", "i"));
  }

  if (!rowMatch) return null;

  const td = rowMatch[1];
  const values = [];
  const valueRegex = /nextDetailValue[^>]*>(.*?)<\/span>/gis;

  let m;
  while ((m = valueRegex.exec(td)) !== null) {
    const value = cleanText(m[1]);
    if (value) values.push(value);
  }

  if (values.length === 0) {
    const text = cleanText(td);
    return text || null;
  }

  return values.length === 1 ? values[0] : values;
}

function extractMessagePanel(xml) {
  const m = xml.match(/<update id="dsl:messagePanel"><!\[CDATA\[([\s\S]*?)\]\]><\/update>/i);
  if (!m) return null;
  const withoutScripts = m[1].replace(/<script[\s\S]*?<\/script>/gi, " ");
  const text = cleanText(withoutScripts);
  return text || null;
}

function parseRateField(value) {
  if (!value) return null;
  const text = Array.isArray(value) ? value.join(" ") : value;
  const us = text.match(/US\s*=\s*(\d+)/i);
  const ds = text.match(/DS\s*=\s*(\d+)/i);
  return {
    us: us ? Number(us[1]) : null,
    ds: ds ? Number(ds[1]) : null
  };
}

function extractChartSeries(xml, label) {
  const datasetRegex = new RegExp(`"label":"${label}".*?"data":\\[(.*?)\\]`, "s");
  const dataset = xml.match(datasetRegex);
  if (!dataset) return [];

  const data = dataset[1];
  const pointRegex = /\{x:\s*'([^']+)'\s*,\s*y:\s*(\d+)\}/g;
  const points = [];

  let point;
  while ((point = pointRegex.exec(data)) !== null) {
    points.push({ date: point[1], value: Number(point[2]) });
  }

  return points;
}

function cleanText(text) {
  return text
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
